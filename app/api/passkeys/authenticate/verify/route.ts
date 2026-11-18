import { NextResponse } from 'next/server'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { serviceClient, webAuthnConfig } from '@/lib/webauthn/server'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  try {
    const { memberId, response } = await request.json() as { memberId: string; response: Parameters<typeof verifyAuthenticationResponse>[0]['response'] }
    if (!memberId || !response?.id) return NextResponse.json({ error: 'Invalid authentication response.' }, { status: 400 })
    const db = serviceClient()
    const { data: challenge } = await db.from('attendance_passkey_challenges').delete().eq('member_id', memberId).eq('purpose', 'authenticate').select('challenge').maybeSingle()
    if (!challenge) return NextResponse.json({ error: 'Authentication expired. Try again.' }, { status: 400 })
    const { data: credential } = await db.from('attendance_passkey_credentials').select('*').eq('credential_id', response.id).eq('member_id', memberId).maybeSingle()
    if (!credential) return NextResponse.json({ error: 'This phone is not enrolled for that member.' }, { status: 401 })
    const { origin, rpID } = webAuthnConfig()
    const verification = await verifyAuthenticationResponse({
      response, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID,
      credential: { id: credential.credential_id, publicKey: new Uint8Array(Buffer.from(credential.public_key, 'base64')), counter: Number(credential.counter), transports: credential.transports ?? [] },
      requireUserVerification: true,
    })
    if (!verification.verified) return NextResponse.json({ error: 'Phone biometric verification failed.' }, { status: 401 })
    await db.from('attendance_passkey_credentials').update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('credential_id', credential.credential_id)
    const { data, error } = await db.rpc('record_passkey_attendance', { p_member_id: memberId })
    if (error) throw error
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Attendance could not be recorded.' }, { status: 500 })
  }
}
