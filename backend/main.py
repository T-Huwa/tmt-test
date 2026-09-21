import json
import sqlite3

from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import data
import excelio
from db import DAYS, PALETTE, execute, init, query, tx
from solver import solve

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])
init()


def crud(path, table, fields):
    columns = ', '.join(fields)
    marks = ', '.join('?' * len(fields))

    def values(body):
        vals = [str(body.get(f, '')).strip() for f in fields]
        if not vals[0]:
            raise HTTPException(400, 'Name is required')
        return vals

    def read():
        return query(f'select * from {table} order by id')

    def create(body: dict):
        vals = values(body)
        if table == 'subjects' and not vals[2]:
            vals[2] = PALETTE[query('select count(*) as n from subjects')[0]['n'] % len(PALETTE)]
        try:
            return {'id': execute(f'insert into {table} ({columns}) values ({marks})', vals)}
        except sqlite3.IntegrityError:
            raise HTTPException(400, 'That name or code already exists')

    def update(item_id: int, body: dict):
        sets = ', '.join(f'{f} = ?' for f in fields)
        try:
            execute(f'update {table} set {sets} where id = ?', values(body) + [item_id])
        except sqlite3.IntegrityError:
            raise HTTPException(400, 'That name or code already exists')
        return {'ok': True}

    def remove(item_id: int):
        execute(f'delete from {table} where id = ?', (item_id,))
        return {'ok': True}

    app.add_api_route(f'/{path}', read, methods=['GET'], name=f'{path}_read')
    app.add_api_route(f'/{path}', create, methods=['POST'], name=f'{path}_create')
    app.add_api_route(f'/{path}/{{item_id}}', update, methods=['PUT'], name=f'{path}_update')
    app.add_api_route(f'/{path}/{{item_id}}', remove, methods=['DELETE'], name=f'{path}_remove')


crud('teachers', 'teachers', ['name', 'short'])
crud('subjects', 'subjects', ['name', 'short', 'color'])
crud('classes', 'classes', ['name', 'label'])


@app.get('/school')
def read_school():
    return data.school()


@app.put('/school')
def update_school(body: dict):
    days = [d for d in DAYS + ['Saturday', 'Sunday'] if d in body.get('days', [])]
    execute('update school set name = ?, days = ?, one_per_day = ?', (body['name'], json.dumps(days), int(bool(body.get('one_per_day', True)))))
    return {'ok': True}


@app.get('/bell-times')
def read_bell_times():
    return query('select * from bell_times order by position')


@app.put('/bell-times')
def update_bell_times(body: list):
    for b in body:
        if b.get('kind') not in ('period', 'break') or not b.get('start') or not b.get('end'):
            raise HTTPException(400, 'Every row needs a type, a start and an end time')
        if b['start'] >= b['end']:
            raise HTTPException(400, f"Start must be before end ({b['start']}-{b['end']})")
    with tx() as c:
        c.execute('delete from bell_times')
        for i, b in enumerate(body):
            c.execute(
                'insert into bell_times (position, kind, name, start, end) values (?, ?, ?, ?, ?)',
                (i, b['kind'], b.get('name', ''), b['start'], b['end']),
            )
    return {'ok': True}


LESSON_SELECT = (
    'select l.id, l.class_id, c.name as class, l.subject_id, s.name as subject, l.teacher_id, t.name as teacher, '
    't.short as teacher_short, l.length, l.count from lessons l join classes c on c.id = l.class_id '
    'join subjects s on s.id = l.subject_id join teachers t on t.id = l.teacher_id order by c.name, l.id'
)


def check_lesson(length, count):
    if length not in (1, 2):
        raise HTTPException(400, 'Length must be 1 or 2')
    if count < 1:
        raise HTTPException(400, 'Lessons per week must be at least 1')


@app.get('/lessons')
def read_lessons():
    return query(LESSON_SELECT)


@app.post('/lessons')
def create_lesson(body: dict):
    check_lesson(int(body['length']), int(body['count']))
    return {'id': execute(
        'insert into lessons (class_id, subject_id, teacher_id, length, count) values (?, ?, ?, ?, ?)',
        (body['class_id'], body['subject_id'], body['teacher_id'], int(body['length']), int(body['count'])),
    )}


@app.post('/lessons/pattern')
def create_lessons_from_pattern(body: dict):
    try:
        lengths = [int(x) for x in str(body['pattern']).split('+')]
    except ValueError:
        raise HTTPException(400, 'Pattern must look like 2+2+1')
    for length in lengths:
        check_lesson(length, 1)
    with tx() as c:
        c.execute('delete from lessons where class_id = ? and subject_id = ?', (body['class_id'], body['subject_id']))
        for length in sorted(set(lengths), reverse=True):
            c.execute(
                'insert into lessons (class_id, subject_id, teacher_id, length, count) values (?, ?, ?, ?, ?)',
                (body['class_id'], body['subject_id'], body['teacher_id'], length, lengths.count(length)),
            )
    return {'ok': True}


