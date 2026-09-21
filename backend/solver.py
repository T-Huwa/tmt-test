import collections
from ortools.sat.python import cp_model


def solve(data, time_limit=120):
    days = data['days']
    periods = range(1, data['periods'] + 1)
    starts = {1: list(periods), 2: data['double_starts']}
    teacher = {(l['class'], l['subject']): l['teacher'] for l in data['lessons']}

    m = cp_model.CpModel()
    y = {}
    for l in data['lessons']:
        c, s, L = l['class'], l['subject'], l['length']
        keys = []
        for d in range(len(days)):
            for p in starts[L]:
                if any(r['subject'] == s and p + L - 1 > r['max_period'] for r in data['hard_rules']):
                    continue
                y[c, s, L, d, p] = m.NewBoolVar('')
                keys.append((c, s, L, d, p))
        m.Add(sum(y[k] for k in keys) == l['count'])

    class_cover = collections.defaultdict(list)
    teacher_cover = collections.defaultdict(list)
    for (c, s, L, d, q), v in y.items():
        for p in range(q, q + L):
            class_cover[c, d, p].append(v)
            teacher_cover[teacher[c, s], d, p].append(v)

    for cover in class_cover.values():
        m.Add(sum(cover) == 1)
    for cover in teacher_cover.values():
        m.Add(sum(cover) <= 1)

    if data['one_lesson_per_subject_per_day']:
        per_day = collections.defaultdict(list)
        for (c, s, L, d, q), v in y.items():
            per_day[c, s, d].append(v)
        for v in per_day.values():
            m.Add(sum(v) <= 1)

    penalties = []
    for (c, s, L, d, q), v in y.items():
        for r in data['soft_rules']:
            if r['subject'] != s or c not in r.get('classes', data['classes']):
                continue
            hits = len([p for p in range(q, q + L) if p in r.get('avoid_periods', [])])
            if d in r.get('avoid_days', []):
                hits += L
            if hits:
                penalties.append(r['weight'] * hits * v)
    m.Minimize(sum(penalties))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_workers = 8
    status = solver.Solve(m)

    rows = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for (c, s, L, d, q), v in sorted(y.items(), key=lambda x: (x[0][3], x[0][0], x[0][4])):
            if solver.Value(v):
                rows.append({'day': days[d], 'class': c, 'period': q, 'length': L, 'subject': s, 'teacher': teacher[c, s]})
    return solver.StatusName(status), rows
