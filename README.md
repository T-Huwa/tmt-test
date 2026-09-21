# Timetable app

A school timetable generator. You enter bell times, subjects, teachers, classes and lessons (or import them from Excel, CSV or JSON). The backend solves the timetable with Google OR-Tools (CP-SAT) and stores it in SQLite. The frontend shows it as master, per-class and per-teacher timetables.

- Backend: Python, FastAPI, SQLite, OR-Tools, openpyxl
- Frontend: React 18 and Vite (no router, no state library)

## Quick start

### Backend

```
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs on http://localhost:8000. The database file `backend/timetable.db` is created on first start. Set the `TIMETABLE_DB` environment variable to use another file.

### Frontend (pnpm)

Install pnpm once (either way works):

```
npm install -g pnpm
```
or
```
corepack enable
```

Then:

```
cd frontend
pnpm install
pnpm dev
```

The app runs on http://localhost:5173. Other commands:

```
pnpm build          # production build into dist/
pnpm add <package>  # add a dependency
pnpm add -D <package>  # add a dev dependency
```

Notes on pnpm:
- `pnpm-lock.yaml` is committed. If you switch from npm, delete `node_modules` and `package-lock.json` first.
- pnpm blocks install scripts by default, and Vite's esbuild needs one. This is already allowed in `pnpm-workspace.yaml` (newer pnpm versions) and in the `pnpm` field of `package.json` (older ones). You do not need to run `pnpm approve-builds`.

### First use

Open the Import page and load `phwezi_data.json` with Import JSON. That fills in the bell times, teachers, subjects, classes, lessons and rules. Then open Generate and click Generate timetable.

The API address the frontend calls is the constant `API` in `frontend/src/api.js` (`http://localhost:8000`). Change it there when you deploy. CORS is open to every origin in `backend/main.py`, so tighten that too.

## Project layout

```
timetable-app/
  phwezi_data.json          sample data in the solver's JSON format
  backend/
    main.py                 FastAPI app: all HTTP endpoints
    db.py                   SQLite schema and connection helpers
    data.py                 reads the tables, builds solver input, validates, saves runs
    solver.py               the OR-Tools CP-SAT model
    excelio.py              Excel / CSV / paste import wizard logic and Excel export
    requirements.txt
  frontend/
    src/
      main.jsx              React entry
      App.jsx               sidebar and page switching
      api.js                fetch wrapper and API address
      School.jsx            school name, days, one-lesson-per-day option
      BellTimes.jsx         periods and breaks editor and generator
      Crud.jsx              generic table for subjects, teachers, classes
      Lessons.jsx           lessons per class, pattern input
      Rules.jsx             hard and soft rules
      ImportPage.jsx        the import wizard
      Generate.jsx          validate, then solve
      TimetablePage.jsx     run picker and the three timetable views
      Views.jsx             Master, ClassView, TeacherView
      Grid.jsx              the timetable table with breaks and colours
      index.css
```

## How it works, end to end

```
 Import / edit pages  --->  SQLite tables  --->  build_data()  --->  solve()  --->  timetable table
   (frontend)                  (db.py)           (data.py)        (solver.py)         (a "run")
                                                                                          |
                                     Timetable page  <---  GET /runs/{id}  <--------------+
```

1. The user creates data through the pages or the import wizard. Everything is stored in SQLite.
2. `POST /solve` runs `data.validate()`. If it finds problems it returns them as a 400 and does not solve.
3. `data.build_data()` reads the tables and produces one dictionary (the "solver JSON", described below).
4. `solver.solve(data)` builds and solves the CP-SAT model and returns a status and a list of rows.
5. `data.save_run()` writes a new row in `runs` and the timetable rows in `timetable`. The response contains the run id.
6. The Timetable page calls `GET /runs/{id}`, which returns the rows plus the layout (bell times, breaks, classes, teachers, colours), and renders it.

The JSON file is no longer something you write by hand. `GET /export/json` builds it from the tables, and `POST /import/json` loads it into the tables.

## Database (backend/db.py)

| Table | Columns | Notes |
| --- | --- | --- |
| `school` | id (always 1), name, days (JSON list), one_per_day | one row |
| `bell_times` | id, position, kind (`period` or `break`), name, start, end | ordered by `position`; periods are numbered by their order |
| `subjects` | id, name (unique), short, color | color is a hex string |
| `teachers` | id, name (unique), short (unique) | `short` is the code shown in timetables |
| `classes` | id, name (unique), label | for example `1B`, label `Form 1 Boys` |
| `lessons` | id, class_id, subject_id, teacher_id, length, count | length is 1 (single) or 2 (double); count is lessons per week |
| `rules` | id, kind (`hard` or `soft`), subject_id, classes (JSON), max_period, avoid_periods (JSON), avoid_days (JSON), weight | see Rules below |
| `runs` | id, created, status | one per solve |
| `timetable` | run_id, day, class, period, length, subject, teacher | the result; names are stored as text |

Foreign keys are switched on for every connection, so deleting a teacher, class or subject also deletes its lessons and rules, and deleting a run deletes its timetable rows.

