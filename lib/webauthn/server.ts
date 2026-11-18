import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

export function webAuthnConfig() {
  const origin = process.env.WEBAUTHN_ORIGIN
  const rpID = process.env.WEBAUTHN_RP_ID
  if (!origin || !rpID) throw new Error('Set WEBAUTHN_ORIGIN and WEBAUTHN_RP_ID.')
  return { origin, rpID, rpName: process.env.WEBAUTHN_RP_NAME ?? 'LAM Attendance' }
}
