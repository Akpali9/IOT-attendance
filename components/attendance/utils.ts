import type { AttendanceRecord, AttendanceStatus } from "./types"

export function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

export function formatTime(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date)
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function attendanceStatus(
  record: AttendanceRecord | undefined,
  date: string,
): AttendanceStatus {
  if (!record) return "Not checked in"
  if (record.clocked_out_at) return "Checked out"
  return date === todayUtc() ? "On site" : "No checkout"
}

export function csvCell(value: string | number | null | undefined) {
  let text = String(value ?? "")
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
