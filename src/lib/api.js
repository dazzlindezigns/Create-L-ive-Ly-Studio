import { supabase } from './supabase'

// Calls /api/<path>. Pass `auth: true` for admin endpoints — it attaches the Supabase session token.
export async function api(path, { body, auth = false, method } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) headers.Authorization = `Bearer ${session.access_token}`
  }
  const resp = await fetch(`/api/${path}`, {
    method: method || (body !== undefined ? 'POST' : 'GET'),
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`)
  return data
}

// Uploads a file through a signed URL. Returns its public URL — or, for the private
// digital-products bucket, its storage path (there is no public URL by design).
export async function uploadFile(file, bucket = 'order-files', { auth = false } = {}) {
  const { path, token, publicUrl } = await api('get-upload-url', { body: { filename: file.name, bucket }, auth })
  const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, file, { contentType: file.type || undefined })
  if (error) throw new Error(`Upload failed: ${error.message}`)
  return publicUrl || path
}

export const APP_URL = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '')