@app.put('/lessons/{lesson_id}')
def update_lesson(lesson_id: int, body: dict):
    check_lesson(int(body['length']), int(body['count']))
    execute('update lessons set teacher_id = ?, length = ?, count = ? where id = ?', (body['teacher_id'], int(body['length']), int(body['count']), lesson_id))
    return {'ok': True}


@app.delete('/lessons/{lesson_id}')
def delete_lesson(lesson_id: int):
    execute('delete from lessons where id = ?', (lesson_id,))
    return {'ok': True}


def rule_view(r):
    return dict(r, classes=json.loads(r['classes']), avoid_periods=json.loads(r['avoid_periods']), avoid_days=json.loads(r['avoid_days']))


@app.get('/rules')
def read_rules():
    return [rule_view(r) for r in query('select r.*, s.name as subject from rules r join subjects s on s.id = r.subject_id order by r.id')]


@app.post('/rules')
def create_rule(body: dict):
    hard = body.get('max_period') not in (None, '')
    periods = [int(p) for p in body.get('avoid_periods', [])]
    days = body.get('avoid_days', [])
    if not hard and not periods and not days:
        raise HTTPException(400, 'Set a latest period, periods to avoid or days to avoid')
    return {'id': execute(
        'insert into rules (kind, subject_id, classes, max_period, avoid_periods, avoid_days, weight) values (?, ?, ?, ?, ?, ?, ?)',
        ('hard' if hard else 'soft', body['subject_id'], json.dumps(body.get('classes', [])), int(body['max_period']) if hard else None,
         json.dumps(periods), json.dumps(days), int(body.get('weight') or 10)),
    )}


@app.delete('/rules/{rule_id}')
def delete_rule(rule_id: int):
    execute('delete from rules where id = ?', (rule_id,))
    return {'ok': True}


@app.get('/summary')
def read_summary():
    return data.summary()


@app.post('/validate')
def run_validate():
    errors, warnings = data.validate()
    return {'errors': errors, 'warnings': warnings}


@app.post('/solve')
def run_solver():
    errors, _ = data.validate()
    if errors:
        raise HTTPException(400, {'errors': errors})
    status, rows = solve(data.build_data())
    return {'status': status, 'run_id': data.save_run(status, rows) if rows else None}


@app.get('/runs')
def read_runs():
    return query('select r.id, r.created, r.status, (select count(*) from timetable t where t.run_id = r.id) as rows from runs r order by r.id desc')


@app.get('/runs/{run_id}')
def read_run(run_id: int):
    if not query('select 1 from runs where id = ?', (run_id,)):
        raise HTTPException(404, 'Run not found')
    return data.run_payload(run_id)


@app.delete('/runs/{run_id}')
def delete_run(run_id: int):
    execute('delete from runs where id = ?', (run_id,))
    return {'ok': True}


@app.post('/import/json')
def import_json(file: UploadFile = File(...)):
    try:
        data.import_json(json.load(file.file))
    except ValueError:
        raise HTTPException(400, 'File is not valid JSON')
    except (KeyError, TypeError, AttributeError) as e:
        raise HTTPException(400, f'Invalid data: {e}')
    return {'ok': True}


@app.get('/export/json')
def export_json():
    return data.build_data()


@app.get('/export/excel/{kind}')
def export_excel(kind: str):
    if kind not in excelio.KINDS:
        raise HTTPException(404, 'Unknown export')
    return Response(
        excelio.export_workbook(kind),
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': f'attachment; filename={kind}.xlsx'},
    )


@app.post('/import/preview')
def import_preview(file: UploadFile = File(None), text: str = Form('')):
    try:
        rows = excelio.read_file(file.filename, file.file.read()) if file else excelio.read_text(text)
    except Exception:
        raise HTTPException(400, 'Could not read that file')
    rows = [r for r in rows if any(str(x).strip() for x in r)]
    if not rows:
        raise HTTPException(400, 'No data found')
    return {'rows': rows}


def parsed(body):
    if body['kind'] not in excelio.KINDS:
        raise HTTPException(400, 'Unknown data type')
    try:
        return excelio.parse(body['kind'], body['rows'], body['header'], body['mapping'])
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post('/import/check')
def import_check(body: dict):
    items, errors = parsed(body)
    return {'errors': errors, 'count': len(items), 'sync': excelio.unmatched(body['kind'], items)}


@app.post('/import/commit')
def import_commit(body: dict):
    items, errors = parsed(body)
    result = excelio.commit(body['kind'], items, body.get('decisions', {}))
    return dict(result, skipped=errors)