Helpers in `db.py`:
- `tx()`: a context manager that opens a connection, commits on success, rolls back on error and always closes.
- `query(sql, args)`: returns a list of dicts.
- `execute(sql, args)`: runs a statement and returns the last row id.
- `init()`: creates the tables and the single `school` row. It runs when `main.py` is imported.

## The lesson model

A lesson row means: "class C has N lessons of subject S, each L periods long, taught by teacher T".

`2+2+1` is a notation for the lessons page and the importer. It becomes two rows: length 2 with count 2, and length 1 with count 1. A class must have exactly as many periods as the week has slots (periods per day times school days). English in a class with `2+2+1+1+1` has 5 lessons, that is 7 periods.

## The solver JSON (what build_data returns)

```
{
  "days": ["Monday", ...],
  "periods": 10,
  "bells": ["07:00-07:40", ...],           one entry per period
  "breaks_after": [3, 5, 7],               a break follows periods 3, 5 and 7
  "break_names": ["Tea Break", ...],
  "double_starts": [1, 2, 4, 6, 8, 9],     periods where a double lesson may start
  "classes": ["1B", "1G", ...],
  "teachers": {"B1": "R.G. CHENJE", ...},  code -> name
  "lessons": [{"class": "1B", "subject": "English", "teacher": "B1", "length": 2, "count": 2}, ...],
  "one_lesson_per_subject_per_day": true,
  "hard_rules": [{"subject": "Mathematics", "max_period": 7}],
  "soft_rules": [
    {"subject": "Computer Studies", "avoid_periods": [7, 8], "weight": 10},
    {"subject": "Computer Studies", "avoid_days": [4], "weight": 10},
    {"subject": "French", "classes": ["3B", "3G", "4B", "4G"], "avoid_periods": [7], "weight": 50}
  ]
}
```

Two values are derived, not typed in:
- `breaks_after` and `break_names` come from where the break rows sit among the period rows in `bell_times`.
- `double_starts` is every period that is not the last before a break and not the last period of the day. A double lesson therefore never spans a break.

`avoid_days` in this JSON is a list of day indexes (0 is Monday). The database stores day names, and `build_data` converts them.

## The solver model (backend/solver.py)

`solve(data, time_limit=120)` returns `(status, rows)`.

Variables: one yes/no variable `y[class, subject, length, day, start]` for every allowed start of every lesson type. Because lessons of the same class, subject and length are interchangeable, the variable means "one lesson of this type starts here", and there is no per-lesson identity.

Allowed starts: any period for singles, `double_starts` for doubles. Hard rules remove variables that would break them (for example a Mathematics lesson that would end after `max_period`).

Constraints:
1. Count: for each lesson type, the variables sum to `count`.
2. Classes: for each class, day and period, exactly one lesson covers it (no free slots, no overlaps). A double covers its start and the next period.
3. Teachers: for each teacher, day and period, at most one lesson covers it.
4. One per day (if enabled): for each class, subject and day, at most one lesson starts.

Objective: minimise the sum of soft-rule penalties. For a lesson variable that is chosen, each matching soft rule adds `weight` times the number of its periods that fall in `avoid_periods`, plus `length` if the day is in `avoid_days`. A rule with a `classes` list only applies to those classes. A penalty of zero means every preference was met.

Result: status is the OR-Tools status name (`OPTIMAL`, `FEASIBLE`, `INFEASIBLE`...). `rows` is a list of `{day, class, period, length, subject, teacher}` for each chosen start.

`POST /solve` blocks until the solver finishes or the time limit passes. The endpoint is a plain `def`, so FastAPI runs it in a worker thread and other requests still work.

## Validation (data.validate)

Run before every solve. Errors stop the solve:
- no periods, no school days, no classes or no lessons
- two breaks after the same period, or a break before the first period
- a class whose periods do not add up to exactly periods per day times days
- a teacher with more periods than the week has slots
- a subject with more lessons in a class than days (when one per day is on)
- double lessons when no two periods are side by side

## Rules

A rule row is one of two kinds:
- Hard: `max_period` is set. The subject must finish by that period. It is enforced by removing variables.
- Soft: `avoid_periods` and/or `avoid_days` with a `weight`. It only adds a penalty.

The Rules page sets `kind` from what you fill in: a latest period makes a hard rule, otherwise a soft one.

## Import wizard (backend/excelio.py and frontend/src/ImportPage.jsx)

The backend is stateless. The frontend keeps the parsed rows and sends them back on each step.

1. `POST /import/preview` takes pasted text (`text` form field) or an uploaded `.xlsx` or `.csv` file. It returns `{rows}` as a list of lists. Pasted text is split on tabs, or on commas when there are no tabs.
2. The frontend guesses what each column means from the header text (`guess` and `guessMapping` in `ImportPage.jsx`) and lets the user change it. Column meanings per data type:
   - lessons: class, teacher, subject, length, count (lessons per week), pattern (like `2+2+1`)
   - teachers and subjects: name, short
   - classes: name, label
