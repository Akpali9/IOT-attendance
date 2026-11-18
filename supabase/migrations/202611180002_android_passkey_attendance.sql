-- Android phone biometrics via WebAuthn/passkeys.
-- No fingerprint images, templates, or biometric data are stored by this application.

create table if not exists public.attendance_passkey_credentials (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.attendance_members(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_type text,
  backed_up boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists attendance_passkey_credentials_member_idx
  on public.attendance_passkey_credentials(member_id);

create table if not exists public.attendance_passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.attendance_members(id) on delete cascade,
  challenge text not null,
  purpose text not null check (purpose in ('register','authenticate')),
  admin_user_id uuid,
  created_at timestamptz not null default now(),
  unique(member_id, purpose)
);

alter table public.attendance_passkey_credentials enable row level security;
alter table public.attendance_passkey_challenges enable row level security;
revoke all on public.attendance_passkey_credentials from public, anon, authenticated;
revoke all on public.attendance_passkey_challenges from public, anon, authenticated;
grant all on public.attendance_passkey_credentials to service_role;
grant all on public.attendance_passkey_challenges to service_role;

create or replace function public.record_passkey_attendance(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.attendance_members%rowtype;
  v_record public.attendance_records%rowtype;
  v_today date := (now() at time zone 'utc')::date;
  v_now timestamptz := now();
begin
  select * into v_member from public.attendance_members where id = p_member_id;
  if not found then return jsonb_build_object('status','not_registered'); end if;

  perform pg_advisory_xact_lock(hashtext(v_member.id::text || ':' || v_today::text));
  select * into v_record from public.attendance_records
   where member_id = v_member.id and attendance_date = v_today
   order by captured_at desc limit 1 for update;

  if not found then
    insert into public.attendance_records(member_id, attendance_date, captured_at, method)
    values(v_member.id, v_today, v_now, 'phone_passkey') returning * into v_record;
    return jsonb_build_object('status','accepted','member',jsonb_build_object('id',v_member.id,'name',v_member.full_name,'department',v_member.department),'captured_at',v_record.captured_at);
  elsif v_record.clocked_out_at is null then
    update public.attendance_records set clocked_out_at=v_now, method='phone_passkey' where id=v_record.id returning * into v_record;
    return jsonb_build_object('status','checked_out','member',jsonb_build_object('id',v_member.id,'name',v_member.full_name,'department',v_member.department),'clocked_out_at',v_record.clocked_out_at);
  else
    return jsonb_build_object('status','already_completed','member',jsonb_build_object('id',v_member.id,'name',v_member.full_name,'department',v_member.department));
  end if;
end;
$$;
revoke all on function public.record_passkey_attendance(uuid) from public, anon, authenticated;
grant execute on function public.record_passkey_attendance(uuid) to service_role;
