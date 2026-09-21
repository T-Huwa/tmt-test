import { useEffect, useState } from 'react'
import { api } from './api.js'

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function School() {
  const [school, setSchool] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => { api('/school').then(setSchool) }, [])
  if (!school) return null

  const toggle = day =>
    setSchool({ ...school, days: school.days.includes(day) ? school.days.filter(d => d !== day) : [...school.days, day] })

  async function save() {
    try {
      await api('/school', 'PUT', school)
      setMessage('Saved')
    } catch (e) {
      setMessage(e.message)
    }
  }

  return (
    <div>
      <h2>School</h2>
      <p>
        <label>School name <input value={school.name} onChange={e => setSchool({ ...school, name: e.target.value })} /></label>
      </p>
      <p>
        School days:{' '}
        {WEEK.map(d => (
          <label key={d} className="inline">
            <input type="checkbox" checked={school.days.includes(d)} onChange={() => toggle(d)} /> {d}
          </label>
        ))}
      </p>
      <p>
        <label>
          <input type="checkbox" checked={school.one_per_day} onChange={e => setSchool({ ...school, one_per_day: e.target.checked })} />
          {' '}At most one lesson of a subject per class per day
        </label>
      </p>
      <button onClick={save}>Save</button> {message}
    </div>
  )
}
