import { useState } from 'react'
import { api, API } from './api.js'

const MEANINGS = {
  lessons: ['ignore', 'class', 'teacher', 'subject', 'length', 'count', 'pattern'],
  teachers: ['ignore', 'name', 'short'],
  classes: ['ignore', 'name', 'label'],
  subjects: ['ignore', 'name', 'short'],
}
const LABELS = {
  ignore: 'Ignore',
  class: 'Class',
  teacher: 'Teacher',
  subject: 'Subject',
  length: 'Length',
  count: 'Lessons per week',
  pattern: 'Periods pattern (2+2+1)',
  name: 'Name',
  short: 'Short',
  label: 'Label',
}
const KIND_LABELS = { lessons: 'Lessons', teachers: 'Teachers', classes: 'Classes', subjects: 'Subjects' }

function guess(kind, header, values) {
  const h = header.toLowerCase()
  if (kind === 'lessons') {
    if (h.includes('class')) return 'class'
    if (h.includes('teach')) return 'teacher'
    if (h.includes('subj')) return 'subject'
    if (h.includes('length') || h.includes('duration')) return 'length'
    if (h.includes('week') || h.includes('period') || h.includes('count') || h.includes('lesson')) {
      return values.some(v => String(v).includes('+')) ? 'pattern' : 'count'
    }
    return 'ignore'
  }
  if (h.includes('short') || h.includes('code') || h.includes('abbr')) return kind === 'classes' ? 'label' : 'short'
  if (h.includes('label')) return 'label'
  if (h.includes('name') || h.includes(kind.slice(0, -1))) return 'name'
  return 'ignore'
}

function guessMapping(kind, rows, header) {
  const width = Math.max(...rows.map(r => r.length))
  const meanings = MEANINGS[kind].filter(m => m !== 'ignore')
  if (!header) return Array.from({ length: width }, (_, j) => meanings[j] || 'ignore')
  const mapping = Array.from({ length: width }, (_, j) =>
    guess(kind, String(rows[0][j] || ''), rows.slice(1).map(r => r[j] || ''))
  )
  if (kind !== 'lessons' && !mapping.includes('name')) mapping[0] = 'name'
  return mapping
}

