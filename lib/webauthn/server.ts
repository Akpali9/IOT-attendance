import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'

export function serviceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server-side Supabase service credentials are missing.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function requireAttendanceAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase browser configuration is missing.')
  const cookieStore = await cookies()
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = serviceClient()
  const { data } = await admin.from('attendance_admins').select('user_id,role').eq('user_id', user.id).maybeSingle()
  return data ? { id: user.id, role: data.role as string } : null
}

// Uses WEBAUTHN_ORIGIN / WEBAUTHN_RP_ID when set (recommended for production).
// Otherwise falls back to the address the request came in on, so the app still works
// on Vercel previews and localhost without extra setup.
export async function webAuthnConfig() {
  const rpName = process.env.WEBAUTHN_RP_NAME ?? 'LAM Attendance'
  const envOrigin = process.env.WEBAUTHN_ORIGIN?.trim().replace(/\/+$/, '')
  const envRpID = process.env.WEBAUTHN_RP_ID?.trim()
  if (envOrigin && envRpID) return { origin: envOrigin, rpID: envRpID, rpName }

  const h = await headers()
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0].trim()
  if (!host) throw new Error('Could not work out the site address. Set WEBAUTHN_ORIGIN and WEBAUTHN_RP_ID.')
  const hostname = host.replace(/:\d+$/, '')
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1'
  const proto = isLocal ? 'http' : (h.get('x-forwarded-proto') ?? 'https').split(',')[0].trim()
  return { origin: envOrigin ?? `${proto}://${host}`, rpID: envRpID ?? hostname, rpName }
}
