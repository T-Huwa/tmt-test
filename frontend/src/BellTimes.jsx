import { useEffect, useState } from 'react'
import { api } from './api.js'

const toMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export default function BellTimes() {
  const [rows, setRows] = useState([])
  const [message, setMessage] = useState('')
  const [gen, setGen] = useState({ start: '07:00', length: 40, count: 10, breaks: [{ after: 3, minutes: 20, name: 'Tea Break' }] })

  useEffect(() => { api('/bell-times').then(setRows) }, [])

  const setRow = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const move = (i, d) => {
    const next = [...rows]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    setRows(next)
  }
  const add = kind => setRows([...rows, { kind, name: kind === 'break' ? 'Break' : '', start: '', end: '' }])

  function generate() {
    const out = []
    let t = toMin(gen.start)
    for (let p = 1; p <= gen.count; p++) {
      out.push({ kind: 'period', name: '', start: fmt(t), end: fmt(t + Number(gen.length)) })
      t += Number(gen.length)
      const b = gen.breaks.find(x => Number(x.after) === p)
      if (b && p < gen.count) {
        out.push({ kind: 'break', name: b.name, start: fmt(t), end: fmt(t + Number(b.minutes)) })
        t += Number(b.minutes)
      }
    }
    setRows(out)
  }

  const setBreak = (i, patch) => setGen({ ...gen, breaks: gen.breaks.map((b, j) => (j === i ? { ...b, ...patch } : b)) })

  async function save() {
    try {
      await api('/bell-times', 'PUT', rows)
      setMessage('Saved')
    } catch (e) {
      setMessage(e.message)
    }
  }

  let n = 0
  return (
    <div>
      <h2>Bell times</h2>
      <fieldset>
        <legend>Generate</legend>
        <label>First period starts <input type="time" value={gen.start} onChange={e => setGen({ ...gen, start: e.target.value })} /></label>{' '}
        <label>Period length (min) <input type="number" value={gen.length} onChange={e => setGen({ ...gen, length: e.target.value })} /></label>{' '}
        <label>Periods <input type="number" value={gen.count} onChange={e => setGen({ ...gen, count: e.target.value })} /></label>
        {gen.breaks.map((b, i) => (
          <div key={i}>
            Break after period <input type="number" value={b.after} onChange={e => setBreak(i, { after: e.target.value })} />
            {' '}minutes <input type="number" value={b.minutes} onChange={e => setBreak(i, { minutes: e.target.value })} />
            {' '}name <input value={b.name} onChange={e => setBreak(i, { name: e.target.value })} />
            <button onClick={() => setGen({ ...gen, breaks: gen.breaks.filter((_, j) => j !== i) })}>Remove</button>
          </div>
        ))}
        <button onClick={() => setGen({ ...gen, breaks: [...gen.breaks, { after: 1, minutes: 10, name: 'Break' }] })}>Add break</button>
        <button onClick={generate}>Generate</button>
      </fieldset>
      <table className="plain">
        <thead>
          <tr><th>Type</th><th>Name</th><th>Start</th><th>End</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            if (r.kind === 'period') n++
            return (
              <tr key={i} className={r.kind === 'break' ? 'break-row' : ''}>
                <td>{r.kind === 'period' ? `Period ${n}` : 'Break'}</td>
                <td>{r.kind === 'break' ? <input value={r.name} onChange={e => setRow(i, { name: e.target.value })} /> : ''}</td>
                <td><input type="time" value={r.start} onChange={e => setRow(i, { start: e.target.value })} /></td>
                <td><input type="time" value={r.end} onChange={e => setRow(i, { end: e.target.value })} /></td>
                <td>
                  <button disabled={i === 0} onClick={() => move(i, -1)}>Up</button>
                  <button disabled={i === rows.length - 1} onClick={() => move(i, 1)}>Down</button>
                  <button onClick={() => setRows(rows.filter((_, j) => j !== i))}>Delete</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <button onClick={() => add('period')}>Add period</button>
      <button onClick={() => add('break')}>Add break</button>
      <button onClick={save}>Save</button> <span className="error">{message}</span>
    </div>
  )
}
