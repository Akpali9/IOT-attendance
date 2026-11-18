-- LAM IoT fingerprint terminal integration.
-- Apply this migration in the Supabase SQL Editor before connecting a device.

alter table public.attendance_members
  add column if not exists iot_device_user_id text;

create unique index if not exists attendance_members_iot_device_user_id_uidx
  on public.attendance_members (iot_device_user_id)
  where iot_device_user_id is not null;


create table if not exists public.iot_device_request_nonces (
  nonce text primary key,
  request_timestamp timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.iot_device_request_nonces enable row level security;
revoke all on public.iot_device_request_nonces from public, anon, authenticated;
grant all on public.iot_device_request_nonces to service_role;

create or replace function public.record_iot_fingerprint_attendance(p_device_user_id text)
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
  if p_device_user_id is null or length(p_device_user_id) < 1 or length(p_device_user_id) > 128 then
    return jsonb_build_object('status', 'not_registered');
  end if;

  select * into v_member
  from public.attendance_members
  where iot_device_user_id = p_device_user_id
  limit 1;

  if not found then
    return jsonb_build_object('status', 'not_registered');
  end if;

  -- Serialize scans for this member/day so two fast terminal callbacks cannot double-check-in.
  perform pg_advisory_xact_lock(hashtext(v_member.id::text || ':' || v_today::text));

  select * into v_record
  from public.attendance_records
  where member_id = v_member.id and attendance_date = v_today
  order by captured_at desc
  limit 1
  for update;

  if not found then
    insert into public.attendance_records
      (member_id, attendance_date, captured_at, method)
    values
      (v_member.id, v_today, v_now, 'iot_fingerprint')
    returning * into v_record;

    return jsonb_build_object(
      'status', 'accepted',
      'member', jsonb_build_object('id', v_member.id, 'name', v_member.full_name, 'department', v_member.department),
      'captured_at', v_record.captured_at
    );
  end if;

  if v_record.clocked_out_at is null then
    update public.attendance_records
    set clocked_out_at = v_now, method = 'iot_fingerprint'
    where id = v_record.id
    returning * into v_record;

    return jsonb_build_object(
      'status', 'checked_out',
      'member', jsonb_build_object('id', v_member.id, 'name', v_member.full_name, 'department', v_member.department),
      'clocked_out_at', v_record.clocked_out_at
    );
  end if;

  return jsonb_build_object(
    'status', 'already_completed',
    'member', jsonb_build_object('id', v_member.id, 'name', v_member.full_name, 'department', v_member.department)
  );
end;
$$;

revoke all on function public.record_iot_fingerprint_attendance(text) from public, anon, authenticated;
grant execute on function public.record_iot_fingerprint_attendance(text) to service_role;
