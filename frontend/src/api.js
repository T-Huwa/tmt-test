export const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function api(path, method = 'GET', body) {
  const options = { method }
  if (body instanceof FormData) {
    options.body = body
  } else if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' }
    options.body = JSON.stringify(body)
  }
  const res = await fetch(API + path, options)
  const data = await res.json()
  if (!res.ok) {
    const d = data.detail
    throw new Error(typeof d === 'string' ? d : d && d.errors ? d.errors.join('\n') : JSON.stringify(d))
  }
  return data
}
