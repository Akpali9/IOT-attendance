"use client"

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import { Camera, Download, ImagePlus, LoaderCircle, QrCode, UserRound, X } from "lucide-react"
import QRCode from "qrcode"
import { ORGANIZATION_NAME, ORGANIZATION_SHORT_NAME } from "./constants"
import { formatTime, initials } from "./utils"
import type { AttendanceMember, AttendanceRecord } from "./types"
import { EnrollPhonePasskey, RegistrationFingerprintStep } from "./phone-biometric"

export type MemberFormValues = {
  full_name: string
  department: string
  phone: string
  email: string
}

type MemberFormDialogProps = {
  open: boolean
  member?: AttendanceMember | null
  departments: string[]
  saving: boolean
  error?: string | null
  onClose: () => void
  /** Resolves with the new member's id when a member was created (so fingerprint registration can follow), otherwise null. */
  onSubmit: (values: MemberFormValues, photo: File | null) => Promise<string | null>
}

const emptyValues: MemberFormValues = {
  full_name: "",
  department: "",
  phone: "",
  email: "",
}

export function MemberFormDialog({
  open,
  member,
  departments,
  saving,
  error,
  onClose,
  onSubmit,
}: MemberFormDialogProps) {
  const [values, setValues] = useState<MemberFormValues>(emptyValues)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [newMember, setNewMember] = useState<{ id: string; name: string } | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!open) return
    setNewMember(null)
    setValues({
      full_name: member?.full_name ?? "",
      department: member?.department ?? "",
      phone: member?.phone ?? "",
      email: member?.email ?? "",
    })
    setPhotoFile(null)
    setFileError(null)
  }, [open, member?.id])

  useEffect(() => {
    if (photoFile) {
      const url = URL.createObjectURL(photoFile)
      setPreview(url)
      return () => URL.revokeObjectURL(url)
    }
    setPreview(member?.photoUrl ?? null)
  }, [photoFile, member?.photoUrl])

  useEffect(() => {
    if (!cameraOpen) return
    let cancelled = false
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Live camera requires HTTPS and a supported browser.")
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return }
        cameraStreamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      } catch (error) { setCameraError(error instanceof Error ? error.message : "Could not access the camera. Check browser permission.") }
    }
    void start()
    return () => { cancelled = true; cameraStreamRef.current?.getTracks().forEach((track) => track.stop()); cameraStreamRef.current = null }
  }, [cameraOpen])

  if (!open) return null

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) { setCameraError("Camera is not ready yet. Try again in a moment."); return }
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    const context = canvas.getContext("2d")
    if (!context) { setCameraError("Photo capture is unavailable on this browser."); return }
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) { setCameraError("The photo could not be captured."); return }
      setPhotoFile(new File([blob], `member-${Date.now()}.jpg`, { type: "image/jpeg" }))
      setFileError(null); setCameraOpen(false)
    }, "image/jpeg", 0.88)
  }

  const update = (key: keyof MemberFormValues, value: string) =>
    setValues((current) => ({ ...current, [key]: value }))

  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setFileError("Choose a JPG, PNG, or WebP image.")
      event.currentTarget.value = ""
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileError("Photo must be 5 MB or smaller.")
      event.currentTarget.value = ""
      return
    }
    setFileError(null)
    setPhotoFile(file)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const createdId = await onSubmit(values, photoFile)
    // New members go straight to fingerprint registration before the form closes.
    if (!member && createdId) setNewMember({ id: createdId, name: values.full_name.trim() })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#10241c]/55 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="member-form-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <header className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#7d8c81]">{member ? "Member profile" : "Directory"}</p>
            <h2 id="member-form-title" className="mt-1 text-lg font-semibold">{member ? "Edit member details" : newMember ? "Register fingerprint" : "Add a member"}</h2>
            <p className="mt-1 text-xs text-[#87928b]">{member ? "Update contact details and photo." : newMember ? "Last step: take the member's fingerprint." : "Create a member profile, private QR credential and fingerprint."}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#748078] hover:bg-[#f4f6f3]" aria-label="Close member form">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {newMember ? (
          <RegistrationFingerprintStep memberId={newMember.id} memberName={newMember.name} onDone={onClose} />
        ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="grid size-[68px] shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-[#cfd8ce] bg-[#f6f8f5] text-[#77867b]">
              {preview ? (
                <img src={preview} alt="Member photo preview" className="size-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1">
                  {member ? <Camera size={17} aria-hidden="true" /> : <ImagePlus size={17} aria-hidden="true" />}
                  <span className="text-[9px]">Photo</span>
                </span>
              )}
              <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={choosePhoto} aria-label="Upload or capture member photo" />
            </label>
            <div>
              <div className="text-xs font-medium">Member photo</div>
              <div className="mt-1 max-w-[260px] text-[10px] leading-4 text-[#8b958e]">
                Upload from a computer or use the device camera. JPG, PNG, or WebP, up to 5 MB.
              </div>
              {member && <div className="mt-1 text-[10px] text-[#8b958e]">Leave unchanged to keep the current photo.</div>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setCameraError(null); setCameraOpen(true) }} className="rounded-lg border border-[#dfe6de] px-3 py-2 text-[10px] font-semibold text-[#49634f] hover:bg-[#f7faf6]">
              <Camera size={13} className="mr-1.5 inline" />Open live camera
            </button>
            {photoFile && <span className="self-center text-[10px] text-[#54765b]">Photo ready to save</span>}
          </div>
          {fileError && <p className="text-xs text-[#a45343]" role="alert">{fileError}</p>}

          <label className="block text-[11px] font-medium text-[#43544a]">
            Full name
            <input required maxLength={120} value={values.full_name} onChange={(event) => update("full_name", event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#e3e8e2] px-3 py-2.5 text-xs outline-none focus:border-[#77957d]" placeholder="Member full name" />
          </label>
          <label className="block text-[11px] font-medium text-[#43544a]">
            Department / group
            <input required list="lam-departments" maxLength={80} value={values.department} onChange={(event) => update("department", event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#e3e8e2] px-3 py-2.5 text-xs outline-none focus:border-[#77957d]" placeholder="e.g. Youth Ministry" />
            <datalist id="lam-departments">{departments.map((department) => <option key={department} value={department} />)}</datalist>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[11px] font-medium text-[#43544a]">
              Phone number
              <input required type="tel" maxLength={40} value={values.phone} onChange={(event) => update("phone", event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#e3e8e2] px-3 py-2.5 text-xs outline-none focus:border-[#77957d]" placeholder="+1 555 0100" />
            </label>
            <label className="block text-[11px] font-medium text-[#43544a]">
              Email address
              <input required type="email" maxLength={254} value={values.email} onChange={(event) => update("email", event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#e3e8e2] px-3 py-2.5 text-xs outline-none focus:border-[#77957d]" placeholder="member@example.org" />
            </label>
          </div>
          {error && <p role="alert" className="rounded-lg border border-[#efd6d0] bg-[#fbf1ef] px-3 py-2.5 text-xs leading-5 text-[#965544]">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-[#edf0ec] pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-[#e3e8e2] px-4 py-2.5 text-xs font-medium text-[#627168] hover:bg-[#f8faf7]">Cancel</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-[#193e30] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#24533f] disabled:cursor-not-allowed disabled:opacity-60">
              {saving && <LoaderCircle className="animate-spin" size={14} aria-hidden="true" />}
              {saving ? "Saving…" : member ? "Save changes" : "Create member and add fingerprint"}
            </button>
          </div>
        </form>
        )}
      </section>
      {cameraOpen && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-[#10241c]/80 p-4">
          <section role="dialog" aria-modal="true" aria-label="Capture member photo" className="w-full max-w-md overflow-hidden rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-[#263b2e]">Capture member photo</h3><button type="button" onClick={() => setCameraOpen(false)} className="rounded-lg p-2 hover:bg-[#f3f6f2]" aria-label="Close camera"><X size={17}/></button></div>
            <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full rounded-xl bg-[#10241c] object-cover" />
            {cameraError && <p role="alert" className="mt-2 text-xs text-[#a45343]">{cameraError}</p>}
            <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setCameraOpen(false)} className="rounded-lg border border-[#e3e8e2] px-3 py-2 text-xs">Cancel</button><button type="button" onClick={capturePhoto} className="rounded-lg bg-[#193e30] px-4 py-2 text-xs font-semibold text-white">Capture photo</button></div>
          </section>
        </div>
      )}
    </div>
  )
}

type MemberProfileDialogProps = {
  member: AttendanceMember | null
  record?: AttendanceRecord
  status?: string
  onClose: () => void
  onEdit: (member: AttendanceMember) => void
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = "anonymous"
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Image could not be loaded"))
    image.src = source
  })
}

export function MemberProfileDialog({ member, record, status, onClose, onEdit }: MemberProfileDialogProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setQrDataUrl(null)
    if (member) {
      void QRCode.toDataURL(member.qr_token, {
        width: 240,
        margin: 1,
        color: { dark: "#142b23", light: "#ffffff" },
      }).then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl)
      }).catch(() => {
        if (active) setQrDataUrl(null)
      })
    }
    return () => { active = false }
  }, [member?.qr_token])

  if (!member) return null

  const downloadCard = async () => {
    setDownloading(true)
    setDownloadError(null)
    try {
      const qr = await QRCode.toDataURL(member.qr_token, {
        width: 240,
        margin: 1,
        color: { dark: "#142b23", light: "#ffffff" },
      })
      const qrImage = await loadImage(qr)
      const canvas = document.createElement("canvas")
      canvas.width = 960
      canvas.height = 600
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Canvas is unavailable")

      context.fillStyle = "#f8f8f4"
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = "#123b2d"
      context.fillRect(0, 0, canvas.width, 190)
      context.fillStyle = "#bcd1c0"
      context.font = "600 22px Arial"
      context.fillText(`${ORGANIZATION_NAME.toUpperCase()}  /  MEMBER IDENTIFICATION`, 56, 54)
      context.fillStyle = "#ffffff"
      context.font = "700 42px Arial"
      context.fillText(member.full_name.slice(0, 34), 56, 112)

      if (member.photoUrl) {
        try {
          const portrait = await loadImage(member.photoUrl)
          context.drawImage(portrait, 56, 225, 128, 128)
        } catch {
          // The private photo may have expired; the QR card still remains usable.
        }
      }

      context.fillStyle = "#728078"
      context.font = "600 16px Arial"
      context.fillText("DEPARTMENT / GROUP", 56, 398)
      context.fillText("PHONE", 56, 470)
      context.fillText(`MEMBER  ${member.id.slice(0, 8).toUpperCase()}`, 56, 536)
      context.fillStyle = "#142b23"
      context.font = "500 25px Arial"
      context.fillText(member.department.slice(0, 34), 56, 423)
      context.fillText(member.phone.slice(0, 30), 56, 495)
      context.drawImage(qrImage, 650, 225, 230, 230)
      context.fillStyle = "#728078"
      context.font = "500 14px Arial"
      context.textAlign = "center"
      context.fillText("OPAQUE TOKEN · ADMIN SCAN ONLY", 765, 480)

      const link = document.createElement("a")
      link.download = `${member.full_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}-lam-id-card.png`
      link.href = canvas.toDataURL("image/png")
      link.click()
    } catch {
      setDownloadError("The ID card could not be generated. Please try again.")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#10241c]/55 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="member-profile-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <header className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#7d8c81]">{ORGANIZATION_SHORT_NAME} member ID</p>
            <h2 id="member-profile-title" className="mt-1 text-lg font-semibold">{member.full_name}</h2>
            <p className="mt-1 text-xs text-[#87928b]">{member.department} · {status ?? "Member profile"}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-[#748078] hover:bg-[#f4f6f3]" aria-label="Close member profile">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="grid gap-5 md:grid-cols-[1fr_220px]">
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-xl border border-[#e7eae5] bg-[#fafbf9] p-4">
              {member.photoUrl ? (
                <img src={member.photoUrl} alt={`Portrait of ${member.full_name}`} className="size-16 rounded-xl object-cover" />
              ) : (
                <span className="grid size-16 place-items-center rounded-xl bg-[#e8eee7] text-lg font-semibold text-[#49634f]">
                  {initials(member.full_name) || <UserRound size={20} aria-hidden="true" />}
                </span>
              )}
              <div>
                <div className="text-sm font-semibold">{member.full_name}</div>
                <div className="mt-1 text-xs text-[#758179]">{member.department}</div>
                <div className="mt-2 text-[10px] font-medium uppercase tracking-[.08em] text-[#8b958e]">Member · {member.id.slice(0, 8).toUpperCase()}</div>
              </div>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[#edf0ec] p-3"><dt className="text-[10px] uppercase tracking-[.08em] text-[#8b958e]">Phone</dt><dd className="mt-1 text-xs font-medium text-[#33483a]">{member.phone}</dd></div>
              <div className="rounded-lg border border-[#edf0ec] p-3"><dt className="text-[10px] uppercase tracking-[.08em] text-[#8b958e]">Email</dt><dd className="mt-1 break-all text-xs font-medium text-[#33483a]">{member.email}</dd></div>
              <div className="rounded-lg border border-[#edf0ec] p-3"><dt className="text-[10px] uppercase tracking-[.08em] text-[#8b958e]">Check-in</dt><dd className="mt-1 text-xs font-medium text-[#33483a]">{formatTime(record?.captured_at)}</dd></div>
              <div className="rounded-lg border border-[#edf0ec] p-3"><dt className="text-[10px] uppercase tracking-[.08em] text-[#8b958e]">Check-out</dt><dd className="mt-1 text-xs font-medium text-[#33483a]">{formatTime(record?.clocked_out_at)}</dd></div>
            </dl>
            <div className="rounded-lg bg-[#f3f6f1] px-3.5 py-3 text-[10px] leading-5 text-[#66766b]">
              This QR contains a random token, not a web link or personal details. Only an authenticated LAM administrator can use it to record attendance.
            </div>
          </div>
          <div className="flex flex-col items-center rounded-xl border border-[#e7eae5] bg-[#fafbf9] p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#405749]"><QrCode size={15} aria-hidden="true" />Member QR credential</div>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt={`Private QR credential for ${member.full_name}`} className="size-[180px] rounded-lg bg-white p-2" />
            ) : (
              <span className="grid size-[180px] place-items-center rounded-lg bg-white text-[#849088]" aria-label="Generating QR credential"><LoaderCircle className="animate-spin" size={20} aria-hidden="true" /></span>
            )}
            <p className="mt-3 text-center text-[10px] leading-4 text-[#89948c]">Use the LAM attendance scanner. This code is not a URL.</p>
          </div>
        </div>
        <div className="mt-5"><EnrollPhonePasskey memberId={member.id} /></div>
        {downloadError && <p role="alert" className="mt-4 text-xs text-[#a45343]">{downloadError}</p>}
        <footer className="mt-5 flex flex-wrap justify-end gap-2 border-t border-[#edf0ec] pt-4">
          <button onClick={() => onEdit(member)} className="rounded-lg border border-[#e3e8e2] px-4 py-2.5 text-xs font-medium text-[#627168] hover:bg-[#f8faf7]">Edit details</button>
          <button onClick={() => void downloadCard()} disabled={downloading} className="flex items-center gap-2 rounded-lg bg-[#193e30] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#24533f] disabled:cursor-not-allowed disabled:opacity-60">
            {downloading ? <LoaderCircle className="animate-spin" size={14} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
            {downloading ? "Preparing card…" : "Download ID card"}
          </button>
        </footer>
      </section>
    </div>
  )
}
