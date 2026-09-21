import collections
import json

from db import PALETTE, query, tx


def school():
    s = query('select * from school')[0]
    return {'name': s['name'], 'days': json.loads(s['days']), 'one_per_day': bool(s['one_per_day'])}


def layout():
    info = school()
    bells, breaks_after, break_names, break_times = [], [], [], []
    for b in query('select * from bell_times order by position'):
        if b['kind'] == 'period':
            bells.append(f"{b['start']}-{b['end']}")
        else:
            breaks_after.append(len(bells))
            break_names.append(b['name'])
            break_times.append(f"{b['start']}-{b['end']}")
    return {
        'school': info['name'],
        'days': info['days'],
        'bells': bells,
        'breaks_after': breaks_after,
        'break_names': break_names,
        'break_times': break_times,
        'classes': [c['name'] for c in query('select name from classes order by name')],
        'teachers': {t['short']: t['name'] for t in query('select * from teachers order by id')},
        'colors': {x['name']: x['color'] for x in query('select * from subjects')},
    }


def build_data():
    lay = layout()
    n = len(lay['bells'])
    lessons = query(
        'select c.name as class, s.name as subject, t.short as teacher, l.length, l.count '
        'from lessons l join classes c on c.id = l.class_id join subjects s on s.id = l.subject_id '
        'join teachers t on t.id = l.teacher_id order by l.id'
    )
    hard, soft = [], []
    for r in query('select r.*, s.name as subject from rules r join subjects s on s.id = r.subject_id order by r.id'):
        classes = json.loads(r['classes'])
        periods = json.loads(r['avoid_periods'])
        days = json.loads(r['avoid_days'])
        if r['kind'] == 'hard':
            hard.append({'subject': r['subject'], 'max_period': r['max_period']})
        else:
            item = {'subject': r['subject'], 'weight': r['weight']}
            if classes:
                item['classes'] = classes
            if periods:
                item['avoid_periods'] = periods
            if days:
                item['avoid_days'] = [lay['days'].index(d) for d in days if d in lay['days']]
            soft.append(item)
    return {
        'days': lay['days'],
        'periods': n,
        'bells': lay['bells'],
        'breaks_after': lay['breaks_after'],
        'break_names': lay['break_names'],
        'double_starts': [p for p in range(1, n) if p not in lay['breaks_after']],
        'classes': lay['classes'],
        'teachers': lay['teachers'],
        'lessons': lessons,
        'one_lesson_per_subject_per_day': school()['one_per_day'],
        'hard_rules': hard,
        'soft_rules': soft,
    }


def validate():
    d = build_data()
    errors, warnings = [], []
    n, days = len(d['bells']), len(d['days'])
    slots = n * days
    if not n:
        errors.append('No periods are defined in the bell times')
    if not days:
        errors.append('No school days are selected')
    if not d['classes']:
        errors.append('There are no classes')
    if not d['lessons']:
        errors.append('There are no lessons')
    if len(set(d['breaks_after'])) != len(d['breaks_after']):
        errors.append('Two breaks follow the same period')
    if 0 in d['breaks_after']:
        errors.append('A break comes before the first period')
    class_total = collections.Counter()
    teacher_total = collections.Counter()
    subject_lessons = collections.Counter()
    for l in d['lessons']:
        class_total[l['class']] += l['length'] * l['count']
        teacher_total[l['teacher']] += l['length'] * l['count']
        subject_lessons[l['class'], l['subject']] += l['count']
        if l['length'] == 2 and not d['double_starts']:
            errors.append(f"{l['class']} {l['subject']} has double lessons but no two periods are side by side")
    for c in d['classes']:
        if class_total[c] != slots:
            errors.append(f'Class {c} has {class_total[c]} periods but needs exactly {slots}')
    for t, total in teacher_total.items():
        if total > slots:
            errors.append(f"Teacher {d['teachers'][t]} has {total} periods but only {slots} slots exist")
    if d['one_lesson_per_subject_per_day']:
        for (c, s), count in subject_lessons.items():
            if count > days:
                errors.append(f'Class {c} has {count} {s} lessons but only {days} days')
    return errors, warnings


