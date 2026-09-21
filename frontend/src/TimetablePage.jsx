import { useEffect, useState } from 'react'
import { api } from './api.js'
import { ClassView, Master, TeacherView } from './Views.jsx'

const TABS = [['master', 'Master'], ['class', 'Classes'], ['teacher', 'Teachers']]

export default function TimetablePage({ runId }) {
  const [runs, setRuns] = useState([])
  const [selected, setSelected] = useState(runId)
  const [result, setResult] = useState(null)
  const [tab, setTab] = useState('master')
  const [error, setError] = useState('')

  const loadRuns = () => api('/runs').then(r => {
    setRuns(r)
    setSelected(prev => prev || (r[0] ? r[0].id : null))
  })
  useEffect(() => { loadRuns().catch(e => setError(e.message)) }, [])
  useEffect(() => {
    if (selected) api(`/runs/${selected}`).then(setResult).catch(e => setError(e.message))
    else setResult(null)
  }, [selected])

  async function remove() {
    if (!window.confirm('Delete this timetable?')) return
    await api(`/runs/${selected}`, 'DELETE')
    setSelected(null)
    loadRuns()
  }

  return (
    <div>
      <h2>Timetable</h2>
      {error && <p className="error">{error}</p>}
      {runs.length === 0 && <p>No timetable yet. Use Generate first.</p>}
      {runs.length > 0 && (
        <p>
          <select value={selected || ''} onChange={e => setSelected(Number(e.target.value))}>
            {runs.map(r => <option key={r.id} value={r.id}>Run {r.id} - {r.created} ({r.status})</option>)}
          </select>
          <button onClick={remove}>Delete</button>
        </p>
      )}
      {result && (
        <>
          <h1 className="school">{result.school}</h1>
          <div className="tabs">
            {TABS.map(([key, label]) => (
              <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>
          <div className="legend">
            {Object.entries(result.colors).map(([s, c]) => <span key={s} style={{ background: c }}>{s}</span>)}
          </div>
          {tab === 'master' && <Master result={result} colors={result.colors} />}
          {tab === 'class' && <ClassView result={result} colors={result.colors} />}
          {tab === 'teacher' && <TeacherView result={result} colors={result.colors} />}
        </>
      )}
    </div>
  )
}
