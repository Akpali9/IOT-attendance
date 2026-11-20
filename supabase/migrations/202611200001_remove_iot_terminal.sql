-- Attendance methods: QR card scan and Android phone fingerprint only.
-- Remove the IoT terminal path (QR and passkey functions are untouched).
do $$
begin
  if to_regprocedure('public.record_iot_fingerprint_attendance(text)') is not null then
    revoke all on function public.record_iot_fingerprint_attendance(text) from public, anon, authenticated, service_role;
    drop function public.record_iot_fingerprint_attendance(text);
  end if;
end $$;
drop table if exists public.iot_device_request_nonces;
