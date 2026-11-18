"use client"

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react"
import { Camera, Download, ImagePlus, LoaderCircle, QrCode, UserRound, X } from "lucide-react"
import QRCode from "qrcode"
import { ORGANIZATION_NAME, ORGANIZATION_SHORT_NAME } from "./constants"
import { formatTime, initials } from "./utils"
import type { AttendanceMember, AttendanceRecord } from "./types"
import { EnrollPhonePasskey } from "./phone-biometric"

export type MemberFormValues = {
  full_name: string
  department: string
  phone: string
  email: string
  iot_device_user_id: string
}

type MemberFormDialogProps = {
  open: boolean
  member?: AttendanceMember | null
  departments: string[]
  saving: boolean
  error?: string | null
  onClose: () => void
  onSubmit: (values: MemberFormValues, photo: File | null) => Promise<void>
}

const emptyValues: MemberFormValues = {
  full_name: "",
  department: "",
  phone: "",
  email: "",
  iot_device_user_id: "",
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

  useEffect(() => {
    if (!open) return
    setValues({
      full_name: member?.full_name ?? "",
      department: member?.department ?? "",
      phone: member?.phone ?? "",
      email: member?.email ?? "",
      iot_device_user_id: member?.iot_device_user_id ?? "",
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

  if (!open) return null

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
    await onSubmit(values, photoFile)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#10241c]/55 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="member-form-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <header className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#7d8c81]">{member ? "Member profile" : "Directory"}</p>
            <h2 id="member-form-title" className="mt-1 text-lg font-semibold">{member ? "Edit member details" : "Add a member"}</h2>
            <p className="mt-1 text-xs text-[#87928b]">{member ? "Update contact details and photo." : "Create a member profile and private QR credential."}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#748078] hover:bg-[#f4f6f3]" aria-label="Close member form">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

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
          <label className="block text-[11px] font-medium text-[#43544a]">
            IoT fingerprint terminal user ID <span className="font-normal text-[#94a098]">(optional)</span>
            <input maxLength={128} value={values.iot_device_user_id} onChange={(event) => update("iot_device_user_id", event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#e3e8e2] px-3 py-2.5 text-xs outline-none focus:border-[#77957d]" placeholder="Enrolled ID from your fingerprint terminal" />
            <span className="mt-1 block text-[10px] leading-4 text-[#89948c]">Enter the exact user ID assigned by the connected fingerprint terminal. Enroll the fingerprint on the terminal itself.</span>
          </label>
          {error && <p role="alert" className="rounded-lg border border-[#efd6d0] bg-[#fbf1ef] px-3 py-2.5 text-xs leading-5 text-[#965544]">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-[#edf0ec] pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-[#e3e8e2] px-4 py-2.5 text-xs font-medium text-[#627168] hover:bg-[#f8faf7]">Cancel</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-[#193e30] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#24533f] disabled:cursor-not-allowed disabled:opacity-60">
              {saving && <LoaderCircle className="animate-spin" size={14} aria-hidden="true" />}
              {saving ? "Saving…" : member ? "Save changes" : "Create member"}
            </button>
          </div>
        </form>
      </section>
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
