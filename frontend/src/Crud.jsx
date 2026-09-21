import { useEffect, useState } from 'react'
import { api } from './api.js'

export default function Crud({ title, path, fields }) {
  const [items, setItems] = useState([])
  const [draft, setDraft] = useState({})
  const [error, setError] = useState('')

  const load = () => api(path).then(setItems).catch(e => setError(e.message))
  useEffect(() => { load() }, [path])

  async function run(fn) {
    setError('')
    try {
      await fn()
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  const edit = (id, key, value) => setItems(items.map(i => (i.id === id ? { ...i, [key]: value } : i)))

  const input = (f, value, onChange) => (
    <input type={f.type || 'text'} value={value ?? (f.type === 'color' ? '#cccccc' : '')} onChange={e => onChange(e.target.value)} />
  )

  return (
    <div>
      <h2>{title}</h2>
      {error && <p className="error">{error}</p>}
      <table className="plain">
        <thead>
          <tr>{fields.map(f => <th key={f.key}>{f.label}</th>)}<th></th></tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id}>
              {fields.map(f => <td key={f.key}>{input(f, item[f.key], v => edit(item.id, f.key, v))}</td>)}
              <td>
                <button onClick={() => run(() => api(`${path}/${item.id}`, 'PUT', item))}>Save</button>
                <button onClick={() => window.confirm('Delete? Lessons using it are deleted too.') && run(() => api(`${path}/${item.id}`, 'DELETE'))}>Delete</button>
              </td>
            </tr>
          ))}
          <tr>
            {fields.map(f => <td key={f.key}>{input(f, draft[f.key], v => setDraft({ ...draft, [f.key]: v }))}</td>)}
            <td>
              <button onClick={() => run(async () => { await api(path, 'POST', draft); setDraft({}) })}>Add</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
