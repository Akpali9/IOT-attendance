// Spoken "Accepted" / "Declined" announcements for QR and fingerprint attendance.
// Uses the browser's built-in speech synthesis: no audio files, nothing is uploaded.

const VOICE_KEY = "lam-voice-enabled"

export function voiceSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window
}

export function isVoiceEnabled() {
  if (!voiceSupported()) return false
  try {
    return window.localStorage.getItem(VOICE_KEY) !== "off"
  } catch {
    return true
  }
}

export function setVoiceEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(VOICE_KEY, enabled ? "on" : "off")
  } catch {
    // Storage can be blocked; the toggle then only lasts for this page view.
  }
  if (!enabled && voiceSupported()) window.speechSynthesis.cancel()
}

export function speak(text: string) {
  if (!isVoiceEnabled()) return
  try {
    const synth = window.speechSynthesis
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    const voices = synth.getVoices()
    const voice = voices.find((v) => v.lang.toLowerCase().startsWith("en-ng"))
      ?? voices.find((v) => v.lang.toLowerCase().startsWith("en"))
    if (voice) utterance.voice = voice
    utterance.lang = voice?.lang ?? "en"
    utterance.rate = 0.95
    synth.speak(utterance)
  } catch {
    // Speech can be unavailable or blocked by browser settings.
  }
}

type AttendanceOutcome = {
  status: "accepted" | "checked_out" | "already_completed" | "not_registered"
  member?: { name?: string }
}

/** Speaks the outcome of a QR or fingerprint attendance attempt. Returns the spoken text. */
export function announceOutcome(result: AttendanceOutcome) {
  const name = result.member?.name
  let text: string
  switch (result.status) {
    case "accepted":
      text = name ? `Accepted. ${name}, checked in.` : "Accepted. Checked in."
      break
    case "checked_out":
      text = name ? `Accepted. ${name}, checked out.` : "Accepted. Checked out."
      break
    case "already_completed":
      text = name ? `Declined. ${name} has already completed attendance today.` : "Declined. Attendance already completed today."
      break
    default:
      text = "Declined. Not registered."
  }
  speak(text)
  return text
}

/** Speaks a decline with a short reason (cancelled prompt, unknown fingerprint, network error…). */
export function announceDeclined(reason: string) {
  const text = `Declined. ${reason}`
  speak(text)
  return text
}
