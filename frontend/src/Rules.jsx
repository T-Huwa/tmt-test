import { useEffect, useState } from 'react'
import { api } from './api.js'

const empty = { subject_id: '', classes: [], max_period: '', avoid_periods: '', avoid_days: [], weight: 10 }

export default function Rules() {
  const [rules, setRules] = useState([])
  const [subjects, setSubjects] = useState([])
  const [classes, setClasses] = useState([])
  const [days, setDays] = useState([])
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')

  async function load() {
    const [r, s, c, sc] = await Promise.all([api('/rules'), api('/subjects'), api('/classes'), api('/school')])
    setRules(r)
    setSubjects(s)
    setClasses(c)
    setDays(sc.days)
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

  const toggleDay = d => setForm({ ...form, avoid_days: form.avoid_days.includes(d) ? form.avoid_days.filter(x => x !== d) : [...form.avoid_days, d] })

  const describe = r =>
    r.kind === 'hard'
      ? `Must be in periods 1 to ${r.max_period}`
      : [r.avoid_periods.length ? `Avoid periods ${r.avoid_periods.join(', ')}` : '', r.avoid_days.length ? `Avoid ${r.avoid_days.join(', ')}` : '', `weight ${r.weight}`].filter(Boolean).join('; ')

  return (
    <div>
      <h2>Rules</h2>
      {error && <p className="error">{error}</p>}
      <table className="plain">
        <thead>
          <tr><th>Subject</th><th>Classes</th><th>Rule</th><th>Type</th><th></th></tr>
        </thead>
        <tbody>
          {rules.map(r => (
            <tr key={r.id}>
              <td>{r.subject}</td>
              <td>{r.classes.length ? r.classes.join(', ') : 'All'}</td>
              <td>{describe(r)}</td>
              <td>{r.kind === 'hard' ? 'Must' : 'Preferred'}</td>
              <td><button onClick={() => run(() => api(`/rules/${r.id}`, 'DELETE'))}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Add rule</h3>
      <p>
        <select value={form.subject_id} onChange={e => setForm({ ...form, subject_id: e.target.value })}>
          <option value="">Subject</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {' '}Classes (none selected means all){' '}
        <select multiple value={form.classes} onChange={e => setForm({ ...form, classes: [...e.target.selectedOptions].map(o => o.value) })}>
          {classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </p>
      <p>
        <label>Latest period allowed (a must) <input type="number" value={form.max_period} onChange={e => setForm({ ...form, max_period: e.target.value })} /></label>
      </p>
      <p>
        <label>Periods to avoid (e.g. 7,8) <input value={form.avoid_periods} onChange={e => setForm({ ...form, avoid_periods: e.target.value })} /></label>
      </p>
      <p>
        Days to avoid:{' '}
        {days.map(d => (
          <label key={d} className="inline">
            <input type="checkbox" checked={form.avoid_days.includes(d)} onChange={() => toggleDay(d)} /> {d}
          </label>
        ))}
      </p>
      <p>
        <label>Weight for preferences (higher matters more) <input type="number" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} /></label>
      </p>
      <button onClick={() => run(async () => {
        await api('/rules', 'POST', {
          ...form,
          subject_id: Number(form.subject_id),
          avoid_periods: form.avoid_periods.split(',').map(x => x.trim()).filter(Boolean).map(Number),
        })
        setForm(empty)
      })}>Add rule</button>
    </div>
  )
}
