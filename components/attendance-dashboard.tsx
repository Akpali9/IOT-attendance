"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import useSWR from "swr"
import type { LucideIcon } from "lucide-react"
import type { SupabaseClient, User } from "@supabase/supabase-js"
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Fingerprint,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react"
import { AdminAccess } from "./attendance/admin-access"
import { ORGANIZATION_NAME, ORGANIZATION_SHORT_NAME, MEMBER_PHOTO_BUCKET } from "./attendance/constants"
import { MemberList } from "./attendance/member-list"
import { MemberFormDialog, MemberProfileDialog, type MemberFormValues } from "./attendance/member-dialogs"
import { ScannerDialog } from "./attendance/scanner-dialog"
import { PhoneBiometricDialog } from "./attendance/phone-biometric"
import { PasswordChangeCard } from "./attendance/password-change"
import { attendanceStatus, csvCell, formatDate, formatTime, initials, todayUtc } from "./attendance/utils"
import { createClient } from "@/lib/supabase/client"
import type { AdminProfile, AttendanceMember, AttendanceRecord, MemberView, ScanResult } from "./attendance/types"

type DashboardData = {
  members: AttendanceMember[]
  records: AttendanceRecord[]
}

type Credentials = { username: string; password: string }
type SetupCredentials = Credentials & { setupToken: string }
type TabId = "Overview" | "Members" | "Attendance" | "Access & security"

type NavItem = { title: TabId; icon: LucideIcon }

const navItems: NavItem[] = [
  { title: "Overview", icon: LayoutDashboard },
  { title: "Members", icon: Users },
  { title: "Attendance", icon: ClipboardList },
  { title: "Access & security", icon: ShieldCheck },
]

async function loadDashboardData(client: SupabaseClient, date: string): Promise<DashboardData> {
  const [membersResult, recordsResult] = await Promise.all([
    client
      .from("attendance_members")
      .select("id,full_name,department,phone,email,qr_token,iot_device_user_id,face_photo_path,created_at")
      .order("full_name", { ascending: true }),
    client
      .from("attendance_records")
      .select("id,member_id,captured_at,clocked_out_at,method")
      .eq("attendance_date", date)
      .order("captured_at", { ascending: false }),
  ])

  if (membersResult.error || recordsResult.error) {
    throw new Error("Attendance data could not be loaded.")
  }

  const members = (membersResult.data ?? []) as unknown as AttendanceMember[]
  const records = (recordsResult.data ?? []) as unknown as AttendanceRecord[]
  const photoPaths = Array.from(
    new Set(members.map((member) => member.face_photo_path).filter((path): path is string => Boolean(path))),
  )
  const photoUrls = new Map<string, string>()

  if (photoPaths.length > 0) {
    const { data: signedUrls } = await client.storage
      .from(MEMBER_PHOTO_BUCKET)
      .createSignedUrls(photoPaths, 60 * 60)

    for (const item of signedUrls ?? []) {
      if (item.path && item.signedUrl) photoUrls.set(item.path, item.signedUrl)
    }
  }

  return {
    members: members.map((member) => ({
      ...member,
      photoUrl: member.face_photo_path ? photoUrls.get(member.face_photo_path) ?? null : null,
    })),
    records,
  }
}

function FullScreenMessage({ title, message }: { title: string; message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f7f4] p-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e9f0e8] text-[#426b4b]">
          <ShieldCheck size={21} aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-[#263b2e]">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-[#738078]">{message}</p>
      </div>
    </main>
  )
}

function StatusCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string
  value: string | number
  note: string
  icon: LucideIcon
  tone: "green" | "amber" | "blue" | "stone"
}) {
  const tones = {
    green: "bg-[#edf5ee] text-[#487b50]",
    amber: "bg-[#f7f2e8] text-[#92784a]",
    blue: "bg-[#edf2f4] text-[#55727d]",
    stone: "bg-[#f0f2ef] text-[#66746b]",
  }

  return (
    <article className="rounded-xl border border-[#e8ebe6] bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[.09em] text-[#87928b]">{label}</p>
          <div className="mt-2 text-2xl font-semibold tracking-[-.04em] text-[#20372a]">{value}</div>
        </div>
        <span className={`grid size-9 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon size={17} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-[10px] text-[#8b958e]">{note}</p>
    </article>
  )
}

function WorkspaceSidebar({
  activeTab,
  onNavigate,
  username,
  role,
  onSignOut,
  onClose,
}: {
  activeTab: TabId
  onNavigate: (tab: TabId) => void
  username: string
  role: string
  onSignOut: () => void
  onClose?: () => void
}) {
  return (
    <div className="flex h-full flex-col bg-white px-4 py-5">
      <div className="flex items-center gap-3 px-2">
        <span className="grid size-10 place-items-center rounded-xl bg-[#173c2e] text-sm font-bold tracking-tight text-white">{ORGANIZATION_SHORT_NAME}</span>
        <div>
          <div className="text-xs font-semibold text-[#263b2e]">{ORGANIZATION_NAME}</div>
          <div className="mt-0.5 text-[9px] font-medium uppercase tracking-[.14em] text-[#909a93]">Attendance workspace</div>
        </div>
      </div>
      <nav aria-label="Primary navigation" className="mt-10 space-y-1">
        <div className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[.14em] text-[#a0a8a2]">Workspace</div>
        {navItems.map(({ title, icon: Icon }) => (
          <button
            key={title}
            onClick={() => {
              onNavigate(title)
              onClose?.()
            }}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs transition ${activeTab === title ? "bg-[#edf3ed] font-semibold text-[#315f43]" : "text-[#68766d] hover:bg-[#f7f9f6] hover:text-[#344c3b]"}`}
            aria-current={activeTab === title ? "page" : undefined}
          >
            <Icon size={16} aria-hidden="true" />
            {title}
          </button>
        ))}
      </nav>
      <div className="mt-auto rounded-xl border border-[#e8ece7] bg-[#fafbf9] p-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#dfe9df] text-[10px] font-semibold text-[#43664a]">
            {initials(username) || "AD"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold text-[#33483a]">{username}</div>
            <div className="mt-0.5 text-[9px] text-[#87928b]">{role}</div>
          </div>
        </div>
        <button onClick={onSignOut} className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[10px] font-medium text-[#68766d] hover:bg-[#f0f3ef] hover:text-[#31483a]">
          <LogOut size={13} aria-hidden="true" /> Sign out
        </button>
      </div>
    </div>
  )
}

function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-[#dce3da] bg-white px-6 py-10 text-center">
      <div>
        <div className="mx-auto grid size-10 place-items-center rounded-full bg-[#eff4ee] text-[#55755b]"><Users size={17} aria-hidden="true" /></div>
        <h3 className="mt-3 text-sm font-semibold text-[#304438]">{title}</h3>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#87928b]">{message}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  )
}

export default function AttendanceDashboard() {
  const supabase = useMemo(() => createClient(), [])
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>("Overview")
  const [attendanceDate, setAttendanceDate] = useState(todayUtc())
  const [search, setSearch] = useState("")
  const [departmentFilter, setDepartmentFilter] = useState("All departments")
  const [scannerOpen, setScannerOpen] = useState(false)
  const [phoneBiometricOpen, setPhoneBiometricOpen] = useState(false)
  const [memberFormOpen, setMemberFormOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<AttendanceMember | null>(null)
  const [selectedMember, setSelectedMember] = useState<AttendanceMember | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [memberSaving, setMemberSaving] = useState(false)
  const [memberError, setMemberError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null)
      setAuthReady(true)
    })

    void supabase.auth.getUser().then(({ data: sessionData }) => {
      if (!active) return
      setAuthUser(sessionData.user)
      setAuthReady(true)
    }).catch(() => {
      if (!active) return
      setAuthUser(null)
      setAuthReady(true)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [supabase])

  const adminKey = authUser ? `attendance-admin:${authUser.id}` : null
  const {
    data: admin,
    error: adminError,
    isLoading: adminLoading,
    mutate: refreshAdmin,
  } = useSWR<AdminProfile | null>(adminKey, async () => {
    if (!authUser) return null
    const { data, error } = await supabase
      .from("attendance_admins")
      .select("role,email")
      .eq("user_id", authUser.id)
      .maybeSingle()
    if (error) throw error
    return data as AdminProfile | null
  })

  useEffect(() => {
    if (authUser && !adminLoading && !adminError && !admin) {
      void supabase.auth.signOut()
    }
  }, [authUser, admin, adminError, adminLoading, supabase])

  const isAdmin = Boolean(authUser && admin)
  const dashboardKey = isAdmin && authUser
    ? `attendance-dashboard:${authUser.id}:${attendanceDate}`
    : null
  const {
    data: dashboard,
    error: dashboardError,
    isLoading: dashboardLoading,
    isValidating: dashboardValidating,
    mutate: mutateDashboard,
  } = useSWR<DashboardData>(dashboardKey, () => loadDashboardData(supabase, attendanceDate), {
    revalidateOnFocus: true,
  })

  const recordsByMember = useMemo(() => {
    return new Map((dashboard?.records ?? []).map((record) => [record.member_id, record]))
  }, [dashboard?.records])

  const memberRows = useMemo<MemberView[]>(() => {
    return (dashboard?.members ?? []).map((member) => {
      const record = recordsByMember.get(member.id)
      return { member, record, status: attendanceStatus(record, attendanceDate) }
    })
  }, [attendanceDate, dashboard?.members, recordsByMember])

  const departments = useMemo(() => {
    return Array.from(new Set((dashboard?.members ?? []).map((member) => member.department.trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b))
  }, [dashboard?.members])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return memberRows.filter(({ member }) => {
      const matchesDepartment = departmentFilter === "All departments" || member.department === departmentFilter
      const matchesSearch = !query || [member.full_name, member.department, member.email, member.phone]
        .some((value) => value.toLowerCase().includes(query))
      return matchesDepartment && matchesSearch
    })
  }, [departmentFilter, memberRows, search])

  const signIn = useCallback(async ({ username, password }: Credentials) => {
    const normalizedUsername = username.trim().toLowerCase()

    const isValidUsername = /^[a-z0-9][a-z0-9._-]{2,31}$/.test(normalizedUsername)
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedUsername)

    if (!isValidUsername && !isValidEmail) {
      return "Enter a valid administrator username or email and password."
    }

    const email = normalizedUsername.includes("@")
      ? normalizedUsername
      : `${normalizedUsername}@attendance.invalid`

    console.log("[signIn] Attempting login with email:", email)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error || !data.user) {
      console.error("[signIn] Supabase auth error:", error?.message)
      if (error?.message?.includes("Invalid login credentials")) {
        return "Invalid username/email or password."
      }
      if (error?.message?.includes("Email not confirmed")) {
        return "Email not confirmed. Ask an administrator to confirm the account."
      }
      return `Login failed: ${error?.message ?? "unknown error"}`
    }

    console.log("[signIn] Auth successful, checking admin profile:", data.user.id)

    const { data: profile, error: profileError } = await supabase
      .from("attendance_admins")
      .select("user_id,role")
      .eq("user_id", data.user.id)
      .maybeSingle()

    if (profileError) {
      console.error("[signIn] Profile query error:", profileError.message)
      await supabase.auth.signOut()
      return `Profile check failed: ${profileError.message}`
    }

    if (!profile) {
      console.error("[signIn] No admin profile for user:", data.user.id)
      await supabase.auth.signOut()
      return "This account is not registered as an administrator."
    }

    console.log("[signIn] Admin profile found:", profile)
    await refreshAdmin()
    return null
  }, [refreshAdmin, supabase])

  const bootstrapAdmin = useCallback(async ({ username, password, setupToken }: SetupCredentials) => {
    let response: Response
    try {
      response = await fetch("/api/attendance-admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password, setupToken }),
      })
    } catch (err) {
      console.error("[bootstrap] Network error:", err)
      return "Administrator setup could not be reached. Check your connection and try again."
    }

    const result = await response.json().catch(() => null) as { error?: string; ok?: boolean } | null

    if (!response.ok) {
      console.error("[bootstrap] Server error:", response.status, result)
      return result?.error ?? `Administrator setup failed (${response.status}).`
    }

    console.log("[bootstrap] Success:", result)
    return signIn({ username, password })
  }, [signIn])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setAuthUser(null)
  }, [supabase])

  const scanQr = useCallback(async (token: string): Promise<ScanResult> => {
    const { data, error } = await supabase.rpc("record_qr_attendance", {
      p_qr_token: token.trim(),
    })
    if (error) throw new Error("Attendance could not be recorded.")
    const result = data as ScanResult
    if (!result || !["accepted", "checked_out", "already_completed", "not_registered"].includes(result.status)) {
      throw new Error("Attendance response was not recognized.")
    }
    if (result.status === "accepted" || result.status === "checked_out") {
      await mutateDashboard()
    }
    return result
  }, [mutateDashboard, supabase])

  const saveMember = useCallback(async (values: MemberFormValues, photo: File | null) => {
    if (!authUser) return
    setMemberSaving(true)
    setMemberError(null)
    let uploadedPath: string | null = null

    try {
      if (photo) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type) || photo.size > 5 * 1024 * 1024) {
          throw new Error("Invalid photo")
        }
        const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg"
        uploadedPath = `${authUser.id}/${crypto.randomUUID()}.${extension}`
        const { error } = await supabase.storage
          .from(MEMBER_PHOTO_BUCKET)
          .upload(uploadedPath, photo, { contentType: photo.type, cacheControl: "3600", upsert: false })
        if (error) throw error
      }

      const valuesForDatabase = {
        full_name: values.full_name.trim(),
        department: values.department.trim(),
        phone: values.phone.trim(),
        email: values.email.trim().toLowerCase(),
        iot_device_user_id: values.iot_device_user_id.trim() || null,
      }

      if (editingMember) {
        const { error } = await supabase
          .from("attendance_members")
          .update({
            ...valuesForDatabase,
            face_photo_path: uploadedPath ?? editingMember.face_photo_path,
          })
          .eq("id", editingMember.id)
        if (error) throw error
        if (uploadedPath && editingMember.face_photo_path) {
          await supabase.storage.from(MEMBER_PHOTO_BUCKET).remove([editingMember.face_photo_path])
        }
      } else {
        const { error } = await supabase.from("attendance_members").insert({
          ...valuesForDatabase,
          face_photo_path: uploadedPath,
        })
        if (error) throw error
      }

      await mutateDashboard()
      setMemberFormOpen(false)
      setEditingMember(null)
      setSelectedMember(null)
    } catch {
      if (uploadedPath) {
        await supabase.storage.from(MEMBER_PHOTO_BUCKET).remove([uploadedPath])
      }
      setMemberError("Could not save this member. Check the details and try again.")
    } finally {
      setMemberSaving(false)
    }
  }, [authUser, editingMember, mutateDashboard, supabase])

  const exportCsv = useCallback(() => {
    const header = ["Member", "Department", "Date (UTC)", "Status", "Check-in", "Check-out", "Method"]
    const lines = [header.map(csvCell).join(",")]
    for (const row of filteredRows) {
      lines.push([
        row.member.full_name,
        row.member.department,
        attendanceDate,
        row.status,
        row.record?.captured_at ?? "",
        row.record?.clocked_out_at ?? "",
        row.record?.method ?? "",
      ].map(csvCell).join(","))
    }
    const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `lam-attendance-${attendanceDate}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [attendanceDate, filteredRows])

  if (!authReady || (authUser && adminLoading)) {
    return <FullScreenMessage title={`${ORGANIZATION_SHORT_NAME} Attendance`} message="Verifying your administrator session…" />
  }

  if (authUser && adminError) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f7f4] p-6">
        <div className="max-w-sm rounded-2xl border border-[#e7eae5] bg-white p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto text-[#9b624d]" size={22} aria-hidden="true" />
          <h1 className="mt-3 text-base font-semibold text-[#2c4133]">Access could not be verified</h1>
          <p className="mt-2 text-xs leading-5 text-[#7b887f]">Check your connection, then retry administrator verification.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => void refreshAdmin()} className="flex items-center gap-2 rounded-lg bg-[#193e30] px-3 py-2 text-xs font-semibold text-white"><RefreshCw size={13} aria-hidden="true" />Retry</button>
            <button onClick={() => void signOut()} className="rounded-lg border border-[#e1e7e1] px-3 py-2 text-xs font-medium text-[#647269]">Sign out</button>
          </div>
        </div>
      </main>
    )
  }

  if (!isAdmin || !admin) {
    return <AdminAccess onSignIn={signIn} onBootstrap={bootstrapAdmin} />
  }

  const usernameValue = authUser?.user_metadata?.username
  const username = typeof usernameValue === "string"
    ? usernameValue
    : authUser?.email?.split("@")[0] ?? "Administrator"
  const role = admin.role === "superadmin" ? "Superadmin" : "Administrator"
  const memberCount = dashboard?.members.length ?? 0
  const recordCount = dashboard?.records.length ?? 0
  const onSiteCount = dashboard?.records.filter((record) => !record.clocked_out_at).length ?? 0
  const notCheckedInCount = Math.max(0, memberCount - recordCount)
  const attendanceRate = memberCount ? Math.round((recordCount / memberCount) * 100) : 0
  const averageArrival = recordCount
    ? formatTime(new Date(dashboard!.records.reduce((sum, record) => sum + new Date(record.captured_at).getTime(), 0) / recordCount).toISOString())
    : "—"
  const selectedRecord = selectedMember ? recordsByMember.get(selectedMember.id) : undefined
  const selectedStatus = selectedMember ? attendanceStatus(selectedRecord, attendanceDate) : undefined
  const pageTitle = activeTab === "Overview"
    ? "Attendance overview"
    : activeTab === "Access & security"
      ? "Access & security"
      : activeTab === "Attendance"
        ? "Attendance history"
        : "Member directory"

  const startNewMember = () => {
    setEditingMember(null)
    setMemberError(null)
    setMemberFormOpen(true)
  }

  const openEditMember = (member: AttendanceMember) => {
    setEditingMember(member)
    setMemberError(null)
    setSelectedMember(null)
    setMemberFormOpen(true)
  }

  const filterControls = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="relative block w-full sm:max-w-[280px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99a39c]" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, group, email…"
          aria-label="Search members by name, group, email, or phone"
          className="w-full rounded-lg border border-[#e4e9e2] bg-white py-2.5 pl-9 pr-3 text-xs outline-none placeholder:text-[#a1aaa4] focus:border-[#819b85]"
        />
      </label>
      <label className="sr-only" htmlFor="department-filter">Filter by department</label>
      <select
        id="department-filter"
        value={departmentFilter}
        onChange={(event) => setDepartmentFilter(event.target.value)}
        className="rounded-lg border border-[#e4e9e2] bg-white px-3 py-2.5 text-xs text-[#596a60] outline-none focus:border-[#819b85]"
      >
        <option>All departments</option>
        {departments.map((department) => <option key={department}>{department}</option>)}
      </select>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#f6f7f4] text-[#263b2e] lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 border-r border-[#e8ebe6] lg:block">
        <WorkspaceSidebar activeTab={activeTab} onNavigate={setActiveTab} username={username} role={role} onSignOut={() => void signOut()} />
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} className="absolute inset-0 bg-[#10241c]/40" />
          <aside className="relative z-10 h-full w-[min(82vw,300px)] border-r border-[#e8ebe6] shadow-xl">
            <WorkspaceSidebar activeTab={activeTab} onNavigate={setActiveTab} username={username} role={role} onSignOut={() => void signOut()} onClose={() => setMobileMenuOpen(false)} />
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex min-h-[68px] items-center justify-between border-b border-[#e8ebe6] bg-[#f8f9f6]/95 px-4 backdrop-blur sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setMobileMenuOpen(true)} className="rounded-lg p-2 text-[#647269] hover:bg-[#edf1eb] lg:hidden" aria-label="Open navigation"><Menu size={18} aria-hidden="true" /></button>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold">{ORGANIZATION_NAME}</div>
              <div className="mt-0.5 text-[10px] text-[#8c978f]">Administrator workspace</div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <label className="flex items-center gap-2 rounded-lg border border-[#e2e8e1] bg-white px-2.5 py-2 text-[10px] text-[#6e7b72] sm:px-3">
              <CalendarDays size={13} aria-hidden="true" />
              <span className="hidden sm:inline">Attendance date (UTC)</span>
              <span className="sm:hidden">UTC</span>
              <input aria-label="Attendance date in UTC" type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value || todayUtc())} className="w-[112px] bg-transparent text-[10px] outline-none" />
            </label>
            <span className="hidden items-center gap-1.5 rounded-full bg-[#edf5ee] px-2.5 py-1.5 text-[9px] font-medium text-[#4e7855] sm:flex"><span className="size-1.5 rounded-full bg-[#65a56b]" /> Secure session</span>
          </div>
        </header>

        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#839086]">{formatDate(attendanceDate)} · {ORGANIZATION_SHORT_NAME}</p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-[-.045em] text-[#253a2d] sm:text-[28px]">{pageTitle}</h1>
              <p className="mt-1.5 text-xs text-[#87928b]">
                {activeTab === "Members"
                  ? "Search and review members grouped by department."
                  : activeTab === "Attendance"
                    ? "Review scan-recorded check-ins and check-outs for the selected day."
                    : activeTab === "Access & security"
                      ? "Review administrator permissions and data handling."
                      : "A clear view of member check-ins, QR activity, and attendance status."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(activeTab === "Overview" || activeTab === "Members") && (
                <button onClick={startNewMember} className="flex items-center gap-2 rounded-lg border border-[#dfe6de] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#49634f] hover:bg-[#f7faf6]"><Plus size={15} aria-hidden="true" />Add member</button>
              )}
              {activeTab === "Attendance" && (
                <button onClick={exportCsv} disabled={!dashboard?.members.length} className="flex items-center gap-2 rounded-lg border border-[#dfe6de] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#49634f] hover:bg-[#f7faf6] disabled:cursor-not-allowed disabled:opacity-50"><ArrowDownToLine size={15} aria-hidden="true" />Export CSV</button>
              )}
              {(activeTab === "Overview" || activeTab === "Attendance") && (
                <button onClick={() => setPhoneBiometricOpen(true)} className="flex items-center gap-2 rounded-lg border border-[#dfe6de] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#49634f] hover:bg-[#f7faf6]"><Fingerprint size={15} aria-hidden="true" />Phone fingerprint</button>
              )}
              {(activeTab === "Overview" || activeTab === "Attendance") && (
                <button onClick={() => setScannerOpen(true)} className="flex items-center gap-2 rounded-lg bg-[#193e30] px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#24533f]"><QrCode size={15} aria-hidden="true" />Scan ID card</button>
              )}
            </div>
          </div>

          {dashboardError && (
            <div role="alert" className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-[#efd6d0] bg-[#fbf1ef] px-4 py-3 text-xs text-[#925442]">
              <span>Attendance data could not be loaded. Check the connection and retry.</span>
              <button onClick={() => void mutateDashboard()} className="flex shrink-0 items-center gap-1.5 font-semibold"><RefreshCw size={13} aria-hidden="true" />Retry</button>
            </div>
          )}

          {activeTab === "Overview" && (
            <div className="space-y-5">
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Attendance summary">
                <StatusCard label="Registered members" value={memberCount} note="Active member profiles" icon={Users} tone="green" />
                <StatusCard label="Checked in" value={recordCount} note={`${attendanceRate}% of members for this date`} icon={CheckCircle2} tone="blue" />
                <StatusCard label={attendanceDate === todayUtc() ? "On site" : "No checkout"} value={onSiteCount} note={attendanceDate === todayUtc() ? "Checked in and not checked out" : "Records without checkout"} icon={Activity} tone="amber" />
                <StatusCard label="Not checked in" value={notCheckedInCount} note={`Average arrival ${averageArrival}`} icon={Clock3} tone="stone" />
              </section>

              <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
                <article className="overflow-hidden rounded-xl border border-[#e8ebe6] bg-white">
                  <div className="flex flex-col gap-3 border-b border-[#edf0ec] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div>
                      <h2 className="text-sm font-semibold">Member attendance</h2>
                      <p className="mt-1 text-[10px] text-[#89948c]">Live records for {formatDate(attendanceDate)}</p>
                    </div>
                    <div className="flex items-center gap-2">{filterControls}<button onClick={() => setActiveTab("Members")} className="hidden rounded-lg px-2 py-2 text-[10px] font-semibold text-[#53745a] hover:bg-[#f4f7f2] sm:block">Directory</button></div>
                  </div>
                  {dashboardLoading ? (
                    <div className="grid min-h-48 place-items-center text-xs text-[#8b958e]">Loading member records…</div>
                  ) : memberCount === 0 ? (
                    <div className="p-5"><EmptyState title="No members yet" message="Add your first member to generate a private QR identity card." action={<button onClick={startNewMember} className="rounded-lg bg-[#193e30] px-3 py-2 text-xs font-semibold text-white">Add first member</button>} /></div>
                  ) : filteredRows.length === 0 ? (
                    <div className="p-5"><EmptyState title="No matching members" message="Try a different search term or department filter." /></div>
                  ) : (
                    <MemberList rows={filteredRows.slice(0, 6)} onOpen={setSelectedMember} />
                  )}
                  <div className="flex items-center justify-between border-t border-[#edf0ec] px-5 py-3 text-[10px] text-[#929b95]">
                    <span>{dashboardValidating ? "Refreshing records…" : `${filteredRows.length} matching members`}</span>
                    <button onClick={() => setActiveTab("Attendance")} className="font-semibold text-[#53745a] hover:underline">View attendance history</button>
                  </div>
                </article>

                <div className="space-y-4">
                  <article className="rounded-xl border border-[#e8ebe6] bg-white p-5">
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-[#edf4ed] text-[#426b4b]"><QrCode size={18} aria-hidden="true" /></span>
                      <div>
                        <h2 className="text-sm font-semibold">ID card & QR attendance</h2>
                        <p className="mt-1 text-[10px] leading-5 text-[#87928b]">Use the device camera to read the QR printed on a member ID card. The server verifies the credential before recording check-in or check-out.</p>
                      </div>
                    </div>
                    <button onClick={() => setScannerOpen(true)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#193e30] px-4 py-3 text-xs font-semibold text-white hover:bg-[#24533f]"><QrCode size={15} aria-hidden="true" />Scan member ID card</button>
                    <p className="mt-3 text-center text-[9px] text-[#96a098]">QR payloads contain opaque tokens, not URLs or personal details.</p>
                  </article>
                  <article className="rounded-xl border border-[#e8ebe6] bg-white p-5">
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 place-items-center rounded-lg bg-[#f0f2ef] text-[#6e7c72]"><Fingerprint size={16} aria-hidden="true" /></span>
                      <div>
                        <h3 className="text-xs font-semibold">Biometrics & IoT fingerprint</h3>
                        <p className="mt-1 text-[10px] leading-5 text-[#87928b]">Android phone biometrics are supported through WebAuthn passkeys. Enroll a member phone from that member's profile, then use Phone fingerprint to record attendance.</p>
                      </div>
                    </div>
                  </article>
                </div>
              </section>

              <section className="rounded-xl border border-[#e8ebe6] bg-white">
                <div className="flex items-center justify-between border-b border-[#edf0ec] px-5 py-4">
                  <div><h2 className="text-sm font-semibold">Recent scan activity</h2><p className="mt-1 text-[10px] text-[#89948c]">Most recent attendance records</p></div>
                  <Clock3 size={16} className="text-[#89948c]" aria-hidden="true" />
                </div>
                {recordCount === 0 ? (
                  <p className="px-5 py-6 text-xs text-[#89948c]">No attendance activity recorded for this date.</p>
                ) : (
                  <ul className="divide-y divide-[#f0f2ef]">
                    {[...(dashboard?.records ?? [])].sort((a, b) => new Date(b.clocked_out_at ?? b.captured_at).getTime() - new Date(a.clocked_out_at ?? a.captured_at).getTime()).slice(0, 5).map((record) => {
                      const member = dashboard?.members.find((item) => item.id === record.member_id)
                      if (!member) return null
                      const eventTime = record.clocked_out_at ?? record.captured_at
                      const action = record.clocked_out_at ? "Checked out" : "Checked in"
                      return (
                        <li key={record.id} className="flex items-center justify-between gap-3 px-5 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#edf3ed] text-[9px] font-semibold text-[#45674c]">{initials(member.full_name)}</span>
                            <div className="min-w-0"><div className="truncate text-xs font-medium text-[#374d3d]">{member.full_name}</div><div className="mt-0.5 text-[10px] text-[#8b958e]">{member.department} · {record.method === "iot_fingerprint" ? "IoT fingerprint" : record.method === "id_card" ? "ID card" : "QR / ID card"}</div></div>
                          </div>
                          <div className="shrink-0 text-right"><div className="text-[10px] font-medium text-[#647269]">{action}</div><div className="mt-0.5 text-[10px] text-[#929b95]">{formatTime(eventTime)}</div></div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </div>
          )}

          {activeTab === "Members" && (
            <section className="space-y-4">
              <div className="flex flex-col gap-3 rounded-xl border border-[#e8ebe6] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="text-sm font-semibold">Member directory</h2><p className="mt-1 text-[10px] text-[#89948c]">Members are grouped by department and searchable.</p></div>
                {filterControls}
              </div>
              {dashboardLoading ? <div className="grid min-h-48 place-items-center text-xs text-[#8b958e]">Loading members…</div> : filteredRows.length ? <MemberList rows={filteredRows} onOpen={setSelectedMember} grouped /> : <EmptyState title={memberCount ? "No matching members" : "Start your member directory"} message={memberCount ? "Try a different search or department." : "Create member profiles to issue private QR ID cards."} action={!memberCount ? <button onClick={startNewMember} className="rounded-lg bg-[#193e30] px-3 py-2 text-xs font-semibold text-white">Add first member</button> : undefined} />}
            </section>
          )}

          {activeTab === "Attendance" && (
            <section className="space-y-4">
              <div className="flex flex-col gap-3 rounded-xl border border-[#e8ebe6] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="text-sm font-semibold">Daily attendance register</h2><p className="mt-1 text-[10px] text-[#89948c]">Every check-in and check-out is verified and recorded by the attendance database transaction (ID card/QR or registered IoT device).</p></div>
                {filterControls}
              </div>
              <div className="overflow-hidden rounded-xl border border-[#e8ebe6] bg-white">
                {dashboardLoading ? <div className="grid min-h-48 place-items-center text-xs text-[#8b958e]">Loading attendance…</div> : filteredRows.length ? <MemberList rows={filteredRows} onOpen={setSelectedMember} /> : <div className="p-5"><EmptyState title={memberCount ? "No matching attendance" : "No attendance records"} message={memberCount ? "Change the search or department filter to see more members." : "Add members and scan their QR-enabled ID cards to record attendance."} /></div>}
                <div className="flex items-center justify-between border-t border-[#edf0ec] px-5 py-3 text-[10px] text-[#929b95]"><span>{recordCount} scans recorded · {attendanceDate} UTC</span><span>CSV follows current filters</span></div>
              </div>
            </section>
          )}

          {activeTab === "Access & security" && (
            <section className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
              <article className="rounded-xl border border-[#e8ebe6] bg-white p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-[#edf4ed] text-[#426b4b]"><ShieldCheck size={18} aria-hidden="true" /></span>
                  <div><h2 className="text-sm font-semibold">Administrator session</h2><p className="mt-1 text-[10px] text-[#89948c]">Role confirmed against the LAM admin table.</p></div>
                </div>
                <dl className="mt-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#f0f2ef] pb-3"><dt className="text-[10px] text-[#89948c]">Username</dt><dd className="text-xs font-medium text-[#405749]">{username}</dd></div>
                  <div className="flex items-center justify-between border-b border-[#f0f2ef] pb-3"><dt className="text-[10px] text-[#89948c]">Role</dt><dd className="text-xs font-medium text-[#405749]">{role}</dd></div>
                  <div className="flex items-center justify-between"><dt className="text-[10px] text-[#89948c]">Status</dt><dd className="flex items-center gap-1.5 text-xs font-medium text-[#4b7853]"><span className="size-1.5 rounded-full bg-[#65a56b]" />Verified</dd></div>
                </dl>
                <button onClick={() => void signOut()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-[#e3e8e2] px-4 py-2.5 text-xs font-medium text-[#596a60] hover:bg-[#f8faf7]"><LogOut size={14} aria-hidden="true" />Sign out of this session</button>
              </article>
              <div className="space-y-4">
              <PasswordChangeCard />
              <article className="rounded-xl border border-[#e8ebe6] bg-white p-5">
                <h2 className="text-sm font-semibold">Data protection</h2>
                <div className="mt-4 space-y-3">
                  <div className="flex gap-3 rounded-lg bg-[#f7f9f6] p-3"><span className="mt-0.5 text-[#52775a]"><LockKeyhole size={15} aria-hidden="true" /></span><div><div className="text-xs font-medium text-[#3f5546]">Private member records</div><p className="mt-1 text-[10px] leading-5 text-[#849087]">Supabase row-level security checks the administrator role for member, attendance, and private photo access.</p></div></div>
                  <div className="flex gap-3 rounded-lg bg-[#f7f9f6] p-3"><span className="mt-0.5 text-[#52775a]"><QrCode size={15} aria-hidden="true" /></span><div><div className="text-xs font-medium text-[#3f5546]">Opaque QR credentials</div><p className="mt-1 text-[10px] leading-5 text-[#849087]">The QR is a random token, not a web address. Only the authenticated scanner can resolve it to a member.</p></div></div>
                  <div className="flex gap-3 rounded-lg bg-[#f7f9f6] p-3"><span className="mt-0.5 text-[#52775a]"><ClipboardList size={15} aria-hidden="true" /></span><div><div className="text-xs font-medium text-[#3f5546]">Scan-only attendance</div><p className="mt-1 text-[10px] leading-5 text-[#849087]">Check-in and check-out are recorded atomically by the database scan function. There is no manual attendance override in this workspace.</p></div></div>
                  <div className="flex gap-3 rounded-lg bg-[#f7f9f6] p-3"><span className="mt-0.5 text-[#52775a]"><Building2 size={15} aria-hidden="true" /></span><div><div className="text-xs font-medium text-[#3f5546]">Private photo storage</div><p className="mt-1 text-[10px] leading-5 text-[#849087]">Member photos use private storage with short-lived signed URLs for authorized administrators.</p></div></div>
                </div>
                <div className="mt-4 rounded-lg border border-[#e7eae5] px-3.5 py-3 text-[10px] leading-5 text-[#88938b]">Android phone passkeys are verified server-side through WebAuthn; the browser never receives fingerprint data. Physical IoT fingerprint terminals still require a compatible device and vendor bridge.</div>
              </article>
              </div>
            </section>
          )}

          {dashboardLoading && <span className="sr-only" role="status">Loading attendance data</span>}
        </div>
      </main>

      <ScannerDialog open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={scanQr} />
      <PhoneBiometricDialog open={phoneBiometricOpen} onClose={() => setPhoneBiometricOpen(false)} onComplete={() => { void mutateDashboard() }} />
      <MemberFormDialog
        open={memberFormOpen}
        member={editingMember}
        departments={departments}
        saving={memberSaving}
        error={memberError}
        onClose={() => {
          setMemberFormOpen(false)
          setEditingMember(null)
          setMemberError(null)
        }}
        onSubmit={saveMember}
      />
      <MemberProfileDialog
        member={selectedMember}
        record={selectedRecord}
        status={selectedStatus}
        onClose={() => setSelectedMember(null)}
        onEdit={openEditMember}
      />
    </div>
  )
}
