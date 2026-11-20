"use client"

import { useEffect, useRef, useState } from "react"
import { BrowserQRCodeReader } from "@zxing/browser"
import { Camera, Check, LoaderCircle, RefreshCw, ShieldCheck, Volume2, VolumeX, X, ScanFace } from "lucide-react"
import { formatTime } from "./utils"
import { announceDeclined, announceOutcome, isVoiceEnabled, setVoiceEnabled, speak, voiceSupported } from "./voice"
import type { ScanResult } from "./types"

type Phase = "starting" | "scanning" | "face" | "processing" | "accepted" | "rejected"
type Props = { open: boolean; onClose: () => void; onScan: (token: string, faceImage: string) => Promise<ScanResult> }

function playTone(ok: boolean) {
  try { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value = ok ? 880 : 220; gain.gain.value = .08; osc.start(); osc.stop(ctx.currentTime + .16); osc.onended = () => void ctx.close() } catch {}
}

export function ScannerDialog({ open, onClose, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const faceVideoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const tokenRef = useRef("")
  const processingRef = useRef(false)
  const onScanRef = useRef(onScan)
  const [phase, setPhase] = useState<Phase>("starting")
  const [message, setMessage] = useState("Starting QR scanner…")
  const [scanSession, setScanSession] = useState(0)
  const [voiceOn, setVoiceOn] = useState(true)
  useEffect(() => { onScanRef.current = onScan }, [onScan])
  useEffect(() => { if (open) setVoiceOn(isVoiceEnabled()) }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    processingRef.current = false
    tokenRef.current = ""
    setPhase("starting"); setMessage("Starting QR scanner…")
    const start = async () => {
      try {
        const reader = new BrowserQRCodeReader()
        const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, videoRef.current!, (result) => {
          if (!result || cancelled || processingRef.current) return
          processingRef.current = true
          tokenRef.current = result.getText()
          controlsRef.current?.stop(); controlsRef.current = null
          setPhase("face"); setMessage("QR recognised. Opening front camera for face verification…")
          void navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }).then((stream) => {
            if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
            streamRef.current = stream
            if (faceVideoRef.current) { faceVideoRef.current.srcObject = stream; void faceVideoRef.current.play() }
          }).catch(() => { if (!cancelled) { setPhase("rejected"); setMessage("Front camera unavailable. Allow camera access and scan again."); playTone(false) } })
        })
        if (cancelled) controls.stop()
        else { controlsRef.current = controls; if (!processingRef.current) { setPhase("scanning"); setMessage("Hold the member ID card inside the QR frame") } }
      } catch { if (!cancelled) { setPhase("rejected"); setMessage("Camera unavailable. Allow camera access and try again."); announceDeclined("Camera unavailable.") } }
    }
    void start()
    return () => { cancelled = true; controlsRef.current?.stop(); controlsRef.current = null; streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }, [open, scanSession])

  if (!open) return null
  const stopCameras = () => { controlsRef.current?.stop(); controlsRef.current = null; streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null }
  const close = () => { stopCameras(); onClose() }
  const retry = () => { stopCameras(); processingRef.current = false; tokenRef.current = ""; setPhase("starting"); setScanSession(v => v + 1) }
  const captureAndVerify = async () => {
    const video = faceVideoRef.current, canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth || !tokenRef.current || processingRef.current === false) return
    // Face++ limits each uploaded image to 2 MB. Downscale the live frame
    // before converting it to base64 so the JSON request stays comfortably small.
    const scale = Math.min(1, 1024 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const context = canvas.getContext("2d")
    if (!context) return
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const faceImage = canvas.toDataURL("image/jpeg", .72)
    setPhase("processing"); setMessage("Comparing live face with registered profile…")
    stopCameras()
    try {
      const result = await onScanRef.current(tokenRef.current, faceImage)
      if (result.status === "accepted" || result.status === "checked_out") {
        setPhase("accepted")
        setMessage(result.status === "accepted" ? `Face verified · ${result.member?.name ?? "Member"} checked in at ${formatTime(result.captured_at)}` : `Face verified · ${result.member?.name ?? "Member"} checked out at ${formatTime(result.clocked_out_at)}`)
        announceOutcome(result); playTone(true)
      } else {
        setPhase("rejected"); setMessage((result as ScanResult & { message?: string }).message ?? (result.status === "already_completed" ? "Attendance already completed today." : "Verification declined. No attendance was recorded."))
        announceDeclined((result as ScanResult & { message?: string }).message ?? "Verification declined."); playTone(false)
      }
    } catch (error) { setPhase("rejected"); setMessage(error instanceof Error ? error.message : "Verification failed. No attendance was recorded."); announceDeclined("Verification failed. No attendance was recorded."); playTone(false) }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#10241c]/70 p-4 backdrop-blur-sm">
    <section role="dialog" aria-modal="true" aria-labelledby="scanner-title" className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-[#edf0ec] px-5 py-4"><div><h2 id="scanner-title" className="text-sm font-semibold">QR + face attendance</h2><p className="mt-1 text-[11px] text-[#87928b]">Scan the ID, then verify the live face before attendance is saved.</p></div><button onClick={close} className="rounded-lg p-2 text-[#748078] hover:bg-[#f4f6f3]" aria-label="Close scanner"><X size={18}/></button></header>
      <div className="relative aspect-[4/3] bg-[#10241c]">
        <video ref={videoRef} className={`size-full object-cover ${phase === "face" || phase === "processing" || phase === "accepted" || phase === "rejected" ? "hidden" : ""}`} muted playsInline />
        <video ref={faceVideoRef} className={`size-full object-cover ${phase === "face" ? "" : "hidden"}`} muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
        {(phase === "scanning" || phase === "starting") && <div className="pointer-events-none absolute inset-[15%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,.18)]"><span className="absolute -left-0.5 -top-0.5 size-5 rounded-tl-lg border-l-[3px] border-t-[3px] border-[#a6d3ae]"/><span className="absolute -right-0.5 -top-0.5 size-5 rounded-tr-lg border-r-[3px] border-t-[3px] border-[#a6d3ae]"/><span className="absolute -bottom-0.5 -left-0.5 size-5 rounded-bl-lg border-b-[3px] border-l-[3px] border-[#a6d3ae]"/><span className="absolute -bottom-0.5 -right-0.5 size-5 rounded-br-lg border-b-[3px] border-r-[3px] border-[#a6d3ae]"/></div>}
        {phase === "face" && <div className="pointer-events-none absolute inset-[12%] rounded-[45%] border-2 border-dashed border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,.12)]"/>}
        {(phase === "processing" || phase === "accepted" || phase === "rejected") && <div className="absolute inset-0 grid place-items-center bg-[#10241c] text-white"><div className="text-center"><ShieldCheck className="mx-auto mb-2" size={34}/><p className="text-sm">{phase === "processing" ? "Secure identity check" : phase === "accepted" ? "Identity verified" : "Verification not accepted"}</p></div></div>}
        <div className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-white/90">{phase === "face" ? "Position one face inside the oval, then capture" : "QR card scan and face verification"}</div>
      </div>
      <div className={`flex items-center gap-3 px-5 py-4 ${phase === "accepted" ? "bg-[#eef6ee]" : phase === "rejected" ? "bg-[#f9efed]" : "bg-white"}`} aria-live="polite">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#eff3ed] text-[#53735a]">{phase === "accepted" ? <Check size={18}/> : phase === "processing" || phase === "starting" ? <LoaderCircle className="animate-spin" size={17}/> : phase === "face" ? <ScanFace size={18}/> : <Camera size={17}/>}</span>
        <p className="min-h-5 flex-1 text-xs font-medium text-[#526259]">{message}</p>
        {phase === "face" && <button onClick={() => void captureAndVerify()} className="shrink-0 rounded-md bg-[#315f40] px-3 py-2 text-[11px] font-semibold text-white hover:bg-[#264d33]">Capture & verify</button>}
        {(phase === "accepted" || phase === "rejected") && <button onClick={retry} className="flex shrink-0 items-center gap-1 rounded-md border border-[#dfe6df] px-2.5 py-2 text-[10px] font-medium text-[#53655a]"><RefreshCw size={12}/> Scan again</button>}
      </div>
      <footer className="flex items-center gap-2 border-t border-[#edf0ec] px-5 py-3 text-[10px] text-[#829087]"><ShieldCheck size={13}/><span className="flex-1">Attendance is saved only after the registered face comparison succeeds.</span>{voiceSupported() && <button type="button" aria-pressed={voiceOn} onClick={() => { const next = !voiceOn; setVoiceEnabled(next); setVoiceOn(next); if (next) speak("Voice on.") }} className="flex shrink-0 items-center gap-1.5 rounded-md border border-[#dfe6df] px-2.5 py-2 font-medium">{voiceOn ? <Volume2 size={12}/> : <VolumeX size={12}/>} Voice {voiceOn ? "on" : "off"}</button>}</footer>
    </section>
  </div>
}
