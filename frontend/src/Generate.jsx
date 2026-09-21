import { useEffect, useState } from 'react'
import { api } from './api.js'

export default function Generate({ onDone }) {
  const [check, setCheck] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const validate = () => api('/validate', 'POST').then(setCheck).catch(e => setError(e.message))
  useEffect(() => { validate() }, [])

  async function generate() {
    setLoading(true)
    setError('')
    setStatus('')
    try {
      const res = await api('/solve', 'POST')
      if (res.run_id) onDone(res.run_id)
      else setStatus(`No timetable found (${res.status})`)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  return (
    <div>
      <h2>Generate</h2>
      {check && check.errors.length === 0 && <p className="ok">The data is ready.</p>}
      {check && check.errors.length > 0 && (
        <div className="error">
          Fix these before generating:
          <ul>{check.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      <button onClick={validate}>Check again</button>
      <button disabled={loading || !check || check.errors.length > 0} onClick={generate}>Generate timetable</button>
      {loading && <p>Solving, this can take a while...</p>}
      {error && <p className="error">{error}</p>}
      {status && <p className="error">{status}</p>}
    </div>
  )
}
