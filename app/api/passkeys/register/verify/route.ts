import { NextResponse } from 'next/server'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { requireAttendanceAdmin, serviceClient, webAuthnConfig } from '@/lib/webauthn/server'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  try {
    const adminUser = await requireAttendanceAdmin()
    if (!adminUser) return NextResponse.json({ error: 'Administrator sign-in required.' }, { status: 401 })
    const { memberId, response } = await request.json() as { memberId: string; response: Parameters<typeof verifyRegistrationResponse>[0]['response'] }
    const db = serviceClient()
    const { data: challenge } = await db.from('attendance_passkey_challenges').delete().eq('member_id', memberId).eq('purpose', 'register').eq('admin_user_id', adminUser.id).select('challenge,admin_user_id').maybeSingle()
    if (!challenge || challenge.admin_user_id !== adminUser.id) return NextResponse.json({ error: 'Enrollment expired. Start again.' }, { status: 400 })
    const { origin, rpID } = webAuthnConfig()
    const verification = await verifyRegistrationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true })
    if (!verification.verified || !verification.registrationInfo) return NextResponse.json({ error: 'Phone biometric verification failed.' }, { status: 400 })
    const info = verification.registrationInfo
    const credential = info.credential
    const { error } = await db.from('attendance_passkey_credentials').insert({
      member_id: memberId, credential_id: credential.id,
      public_key: Buffer.from(credential.publicKey).toString('base64'), counter: credential.counter,
      transports: credential.transports ?? [], device_type: info.credentialDeviceType,
      backed_up: info.credentialBackedUp,
    })
    if (error) throw error
    return NextResponse.json({ verified: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save this passkey.' }, { status: 500 })
  }
}