3. `POST /import/check` takes `{kind, header, rows, mapping}`. `excelio.parse` turns the rows into items and collects row errors (empty cells, bad numbers, length not 1 or 2). `excelio.unmatched` returns every name that does not exactly match an existing teacher, class or subject, with a `suggest_id` when a close match exists. A name is a close match when the two names have a similarity of at least 0.8 after removing punctuation, spaces and case (`R.G CHENJE` matches `R.G. CHENJE`).
4. The user picks, for each unmatched name, "Add as new" or "Link to" an existing item. The suggestion is pre-selected.
5. `POST /import/commit` takes the same body plus `decisions`: `{teachers: {"R.G CHENJE": {"action": "link", "id": 1}}, ...}`. `excelio.commit` runs in one transaction:
   - exact name match: use the existing item
   - decision `link`: use the chosen item
   - otherwise: create it. New teachers get a code from their initials and a number if the code is taken. New subjects get the first three letters and the next colour in the palette.
   - lessons are upserted by class, subject and length: an existing lesson gets the new teacher and count, otherwise a new one is added.
   - rows with errors are skipped and returned in `skipped`.

Other import and export endpoints: `POST /import/json` replaces all data from a solver JSON file (`data.import_json`), `GET /export/json` returns the solver JSON, and `GET /export/excel/{kind}` downloads an `.xlsx` in the same column layout the wizard reads.

## API reference

| Method and path | Purpose |
| --- | --- |
| `GET/PUT /school` | name, days, one_per_day |
| `GET/PUT /bell-times` | list of rows; PUT replaces the whole list |
| `GET/POST /teachers`, `PUT/DELETE /teachers/{id}` | teachers |
| `GET/POST /subjects`, `PUT/DELETE /subjects/{id}` | subjects |
| `GET/POST /classes`, `PUT/DELETE /classes/{id}` | classes |
| `GET /lessons`, `POST /lessons`, `PUT/DELETE /lessons/{id}` | lessons with names joined in |
| `POST /lessons/pattern` | body `{class_id, subject_id, teacher_id, pattern}`; replaces that subject's lessons in the class |
| `GET/POST /rules`, `DELETE /rules/{id}` | rules |
| `GET /summary` | slots per week, and each class and teacher total |
| `POST /validate` | `{errors, warnings}` |
| `POST /solve` | validates, solves, saves a run; returns `{status, run_id}` |
| `GET /runs`, `GET /runs/{id}`, `DELETE /runs/{id}` | saved timetables |
| `POST /import/json`, `GET /export/json` | solver JSON in and out |
| `POST /import/preview`, `/import/check`, `/import/commit` | import wizard |
| `GET /export/excel/{kind}` | `lessons`, `teachers`, `classes` or `subjects` |

The teachers, subjects and classes routes are generated by the `crud()` function in `main.py`. To add another simple table, call it with a path, a table name and a list of fields. The first field is required.

## Frontend

`App.jsx` holds two pieces of state: the current page and the last run id. There is no router. A sidebar button sets the page, and `Generate` calls `onDone(run_id)`, which switches to the Timetable page.

Every page loads its own data with `api()` from `api.js`, keeps it in local state, and reloads after each change. `api()` sends JSON (or `FormData` for uploads) and throws an `Error` with the server's message, so pages show `error.message` directly.

The timetable rendering is split in two:
- `Grid.jsx` draws one table. Its props are `title`, `corner` (the top-left header), `lines` and `result`, `colors`. Each line is `{label, cells}`, and `cells` maps a start period to `{length, top, bottom, subject}`. A double lesson gets `colSpan=2`. After the periods that precede a break, the first row adds one grey cell with `rowSpan` covering all rows, and the header gets a matching break column. Break names and times come from `result.break_names` and `result.break_times`.
- `Views.jsx` builds the `lines` for each view from `result.rows`:
  - `Master`: one grid per day, rows are classes, cells show subject and teacher code
  - `ClassView`: one grid per class, rows are days
  - `TeacherView`: one grid per teacher, rows are days, cells show subject and class, and the title shows the weekly load

Colours come from the subjects table through `result.colors`.

## Assumptions and limits

- Every teacher is free in every period. There is no teacher availability or room model yet.
- A double lesson never spans a break, and a lesson is 1 or 2 periods long.
- Old runs store the day, class, period, subject and teacher code as text, but the bell times, class list, teacher names and colours shown with a run come from the current data. Renaming a teacher code after a run makes that run's teacher view stop matching.
- There is no login. Anyone who can reach the API can change the data.
- Solving is synchronous. A very large school may need a background job and a status endpoint.

## Extending

- New soft rule: add a field to the `rules` table, return it from `read_rules`, include it in `build_data`, and add a penalty in the loop over `y.items()` in `solver.py`. Add the input to `Rules.jsx`.
- New hard constraint: add it in `solver.py` with `m.Add(...)`. If it can be checked cheaply, add a message to `data.validate` so users see the problem before solving.
- New import type: add it to `KINDS` and `entity_keys` in `excelio.py`, handle it in `parse_row` and `commit`, and add its column meanings to `MEANINGS` in `ImportPage.jsx`.
- Testing the backend without a server: set `TIMETABLE_DB` to a temporary file, then use `fastapi.testclient.TestClient(main.app)`.