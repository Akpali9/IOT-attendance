export type AttendanceMember = {
  id: string
  full_name: string
  department: string
  phone: string
  email: string
  qr_token: string
  iot_device_user_id?: string | null
  face_photo_path: string | null
  created_at: string
  photoUrl?: string | null
}

export type AttendanceRecord = {
  id: string
  member_id: string
  captured_at: string
  clocked_out_at: string | null
  method: string
}

export type AttendanceStatus = "On site" | "Checked out" | "Not checked in" | "No checkout"

export type MemberView = {
  member: AttendanceMember
  record?: AttendanceRecord
  status: AttendanceStatus
}

export type AdminProfile = {
  role: "superadmin" | "admin"
  email: string
}

export type ScanResult = {
  status: "accepted" | "checked_out" | "already_completed" | "not_registered"
  member?: {
    id: string
    name: string
    department: string
  }
  captured_at?: string
  clocked_out_at?: string
}
