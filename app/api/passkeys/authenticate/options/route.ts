import { NextResponse } from 'next/server'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { serviceClient, webAuthnConfig } from '@/lib/webauthn/server'

export const runtime = 'nodejs'

// No email or member lookup: the phone offers the passkey that was registered
// with the member's fingerprint, and the server works out who it belongs to
// after the signature is verified.
export async function POST() {
  try {
    const db = serviceClient()
    const { rpID } = webAuthnConfig()
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' })

    // Keep the table small: drop challenges that were never used.
    await db.from('attendance_passkey_auth_challenges').delete().lt('created_at', new Date(Date.now() - 5 * 60_000).toISOString())
    const { error } = await db.from('attendance_passkey_auth_challenges').insert({ challenge: options.challenge })
    if (error) throw error
    return NextResponse.json(options, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not start fingerprint attendance.' }, { status: 500 })
  }
}
