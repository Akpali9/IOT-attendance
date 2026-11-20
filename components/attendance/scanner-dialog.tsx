"use client"

import { useEffect, useRef, useState } from "react"
import { BrowserQRCodeReader } from "@zxing/browser"
import { Camera, Check, LoaderCircle, RefreshCw, ShieldCheck, Volume2, VolumeX, X } from "lucide-react"
import { formatTime } from "./utils"
import { announceDeclined, announceOutcome, isVoiceEnabled, setVoiceEnabled, speak, voiceSupported } from "./voice"
import type { ScanResult } from "./types"

type ScanPhase = "starting" | "scanning" | "processing" | "accepted" | "rejected"
type ScannerDialogProps = {
  open: boolean
  onClose: () => void
  onScan: (token: string) => Promise<ScanResult>
}

function playTone(accepted: boolean) {
  try {
    const context = new window.AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.frequency.value = accepted ? 880 : 220
    gain.gain.value = 0.08
    oscillator.start()
    oscillator.stop(context.currentTime + 0.16)
    oscillator.onended = () => void context.close()
  } catch {
    // Audio can be unavailable or blocked by browser settings.
  }
}

export function ScannerDialog({ open, onClose, onScan }: ScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const onScanRef = useRef(onScan)
  const processingRef = useRef(false)
  const [phase, setPhase] = useState<ScanPhase>("starting")
  const [message, setMessage] = useState("Starting camera…")
  const [scanSession, setScanSession] = useState(0)
  const [voiceOn, setVoiceOn] = useState(true)

  useEffect(() => {
    if (open) setVoiceOn(isVoiceEnabled())
  }, [open])

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!open) return

    let cancelled = false
    processingRef.current = false
    setPhase("starting")
    setMessage("Starting camera…")

    const startCamera = async () => {
      try {
        const reader = new BrowserQRCodeReader()
        const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, videoRef.current!, (result) => {
          if (!result || cancelled || processingRef.current) return
          processingRef.current = true
          controlsRef.current?.stop()
          setPhase("processing")
          setMessage("Verifying QR credential…")

          void onScanRef.current(result.getText())
            .then((scanResult) => {
              if (cancelled) return
              if (scanResult.status === "accepted") {
                setPhase("accepted")
                setMessage(`Accepted · ${scanResult.member?.name ?? "Member"} checked in at ${formatTime(scanResult.captured_at)}`)
                announceOutcome(scanResult)
                playTone(true)
              } else if (scanResult.status === "checked_out") {
                setPhase("accepted")
                setMessage(`Accepted · ${scanResult.member?.name ?? "Member"} checked out at ${formatTime(scanResult.clocked_out_at)}`)
                announceOutcome(scanResult)
                playTone(true)
              } else if (scanResult.status === "already_completed") {
                setPhase("rejected")
                setMessage(`Declined · ${scanResult.member?.name ?? "Member"} has completed attendance for today`)
                announceOutcome(scanResult)
                playTone(false)
              } else {
                setPhase("rejected")
                setMessage("Declined · not registered, no attendance was recorded")
                announceOutcome(scanResult)
                playTone(false)
              }
            })
            .catch(() => {
              if (cancelled) return
              setPhase("rejected")
              setMessage("Declined · attendance could not be recorded. Please try again.")
              announceDeclined("Attendance could not be recorded. Please try again.")
              playTone(false)
            })
        })

        if (cancelled) controls.stop()
        else {
          controlsRef.current = controls
          if (!processingRef.current) {
            setPhase("scanning")
            setMessage("Hold the member ID card steady; align its QR code inside the frame")
          }
        }
      } catch {
        if (!cancelled) {
          setPhase("rejected")
          setMessage("Camera unavailable · allow camera access and try again")
          announceDeclined("Camera unavailable.")
          playTone(false)
        }
      }
    }

    void startCamera()
    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [open, scanSession])

  if (!open) return null

  const close = () => {
    controlsRef.current?.stop()
    onClose()
  }

  const retry = () => {
    controlsRef.current?.stop()
    processingRef.current = false
    setPhase("starting")
    setScanSession((current) => current + 1)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#10241c]/70 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="scanner-title" className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#edf0ec] px-5 py-4">
          <div>
            <h2 id="scanner-title" className="text-sm font-semibold">ID card & QR attendance scanner</h2>
            <p className="mt-1 text-[11px] text-[#87928b]">Use the rear camera to read the QR/barcode printed on a member ID card.</p>
          </div>
          <button onClick={close} className="rounded-lg p-2 text-[#748078] hover:bg-[#f4f6f3]" aria-label="Close scanner">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="relative aspect-[4/3] bg-[#10241c]">
          <video ref={videoRef} className="size-full object-cover" aria-label="Camera preview for scanning a member QR card" muted playsInline />
          <div className="pointer-events-none absolute inset-[15%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,.18)]">
            <span className="absolute -left-0.5 -top-0.5 size-5 rounded-tl-lg border-l-[3px] border-t-[3px] border-[#a6d3ae]" />
            <span className="absolute -right-0.5 -top-0.5 size-5 rounded-tr-lg border-r-[3px] border-t-[3px] border-[#a6d3ae]" />
            <span className="absolute -bottom-0.5 -left-0.5 size-5 rounded-bl-lg border-b-[3px] border-l-[3px] border-[#a6d3ae]" />
            <span className="absolute -bottom-0.5 -right-0.5 size-5 rounded-br-lg border-b-[3px] border-r-[3px] border-[#a6d3ae]" />
          </div>
          <div className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-white/80">Scan the QR code printed on the physical or digital ID card</div>
        </div>
        <div className={`flex items-center gap-3 px-5 py-4 ${phase === "accepted" ? "bg-[#eef6ee]" : phase === "rejected" ? "bg-[#f9efed]" : "bg-white"}`} aria-live="polite">
          <span className={`grid size-9 shrink-0 place-items-center rounded-full ${phase === "accepted" ? "bg-[#dceedd] text-[#477b50]" : phase === "rejected" ? "bg-[#f3ded9] text-[#a45343]" : "bg-[#eff3ed] text-[#53735a]"}`}>
            {phase === "accepted" ? <Check size={18} aria-hidden="true" /> : phase === "processing" || phase === "starting" ? <LoaderCircle className="animate-spin" size={17} aria-hidden="true" /> : <Camera size={17} aria-hidden="true" />}
          </span>
          <p className="min-h-5 flex-1 text-xs font-medium text-[#526259]">{message}</p>
          {(phase === "accepted" || phase === "rejected") && (
            <button onClick={retry} className="flex shrink-0 items-center gap-1 rounded-md border border-[#dfe6df] px-2.5 py-2 text-[10px] font-medium text-[#53655a] hover:bg-white">
              <RefreshCw size={12} aria-hidden="true" /> Scan again
            </button>
          )}
        </div>
        <footer className="flex items-center gap-2 border-t border-[#edf0ec] px-5 py-3 text-[10px] text-[#829087]">
          <ShieldCheck size={13} aria-hidden="true" /> <span className="flex-1">ID cards are read locally by the camera. Only the opaque credential is sent for verification; card images are not uploaded.</span>
          {voiceSupported() && (
            <button type="button" aria-pressed={voiceOn} aria-label={voiceOn ? "Turn voice announcements off" : "Turn voice announcements on"} onClick={() => { const next = !voiceOn; setVoiceEnabled(next); setVoiceOn(next); if (next) speak("Voice on.") }} className="flex shrink-0 items-center gap-1.5 rounded-md border border-[#dfe6df] px-2.5 py-2 font-medium text-[#53655a] hover:bg-[#f7faf6]">
              {voiceOn ? <Volume2 size={12} aria-hidden="true" /> : <VolumeX size={12} aria-hidden="true" />} Voice {voiceOn ? "on" : "off"}
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}
