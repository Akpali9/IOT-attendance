-- Create the database function used by the server-side QR + face route.
-- The API calls this only after the live face has passed Face++ comparison.
create or replace function public.record_qr_attendance(p_qr_token text)
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
  if p_qr_token is null or length(btrim(p_qr_token)) < 16 or length(btrim(p_qr_token)) > 512 then
    return jsonb_build_object('status', 'not_registered');
  end if;

  select * into v_member
  from public.attendance_members
  where qr_token = btrim(p_qr_token)
  limit 1;

  if not found then
    return jsonb_build_object('status', 'not_registered');
  end if;

  -- Serialize concurrent scans for the same member/day.
  perform pg_advisory_xact_lock(hashtext(v_member.id::text || ':' || v_today::text));

  select * into v_record
  from public.attendance_records
  where member_id = v_member.id
    and attendance_date = v_today
  order by captured_at desc
  limit 1
  for update;

  if not found then
    insert into public.attendance_records
      (member_id, attendance_date, captured_at, method)
    values
      (v_member.id, v_today, v_now, 'qr_face')
    returning * into v_record;

    return jsonb_build_object(
      'status', 'accepted',
      'member', jsonb_build_object('id', v_member.id, 'name', v_member.full_name, 'department', v_member.department),
      'captured_at', v_record.captured_at
    );
  end if;

  if v_record.clocked_out_at is null then
    update public.attendance_records
    set clocked_out_at = v_now, method = 'qr_face'
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

revoke all on function public.record_qr_attendance(text) from public, anon, authenticated;
grant execute on function public.record_qr_attendance(text) to service_role;
