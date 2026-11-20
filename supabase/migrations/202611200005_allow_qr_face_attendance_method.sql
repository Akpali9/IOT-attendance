-- Extend the existing attendance_records_method_check constraint to allow
-- the QR + facial-verification method without removing its existing rules.
-- The original CHECK expression is preserved exactly and OR'ed with qr_face.
do $$
declare
  v_existing_check text;
begin
  select pg_get_expr(c.conbin, c.conrelid)
    into v_existing_check
  from pg_constraint c
  where c.conrelid = 'public.attendance_records'::regclass
    and c.conname = 'attendance_records_method_check'
    and c.contype = 'c';

  if v_existing_check is null then
    raise exception 'Could not find CHECK constraint attendance_records_method_check on public.attendance_records. Inspect the table schema before applying this migration.';
  end if;

  execute 'alter table public.attendance_records drop constraint attendance_records_method_check';

  execute format(
    'alter table public.attendance_records add constraint attendance_records_method_check check ((%s) OR (method = %L))',
    v_existing_check,
    'qr_face'
  );
end
$$;
