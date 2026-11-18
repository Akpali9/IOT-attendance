"use client"

import { useState, type FormEvent } from 'react'
import { Fingerprint, LoaderCircle, X } from 'lucide-react'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/types'

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'The request could not be completed.')
  return data
}

export function EnrollPhonePasskey({ memberId }: { memberId: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const enroll = async () => {
    setBusy(true); setMessage('')
    try {
      const options = await readJson(await fetch('/api/passkeys/register/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId }) }))
      const credential = await startRegistration({ optionsJSON: options as PublicKeyCredentialCreationOptionsJSON })
      await readJson(await fetch('/api/passkeys/register/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId, response: credential }) }))
      setMessage('Phone passkey enrolled successfully. This Android phone can now authenticate this member using its screen lock or fingerprint.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Passkey enrollment failed.') }
    finally { setBusy(false) }
  }
  return <div className="rounded-lg border border-[#e4eae2] bg-[#f8faf7] p-3">
    <div className="flex items-center gap-2 text-xs font-semibold text-[#385b42]"><Fingerprint size={15}/> Android phone fingerprint / passkey</div>
    <p className="mt-1 text-[10px] leading-4 text-[#7b897f]">Use the member's Android phone and Chrome. The phone securely verifies the fingerprint; the app never receives a fingerprint image or template.</p>
    <button type="button" disabled={busy} onClick={() => void enroll()} className="mt-3 flex items-center gap-2 rounded-lg bg-[#193e30] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={13}/> : <Fingerprint size={13}/>} {busy ? 'Waiting for phone…' : 'Enroll this phone'}</button>
    {message && <p role="status" className="mt-2 text-[10px] leading-4 text-[#617268]">{message}</p>}
  </div>
}

export function PhoneBiometricDialog({ open, onClose, onComplete }: { open: boolean; onClose: () => void; onComplete: () => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  if (!open) return null
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      if (!window.isSecureContext || !('PublicKeyCredential' in window)) throw new Error('Passkeys require HTTPS and a supported browser such as Chrome on Android.')
      const options = await readJson(await fetch('/api/passkeys/authenticate/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }))
      const { memberId, ...requestOptions } = options
      const assertion = await startAuthentication({ optionsJSON: requestOptions as PublicKeyCredentialRequestOptionsJSON })
      const result = await readJson(await fetch('/api/passkeys/authenticate/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId, response: assertion }) }))
      const status = result.status === 'accepted' ? 'Attendance check-in recorded.' : result.status === 'checked_out' ? 'Attendance check-out recorded.' : result.status === 'already_completed' ? 'Attendance for today is already complete.' : 'No attendance record was created.'
      setMessage(status)
      if (result.status === 'accepted' || result.status === 'checked_out') onComplete()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Biometric attendance failed.') }
    finally { setBusy(false) }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#10241c]/65 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
    <div className="flex items-start justify-between"><div><div className="grid size-10 place-items-center rounded-xl bg-[#edf3ed] text-[#315f43]"><Fingerprint size={20}/></div><h2 className="mt-3 text-lg font-semibold">Phone biometric attendance</h2><p className="mt-1 text-xs leading-5 text-[#7b897f]">Enter your member email, then confirm with your Android fingerprint or device screen lock.</p></div><button onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-[#f3f6f2]"><X size={17}/></button></div>
    <form onSubmit={submit} className="mt-5 space-y-3"><label className="block text-xs font-medium text-[#43544a]">Member email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="member@example.com" className="mt-1.5 w-full rounded-lg border border-[#e1e7e1] px-3 py-3 text-sm outline-none focus:border-[#73907a]"/></label><button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#193e30] px-4 py-3 text-xs font-semibold text-white disabled:opacity-60">{busy ? <LoaderCircle size={14} className="animate-spin"/> : <Fingerprint size={14}/>} {busy ? 'Verify on your phone…' : 'Continue with fingerprint / passkey'}</button></form>
    {message && <p role="status" className="mt-4 rounded-lg bg-[#f3f7f1] p-3 text-xs leading-5 text-[#52675a]">{message}</p>}
    <p className="mt-4 text-[10px] leading-4 text-[#98a29b]">A passkey must first be enrolled by an administrator. Biometrics are handled by Android; LAM stores only a public cryptographic key.</p>
  </section></div>
}
