import { useEffect, useState } from 'react'
import { api } from './api.js'

export default function Lessons() {
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [teachers, setTeachers] = useState([])
  const [lessons, setLessons] = useState([])
  const [summary, setSummary] = useState(null)
  const [cls, setCls] = useState('')
  const [form, setForm] = useState({ subject_id: '', teacher_id: '', pattern: '' })
  const [error, setError] = useState('')

  async function load() {
    const [c, s, t, l, sum] = await Promise.all([api('/classes'), api('/subjects'), api('/teachers'), api('/lessons'), api('/summary')])
    setClasses(c)
    setSubjects(s)
    setTeachers(t)
    setLessons(l)
    setSummary(sum)
    setCls(prev => prev || (c[0] ? String(c[0].id) : ''))
  }
  useEffect(() => { load().catch(e => setError(e.message)) }, [])

  async function run(fn) {
    setError('')
    try {
      await fn()
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  if (!classes.length) return <div><h2>Lessons</h2><p>Add classes first.</p></div>

  const mine = lessons.filter(l => String(l.class_id) === cls)
  const total = mine.reduce((a, l) => a + l.length * l.count, 0)
  const save = (l, patch) => run(() => api(`/lessons/${l.id}`, 'PUT', { ...l, ...patch }))

  return (
    <div>
      <h2>Lessons</h2>
      <select value={cls} onChange={e => setCls(e.target.value)}>
        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {summary && (
        <span className={total === summary.slots ? 'ok' : 'error'}> {total} of {summary.slots} periods</span>
      )}
      {error && <p className="error">{error}</p>}
      <table className="plain">
        <thead>
          <tr><th>Subject</th><th>Teacher</th><th>Length</th><th>Lessons per week</th><th></th></tr>
        </thead>
        <tbody>
          {mine.map(l => (
            <tr key={l.id}>
              <td>{l.subject}</td>
              <td>
                <select value={l.teacher_id} onChange={e => save(l, { teacher_id: Number(e.target.value) })}>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </td>
              <td>
                <select value={l.length} onChange={e => save(l, { length: Number(e.target.value) })}>
                  <option value={1}>1 (single)</option>
                  <option value={2}>2 (double)</option>
                </select>
              </td>
              <td><input type="number" min="1" value={l.count} onChange={e => save(l, { count: Number(e.target.value) })} /></td>
              <td><button onClick={() => run(() => api(`/lessons/${l.id}`, 'DELETE'))}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Add subject to {classes.find(c => String(c.id) === cls)?.name}</h3>
      <select value={form.subject_id} onChange={e => setForm({ ...form, subject_id: e.target.value })}>
        <option value="">Subject</option>
        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select value={form.teacher_id} onChange={e => setForm({ ...form, teacher_id: e.target.value })}>
        <option value="">Teacher</option>
        {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <input placeholder="Pattern e.g. 2+2+1" value={form.pattern} onChange={e => setForm({ ...form, pattern: e.target.value })} />
      <button onClick={() => run(async () => {
        await api('/lessons/pattern', 'POST', { class_id: Number(cls), subject_id: Number(form.subject_id), teacher_id: Number(form.teacher_id), pattern: form.pattern })
        setForm({ subject_id: '', teacher_id: '', pattern: '' })
      })}>Add</button>
      <p className="hint">Each number in the pattern is one lesson: 2 is a double, 1 is a single. Adding a subject that already exists replaces its lessons.</p>
    </div>
  )
}
