import { NextResponse } from 'next/server'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { serviceClient, webAuthnConfig } from '@/lib/webauthn/server'

export const runtime = 'nodejs'

type AuthResponse = Parameters<typeof verifyAuthenticationResponse>[0]['response']

function fromBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

// Every failure answers with { status: 'declined', reason } so the screen and the
// voice can announce "Declined" with a reason instead of a raw error.
const declined = (reason: string, code = 401) =>
  NextResponse.json({ status: 'declined', reason }, { status: code, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  try {
    const { response } = await request.json() as { response?: AuthResponse }
    if (!response?.id || !response.response?.clientDataJSON) return declined('Invalid fingerprint response.', 400)

    // The single-use challenge is inside the signed client data.
    let challenge: string
    try {
      challenge = JSON.parse(fromBase64Url(response.response.clientDataJSON).toString('utf8')).challenge
    } catch {
      return declined('Invalid fingerprint response.', 400)
    }

    const db = serviceClient()
    const { data: stored } = await db.from('attendance_passkey_auth_challenges').delete().eq('challenge', challenge).gt('created_at', new Date(Date.now() - 2 * 60_000).toISOString()).select('challenge').maybeSingle()
    if (!stored) return declined('Fingerprint check expired. Try again.', 400)

    const { data: credential } = await db.from('attendance_passkey_credentials').select('*').eq('credential_id', response.id).maybeSingle()
    if (!credential) return declined('Fingerprint not registered.')

    // Discoverable passkeys return the member id as the user handle; it must match.
    const userHandle = response.response.userHandle
    if (userHandle && fromBase64Url(userHandle).toString('utf8') !== credential.member_id) return declined('Fingerprint does not match this member.')

    const { origin, rpID } = await webAuthnConfig()
    const verification = await verifyAuthenticationResponse({
      response, expectedChallenge: stored.challenge, expectedOrigin: origin, expectedRPID: rpID,
      credential: { id: credential.credential_id, publicKey: new Uint8Array(Buffer.from(credential.public_key, 'base64')), counter: Number(credential.counter), transports: credential.transports ?? [] },
      requireUserVerification: true,
    })
    if (!verification.verified) return declined('Fingerprint not recognised.')

    await db.from('attendance_passkey_credentials').update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('credential_id', credential.credential_id)
    const { data, error } = await db.rpc('record_passkey_attendance', { p_member_id: credential.member_id })
    if (error) throw error
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ status: 'declined', reason: error instanceof Error ? error.message : 'Attendance could not be recorded.' }, { status: 500 })
  }
}
