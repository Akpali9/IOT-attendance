-- Enable Supabase Realtime for live admin dashboard updates.
-- Apply after the existing attendance schema migrations.
alter table public.attendance_records replica identity full;
alter table public.attendance_members replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.attendance_records;
exception when duplicate_object then null;
when undefined_object then
  raise notice 'supabase_realtime publication is not available; enable Realtime for attendance_records in Supabase Dashboard.';
end $$;

do $$
begin
  alter publication supabase_realtime add table public.attendance_members;
exception when duplicate_object then null;
when undefined_object then
  raise notice 'supabase_realtime publication is not available; enable Realtime for attendance_members in Supabase Dashboard.';
end $$;