export default function ImportPage() {
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [jsonFile, setJsonFile] = useState(null)
  const [rows, setRows] = useState(null)
  const [kind, setKind] = useState('lessons')
  const [header, setHeader] = useState(true)
  const [mapping, setMapping] = useState([])
  const [check, setCheck] = useState(null)
  const [existing, setExisting] = useState({})
  const [decisions, setDecisions] = useState({})
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function attempt(fn) {
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    }
  }

  const reset = () => {
    setRows(null)
    setCheck(null)
    setResult(null)
    setText('')
    setFile(null)
  }

  const load = () => attempt(async () => {
    const form = new FormData()
    if (file) form.append('file', file)
    else form.append('text', text)
    const { rows } = await api('/import/preview', 'POST', form)
    setRows(rows)
    setMapping(guessMapping(kind, rows, header))
  })

  const changeKind = k => {
    setKind(k)
    setMapping(guessMapping(k, rows, header))
  }
  const changeHeader = h => {
    setHeader(h)
    setMapping(guessMapping(kind, rows, h))
  }

  const payload = () => ({ kind, header, rows, mapping })

  const runCheck = () => attempt(async () => {
    const res = await api('/import/check', 'POST', payload())
    const lists = { teachers: await api('/teachers'), classes: await api('/classes'), subjects: await api('/subjects') }
    const initial = {}
    for (const [table, entries] of Object.entries(res.sync)) {
      initial[table] = {}
      for (const e of entries) initial[table][e.name] = e.suggest_id ? { action: 'link', id: e.suggest_id } : { action: 'new' }
    }
    setExisting(lists)
    setDecisions(initial)
    setCheck(res)
  })

  const setDecision = (table, name, value) =>
    setDecisions({
      ...decisions,
      [table]: { ...decisions[table], [name]: value === 'new' ? { action: 'new' } : { action: 'link', id: Number(value) } },
    })

  const commit = () => attempt(async () => {
    setResult(await api('/import/commit', 'POST', { ...payload(), decisions }))
  })

  const importJson = () => attempt(async () => {
    if (!window.confirm('This replaces all teachers, classes, subjects, lessons, bell times and rules.')) return
    const form = new FormData()
    form.append('file', jsonFile)
    await api('/import/json', 'POST', form)
    setMessage('JSON imported')
  })

  const width = rows ? Math.max(...rows.map(r => r.length)) : 0
  const body = rows ? (header ? rows.slice(1) : rows) : []

  return (
    <div>
      <h2>Import</h2>
      {error && <p className="error">{error}</p>}

      {!rows && (
        <>
          <h3>1. Paste or upload</h3>
          <p>Copy cells from Excel and paste them here, or upload an .xlsx or .csv file.</p>
          <textarea rows="8" cols="80" value={text} onChange={e => setText(e.target.value)} disabled={!!file} />
          <p>
            <input type="file" accept=".xlsx,.csv" onChange={e => setFile(e.target.files[0] || null)} />
          </p>
          <button disabled={!file && !text.trim()} onClick={load}>Load data</button>
          <h3>Import a JSON file</h3>
          <input type="file" accept=".json" onChange={e => setJsonFile(e.target.files[0] || null)} />
          <button disabled={!jsonFile} onClick={importJson}>Import JSON</button> {message}
          <h3>Export to Excel</h3>
          {Object.entries(KIND_LABELS).map(([k, l]) => (
            <a key={k} className="button" href={`${API}/export/excel/${k}`}>{l}</a>
          ))}
          <a className="button" href={`${API}/export/json`} target="_blank" rel="noreferrer">JSON</a>
        </>
      )}

      {rows && !check && (
        <>
          <h3>2. Choose what the columns mean</h3>
          <label>
            Data type{' '}
            <select value={kind} onChange={e => changeKind(e.target.value)}>
              {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>{' '}
          <label>
            <input type="checkbox" checked={header} onChange={e => changeHeader(e.target.checked)} /> First row contains column headers
          </label>
          <table className="plain">
            <thead>
              <tr>
                {Array.from({ length: width }, (_, j) => (
                  <th key={j}>
                    {header && <div>{rows[0][j]}</div>}
                    <select value={mapping[j]} onChange={e => setMapping(mapping.map((m, i) => (i === j ? e.target.value : m)))}>
                      {MEANINGS[kind].map(m => <option key={m} value={m}>{LABELS[m]}</option>)}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.slice(0, 15).map((r, i) => (
                <tr key={i}>{Array.from({ length: width }, (_, j) => <td key={j}>{r[j]}</td>)}</tr>
              ))}
            </tbody>
          </table>
          <p className="hint">Showing {Math.min(15, body.length)} of {body.length} rows.</p>
          <button onClick={reset}>Back</button>
          <button onClick={runCheck}>Next</button>
        </>
      )}

      {check && !result && (
        <>
          <h3>3. Match names with existing data</h3>
          <p>{check.count} rows ready to import.</p>
          {check.errors.length > 0 && (
            <div className="error">
              These rows will be skipped:
              <ul>{check.errors.map(e => <li key={e.row}>Row {e.row}: {e.message}</li>)}</ul>
            </div>
          )}
          {Object.entries(check.sync).map(([table, entries]) => entries.length > 0 && (
            <div key={table}>
              <h4>{table[0].toUpperCase() + table.slice(1)} not found in the timetable</h4>
              <table className="plain">
                <thead><tr><th>Name in file</th><th>Action</th></tr></thead>
                <tbody>
                  {entries.map(e => {
                    const d = decisions[table][e.name]
                    return (
                      <tr key={e.name}>
                        <td>{e.name}</td>
                        <td>
                          <select value={d.action === 'new' ? 'new' : d.id} onChange={ev => setDecision(table, e.name, ev.target.value)}>
                            <option value="new">Add as new</option>
                            {existing[table].map(x => <option key={x.id} value={x.id}>Link to {x.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
          {Object.values(check.sync).every(v => v.length === 0) && <p>Every name matches existing data exactly.</p>}
          <button onClick={() => setCheck(null)}>Back</button>
          <button onClick={commit}>Import</button>
        </>
      )}

      {result && (
        <>
          <h3>4. Done</h3>
          <ul>
            {Object.entries(result.created).map(([t, n]) => <li key={t}>{n} {t} added</li>)}
            {Object.entries(result.linked).map(([t, n]) => <li key={t}>{n} {t} linked to existing</li>)}
            {kind === 'lessons' && <li>{result.lessons_added} lessons added, {result.lessons_updated} updated</li>}
            {result.skipped.length > 0 && <li>{result.skipped.length} rows skipped</li>}
          </ul>
          <button onClick={reset}>Import more</button>
        </>
      )}
    </div>
  )
}