def summary():
    d = build_data()
    slots = len(d['bells']) * len(d['days'])
    class_total = collections.Counter()
    teacher_total = collections.Counter()
    for l in d['lessons']:
        class_total[l['class']] += l['length'] * l['count']
        teacher_total[l['teacher']] += l['length'] * l['count']
    return {
        'slots': slots,
        'classes': [{'name': c, 'total': class_total[c]} for c in d['classes']],
        'teachers': [{'short': s, 'name': n, 'total': teacher_total[s]} for s, n in d['teachers'].items()],
    }


def save_run(status, rows):
    with tx() as c:
        run_id = c.execute('insert into runs (status) values (?)', (status,)).lastrowid
        c.executemany(
            'insert into timetable (run_id, day, class, period, length, subject, teacher) values (?, ?, ?, ?, ?, ?, ?)',
            [(run_id, r['day'], r['class'], r['period'], r['length'], r['subject'], r['teacher']) for r in rows],
        )
    return run_id


def run_payload(run_id):
    rows = query('select day, class, period, length, subject, teacher from timetable where run_id = ? order by rowid', (run_id,))
    return dict(layout(), rows=rows)


def import_json(data):
    with tx() as c:
        for table in ('lessons', 'rules', 'bell_times', 'classes', 'teachers', 'subjects'):
            c.execute(f'delete from {table}')
        days = data['days']
        c.execute('update school set days = ?, one_per_day = ?', (json.dumps(days), int(data.get('one_lesson_per_subject_per_day', True))))
        bells = data['bells']
        after = data['breaks_after']
        names = data.get('break_names', [])
        position = 0
        for i, b in enumerate(bells, 1):
            start, end = b.split('-')
            c.execute('insert into bell_times (position, kind, name, start, end) values (?, ?, ?, ?, ?)', (position, 'period', f'Period {i}', start, end))
            position += 1
            if i in after and i < len(bells):
                k = after.index(i)
                name = names[k] if k < len(names) else 'Break'
                c.execute('insert into bell_times (position, kind, name, start, end) values (?, ?, ?, ?, ?)', (position, 'break', name, end, bells[i].split('-')[0]))
                position += 1
        for name in data['classes']:
            c.execute('insert into classes (name, label) values (?, ?)', (name, ''))
        for short, name in data['teachers'].items():
            c.execute('insert into teachers (name, short) values (?, ?)', (name, short))
        subjects = []
        for l in data['lessons']:
            if l['subject'] not in subjects:
                subjects.append(l['subject'])
        for i, name in enumerate(subjects):
            c.execute('insert into subjects (name, short, color) values (?, ?, ?)', (name, name[:3].upper(), PALETTE[i % len(PALETTE)]))
        ids = {}
        for table in ('classes', 'subjects'):
            ids[table] = {r['name']: r['id'] for r in c.execute(f'select id, name from {table}')}
        ids['teachers'] = {r['short']: r['id'] for r in c.execute('select id, short from teachers')}
        for l in data['lessons']:
            c.execute(
                'insert into lessons (class_id, subject_id, teacher_id, length, count) values (?, ?, ?, ?, ?)',
                (ids['classes'][l['class']], ids['subjects'][l['subject']], ids['teachers'][l['teacher']], l['length'], l['count']),
            )
        for r in data.get('hard_rules', []):
            if r['subject'] in ids['subjects']:
                c.execute(
                    'insert into rules (kind, subject_id, classes, max_period, avoid_periods, avoid_days, weight) values (?, ?, ?, ?, ?, ?, ?)',
                    ('hard', ids['subjects'][r['subject']], '[]', r['max_period'], '[]', '[]', 0),
                )
        for r in data.get('soft_rules', []):
            if r['subject'] in ids['subjects']:
                c.execute(
                    'insert into rules (kind, subject_id, classes, max_period, avoid_periods, avoid_days, weight) values (?, ?, ?, ?, ?, ?, ?)',
                    (
                        'soft',
                        ids['subjects'][r['subject']],
                        json.dumps(r.get('classes', [])),
                        None,
                        json.dumps(r.get('avoid_periods', [])),
                        json.dumps([days[i] for i in r.get('avoid_days', [])]),
                        r['weight'],
                    ),
                )
