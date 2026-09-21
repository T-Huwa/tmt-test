export const API = 'https://tmt-test.onrender.com'

export async function api(path, method = 'GET', body) {
  const options = { method }

  if (body instanceof FormData) {
    options.body = body
  } else if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' }
    options.body = JSON.stringify(body)
  }

  const res = await fetch(API + path)
  const data = await res.json()

  if (!res.ok) {
    const d = data.detail
    throw new Error(
      typeof d === 'string'
        ? d
        : d && d.errors
          ? d.errors.join('\n')
          : JSON.stringify(d)
    )
  }

  return data
}
