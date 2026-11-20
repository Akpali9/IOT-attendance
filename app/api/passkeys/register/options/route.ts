import { NextResponse } from 'next/server'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { requireAttendanceAdmin, serviceClient, webAuthnConfig } from '@/lib/webauthn/server'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  try {
    const adminUser = await requireAttendanceAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Administrator sign-in required.' }, { status: 401 })
    const { memberId } = await request.json() as { memberId?: string }
    if (!memberId || typeof memberId !== 'string') return NextResponse.json({ error: 'Member ID is required.' }, { status: 400 })
    const db = serviceClient()
    const { data: member } = await db.from('attendance_members').select('id,full_name,email').eq('id', memberId).maybeSingle()
    if (!member) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
    const { data: existing } = await db.from('attendance_passkey_credentials').select('credential_id,transports').eq('member_id', memberId)
    const { rpID, rpName } = webAuthnConfig()
    const options = await generateRegistrationOptions({
      rpName, rpID, userName: member.full_name, userDisplayName: member.full_name,
      userID: new Uint8Array(Buffer.from(member.id)), attestationType: 'none', preferredAuthenticatorType: 'localDevice',
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      excludeCredentials: (existing ?? []).map((item) => ({ id: item.credential_id, transports: item.transports ?? [] })),
    })
    await db.from('attendance_passkey_challenges').delete().eq('member_id', memberId).eq('purpose', 'register')
    const { error } = await db.from('attendance_passkey_challenges').insert({ member_id: memberId, challenge: options.challenge, purpose: 'register', admin_user_id: adminUser.id })
    if (error) throw error
    return NextResponse.json(options, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not start passkey enrollment.' }, { status: 500 })
  }
}
