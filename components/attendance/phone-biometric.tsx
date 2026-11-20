"use client"

import { useEffect, useState } from 'react'
import { Check, Fingerprint, LoaderCircle, Volume2, VolumeX, X } from 'lucide-react'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/types'
import { announceDeclined, announceOutcome, isVoiceEnabled, setVoiceEnabled, speak, voiceSupported } from './voice'

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? data.reason ?? 'The request could not be completed.')
  return data
}

/** Registers the member's fingerprint (a passkey held by the phone). Needs an administrator session. */
export async function enrollFingerprint(memberId: string) {
  if (!window.isSecureContext || !('PublicKeyCredential' in window)) throw new Error('Fingerprint needs HTTPS and a supported browser such as Chrome on Android.')
  const options = await readJson(await fetch('/api/passkeys/register/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId }) }))
  const credential = await startRegistration({ optionsJSON: options as PublicKeyCredentialCreationOptionsJSON })
  await readJson(await fetch('/api/passkeys/register/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId, response: credential }) }))
}

function friendlyError(error: unknown) {
  if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) return 'The fingerprint prompt was cancelled or timed out.'
  if (error instanceof Error && error.name === 'InvalidStateError') return 'This phone already has a fingerprint registered for this member.'
  return error instanceof Error ? error.message : 'Fingerprint failed.'
}

function VoiceToggle() {
  const [on, setOn] = useState(true)
  useEffect(() => setOn(isVoiceEnabled()), [])
  if (!voiceSupported()) return null
  return <button type="button" onClick={() => { const next = !on; setVoiceEnabled(next); setOn(next); if (next) speak('Voice on.') }} aria-pressed={on} aria-label={on ? 'Turn voice announcements off' : 'Turn voice announcements on'} className="flex items-center gap-1.5 rounded-md border border-[#dfe6df] px-2.5 py-2 text-[10px] font-medium text-[#53655a] hover:bg-[#f7faf6]">{on ? <Volume2 size={12}/> : <VolumeX size={12}/>} Voice {on ? 'on' : 'off'}</button>
}

/** Shown right after a new member is created: the fingerprint is taken as part of registration. */
export function RegistrationFingerprintStep({ memberId, memberName, onDone }: { memberId: string; memberName: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [message, setMessage] = useState('')
  const register = async () => {
    setBusy(true); setMessage('')
    try {
      await enrollFingerprint(memberId)
      setDone(true)
      setMessage('Fingerprint registered. This member can now sign in with their fingerprint or ID card QR.')
      speak(`Fingerprint registered for ${memberName}.`)
    } catch (error) {
      const text = friendlyError(error)
      setMessage(text)
      announceDeclined(text)
    } finally { setBusy(false) }
  }
  return <div className="space-y-4">
    <div className="rounded-xl border border-[#e4eae2] bg-[#f8faf7] p-5 text-center">
      <div className={`mx-auto grid size-14 place-items-center rounded-full ${done ? 'bg-[#dceedd] text-[#477b50]' : 'bg-[#edf3ed] text-[#315f43]'}`}>{done ? <Check size={26}/> : <Fingerprint size={26}/>}</div>
      <h3 className="mt-3 text-sm font-semibold text-[#263b2e]">{done ? 'Fingerprint registered' : `Register ${memberName}'s fingerprint`}</h3>
      <p className="mx-auto mt-1 max-w-xs text-[11px] leading-5 text-[#7b897f]">{done ? 'Registration is complete.' : "Hand the phone to the member, tap the button, then place their finger on the phone's fingerprint sensor when Android asks."}</p>
    </div>
    {message && <p role="status" className={`rounded-lg px-3 py-2.5 text-xs leading-5 ${done ? 'bg-[#eef6ee] text-[#477b50]' : 'border border-[#efd6d0] bg-[#fbf1ef] text-[#965544]'}`}>{message}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#edf0ec] pt-4">
      <div className="flex items-center gap-2"><VoiceToggle/>{!done && <button type="button" onClick={onDone} className="text-[10px] font-medium text-[#8b958e] underline underline-offset-2 hover:text-[#53655a]">Skip, enroll later from the member profile</button>}</div>
      {done
        ? <button type="button" onClick={onDone} className="rounded-lg bg-[#193e30] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#24533f]">Finish</button>
        : <button type="button" disabled={busy} onClick={() => void register()} className="flex items-center gap-2 rounded-lg bg-[#193e30] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#24533f] disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={14}/> : <Fingerprint size={14}/>} {busy ? 'Waiting for fingerprint…' : message ? 'Try again' : 'Register fingerprint'}</button>}
    </div>
  </div>
}

/** Profile-side enrollment, for members registered before fingerprints were part of registration. */
export function EnrollPhonePasskey({ memberId }: { memberId: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const enroll = async () => {
    setBusy(true); setMessage('')
    try {
      await enrollFingerprint(memberId)
      setMessage('Fingerprint registered. This member can now sign in with their fingerprint.')
      speak('Fingerprint registered.')
    } catch (error) { setMessage(friendlyError(error)) }
    finally { setBusy(false) }
  }
  return <div className="rounded-lg border border-[#e4eae2] bg-[#f8faf7] p-3">
    <div className="flex items-center gap-2 text-xs font-semibold text-[#385b42]"><Fingerprint size={15}/> Fingerprint</div>
    <p className="mt-1 text-[10px] leading-4 text-[#7b897f]">Register or replace this member's fingerprint on their own Android phone using Chrome. The phone verifies the fingerprint; the app never receives a fingerprint image or template.</p>
    <button type="button" disabled={busy} onClick={() => void enroll()} className="mt-3 flex items-center gap-2 rounded-lg bg-[#193e30] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={13}/> : <Fingerprint size={13}/>} {busy ? 'Waiting for phone…' : 'Register fingerprint'}</button>
    {message && <p role="status" className="mt-2 text-[10px] leading-4 text-[#617268]">{message}</p>}
  </div>
}

type Outcome = { tone: 'accepted' | 'declined'; text: string }

export function PhoneBiometricDialog({ open, onClose, onComplete }: { open: boolean; onClose: () => void; onComplete: () => void }) {
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  useEffect(() => { if (open) setOutcome(null) }, [open])
  if (!open) return null

  const scan = async () => {
    setBusy(true); setOutcome(null)
    try {
      if (!window.isSecureContext || !('PublicKeyCredential' in window)) throw new Error('Fingerprint needs HTTPS and a supported browser such as Chrome on Android.')
      // No email: the phone offers the passkey saved at registration and the server finds the member from it.
      const options = await readJson(await fetch('/api/passkeys/authenticate/options', { method: 'POST' }))
      const assertion = await startAuthentication({ optionsJSON: options as PublicKeyCredentialRequestOptionsJSON })
      const response = await fetch('/api/passkeys/authenticate/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response: assertion }) })
      const result = await response.json().catch(() => ({}))
      if (result.status === 'declined' || !response.ok) {
        const reason = result.reason ?? result.error ?? 'Fingerprint not recognised.'
        setOutcome({ tone: 'declined', text: announceDeclined(reason) })
        return
      }
      const spoken = announceOutcome(result)
      const name = result.member?.name ?? 'Member'
      if (result.status === 'accepted') { setOutcome({ tone: 'accepted', text: `Accepted · ${name} checked in` }); onComplete() }
      else if (result.status === 'checked_out') { setOutcome({ tone: 'accepted', text: `Accepted · ${name} checked out` }); onComplete() }
      else setOutcome({ tone: 'declined', text: spoken })
    } catch (error) {
      setOutcome({ tone: 'declined', text: announceDeclined(friendlyError(error)) })
    } finally { setBusy(false) }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#10241c]/65 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="fingerprint-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
    <div className="flex items-start justify-between"><div><div className="grid size-10 place-items-center rounded-xl bg-[#edf3ed] text-[#315f43]"><Fingerprint size={20}/></div><h2 id="fingerprint-title" className="mt-3 text-lg font-semibold">Fingerprint attendance</h2><p className="mt-1 text-xs leading-5 text-[#7b897f]">Tap the button and place your finger on the phone's fingerprint sensor. No email or password needed.</p></div><button onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-[#f3f6f2]"><X size={17}/></button></div>
    <button disabled={busy} onClick={() => void scan()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#193e30] px-4 py-3 text-xs font-semibold text-white disabled:opacity-60">{busy ? <LoaderCircle size={14} className="animate-spin"/> : <Fingerprint size={14}/>} {busy ? 'Verify on your phone…' : outcome ? 'Scan next fingerprint' : 'Scan fingerprint'}</button>
    {outcome && <p role="status" aria-live="polite" className={`mt-4 rounded-lg p-3 text-xs font-medium leading-5 ${outcome.tone === 'accepted' ? 'bg-[#eef6ee] text-[#477b50]' : 'bg-[#f9efed] text-[#a45343]'}`}>{outcome.text}</p>}
    <div className="mt-4 flex items-center justify-between gap-3"><p className="text-[10px] leading-4 text-[#98a29b]">The fingerprint is registered when the member is added. Android keeps it private; LAM stores only a public key.</p><VoiceToggle/></div>
  </section></div>
}
