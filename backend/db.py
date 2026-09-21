import json
import os
import sqlite3
from contextlib import contextmanager

PATH = os.environ.get('TIMETABLE_DB', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'timetable.db'))
DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
PALETTE = ['#F8CBAD', '#FFE699', '#C6E0B4', '#BDD7EE', '#D9D2E9', '#F4B6C2', '#B7DEE8', '#E2EFDA', '#FCE4D6', '#DDEBF7', '#FFF2CC', '#D0CECE', '#E4DFEC']

SCHEMA = '''
create table if not exists school (id integer primary key check (id = 1), name text, days text, one_per_day integer);
create table if not exists bell_times (id integer primary key autoincrement, position integer, kind text, name text, start text, end text);
create table if not exists subjects (id integer primary key autoincrement, name text unique, short text, color text);
create table if not exists teachers (id integer primary key autoincrement, name text unique, short text unique);
create table if not exists classes (id integer primary key autoincrement, name text unique, label text);
create table if not exists lessons (
    id integer primary key autoincrement,
    class_id integer references classes(id) on delete cascade,
    subject_id integer references subjects(id) on delete cascade,
    teacher_id integer references teachers(id) on delete cascade,
    length integer,
    count integer
);
create table if not exists rules (
    id integer primary key autoincrement,
    kind text,
    subject_id integer references subjects(id) on delete cascade,
    classes text,
    max_period integer,
    avoid_periods text,
    avoid_days text,
    weight integer
);
create table if not exists runs (id integer primary key autoincrement, created text default current_timestamp, status text);
create table if not exists timetable (
    run_id integer references runs(id) on delete cascade,
    day text, class text, period integer, length integer, subject text, teacher text
);
'''


def connect():
    c = sqlite3.connect(PATH)
    c.row_factory = sqlite3.Row
    c.execute('pragma foreign_keys = on')
    return c


@contextmanager
def tx():
    c = connect()
    try:
        yield c
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()


def init():
    with tx() as c:
        c.executescript(SCHEMA)
        if not c.execute('select 1 from school').fetchone():
            c.execute('insert into school (id, name, days, one_per_day) values (1, ?, ?, 1)', ('Phwezi Secondary Schools', json.dumps(DAYS)))


def query(sql, args=()):
    with tx() as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def execute(sql, args=()):
    with tx() as c:
        return c.execute(sql, args).lastrowid
