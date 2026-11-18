import { NextResponse } from 'next/server'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { serviceClient, webAuthnConfig } from '@/lib/webauthn/server'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  try {
    const { email } = await request.json() as { email?: string }
    if (!email || typeof email !== 'string' || email.length > 254) return NextResponse.json({ error: 'Enter the email on your member profile.' }, { status: 400 })
    const db = serviceClient()
    const { data: member } = await db.from('attendance_members').select('id').ilike('email', email.trim()).maybeSingle()
    if (!member) return NextResponse.json({ error: 'No passkey attendance profile was found.' }, { status: 404 })
    const { data: credentials } = await db.from('attendance_passkey_credentials').select('credential_id,transports').eq('member_id', member.id)
    if (!credentials?.length) return NextResponse.json({ error: 'No phone passkey is enrolled for this member. Ask an administrator to enroll this phone.' }, { status: 404 })
    const { rpID } = webAuthnConfig()
    const options = await generateAuthenticationOptions({ rpID, allowCredentials: credentials.map((c) => ({ id: c.credential_id, transports: c.transports ?? [] })), userVerification: 'required' })
    await db.from('attendance_passkey_challenges').delete().eq('member_id', member.id).eq('purpose', 'authenticate')
    const { error } = await db.from('attendance_passkey_challenges').insert({ member_id: member.id, challenge: options.challenge, purpose: 'authenticate' })
    if (error) throw error
    return NextResponse.json({ ...options, memberId: member.id }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not start biometric attendance.' }, { status: 500 })
  }
}
