"use client"

import { useState, type FormEvent } from "react"
import { KeyRound, LoaderCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export function PasswordChangeCard() {
  const supabase = createClient()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setError(null)
    if (password.length < 12) {
      setError("Use at least 12 characters for your new password.")
      return
    }
    if (password !== confirm) {
      setError("The passwords do not match.")
      return
    }
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) {
      setError("Password could not be changed. Please try again.")
      return
    }
    setPassword("")
    setConfirm("")
    setMessage("Administrator password updated successfully.")
  }

  return (
    <article className="rounded-xl border border-[#e8ebe6] bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-[#f0f2ef] text-[#607267]"><KeyRound size={18} aria-hidden="true" /></span>
        <div><h2 className="text-sm font-semibold">Change administrator password</h2><p className="mt-1 text-[10px] text-[#89948c]">Replace the initial password with a strong private password.</p></div>
      </div>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="block text-[11px] font-medium text-[#43544a]">New password<input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#e3e8e2] px-3 py-2.5 text-xs outline-none focus:border-[#77957d]" placeholder="At least 12 characters" /></label>
        <label className="block text-[11px] font-medium text-[#43544a]">Confirm new password<input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#e3e8e2] px-3 py-2.5 text-xs outline-none focus:border-[#77957d]" placeholder="Re-enter new password" /></label>
        {error && <p role="alert" className="rounded-lg bg-[#fbf1ef] px-3 py-2.5 text-[11px] text-[#965544]">{error}</p>}
        {message && <p role="status" className="rounded-lg bg-[#eef6ee] px-3 py-2.5 text-[11px] text-[#477b50]">{message}</p>}
        <button disabled={busy} className="flex items-center gap-2 rounded-lg bg-[#193e30] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#24533f] disabled:opacity-60" type="submit">{busy && <LoaderCircle className="animate-spin" size={13} />}Update password</button>
      </form>
    </article>
  )
}
