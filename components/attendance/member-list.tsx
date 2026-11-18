import { ArrowUpRight, UserRound } from "lucide-react"
import { formatTime, initials } from "./utils"
import type { AttendanceMember, MemberView } from "./types"

type MemberListProps = {
  rows: MemberView[]
  onOpen: (member: AttendanceMember) => void
  grouped?: boolean
}

function StatusBadge({ status }: { status: MemberView["status"] }) {
  const tone =
    status === "On site"
      ? "bg-[#edf5ee] text-[#3c7449]"
      : status === "Checked out"
        ? "bg-[#eef1ef] text-[#58675e]"
        : status === "No checkout"
          ? "bg-[#f4f1e9] text-[#84734c]"
          : "bg-[#f7f1e9] text-[#8c7554]"

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${tone}`}>{status}</span>
}

function MemberTable({ rows, onOpen }: MemberListProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[650px] text-left">
        <thead>
          <tr className="border-y border-[#f0f2ef] bg-[#fafbf9] text-[10px] font-medium uppercase tracking-[.08em] text-[#929b95]">
            <th className="px-5 py-3 font-medium">Member</th>
            <th className="px-3 py-3 font-medium">Department</th>
            <th className="px-3 py-3 font-medium">Attendance</th>
            <th className="px-3 py-3 font-medium">Check-in</th>
            <th className="px-3 py-3 font-medium">Check-out</th>
            <th className="px-5 py-3 text-right font-medium">Profile</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ member, record, status }) => (
            <tr key={member.id} className="border-b border-[#f0f2ef] last:border-0 hover:bg-[#fcfdfb]">
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  {member.photoUrl ? (
                    <img src={member.photoUrl} alt="" className="size-9 rounded-full object-cover" />
                  ) : (
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#edf1eb] text-[10px] font-semibold text-[#48634f]">
                      {initials(member.full_name) || <UserRound size={15} aria-hidden="true" />}
                    </span>
                  )}
                  <div className="min-w-0">
                    <button
                      className="max-w-[220px] truncate text-left text-xs font-semibold text-[#253b2e] underline-offset-4 hover:text-[#47734f] hover:underline"
                      onClick={() => onOpen(member)}
                      aria-label={`Open member profile for ${member.full_name}`}
                    >
                      {member.full_name}
                    </button>
                    <div className="max-w-[220px] truncate text-[10px] text-[#929b95]">{member.email}</div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3.5 text-xs text-[#68766d]">{member.department}</td>
              <td className="px-3 py-3.5"><StatusBadge status={status} /></td>
              <td className="px-3 py-3.5 text-xs text-[#68766d]">{formatTime(record?.captured_at)}</td>
              <td className="px-3 py-3.5 text-xs text-[#68766d]">{formatTime(record?.clocked_out_at)}</td>
              <td className="px-5 py-3.5 text-right">
                <button
                  className="rounded-md p-2 text-[#78867d] hover:bg-[#f1f5ef] hover:text-[#315f43]"
                  onClick={() => onOpen(member)}
                  aria-label={`View ${member.full_name} profile and ID card`}
                >
                  <ArrowUpRight size={15} aria-hidden="true" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function MemberList({ rows, onOpen, grouped = false }: MemberListProps) {
  if (!grouped) return <MemberTable rows={rows} onOpen={onOpen} />

  const groups = new Map<string, MemberView[]>()
  for (const row of rows) {
    const department = row.member.department.trim() || "Unassigned"
    const group = groups.get(department) ?? []
    group.push(row)
    groups.set(department, group)
  }

  return (
    <div className="space-y-5">
      {Array.from(groups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([department, members]) => (
          <section key={department} className="overflow-hidden rounded-xl border border-[#e7eae5] bg-white">
            <div className="flex items-center justify-between border-b border-[#edf0ec] px-5 py-3.5">
              <h3 className="text-xs font-semibold text-[#31483a]">{department}</h3>
              <span className="rounded-full bg-[#f1f4ef] px-2 py-1 text-[10px] text-[#738078]">
                {members.length} {members.length === 1 ? "member" : "members"}
              </span>
            </div>
            <MemberTable rows={members} onOpen={onOpen} />
          </section>
        ))}
    </div>
  )
}
