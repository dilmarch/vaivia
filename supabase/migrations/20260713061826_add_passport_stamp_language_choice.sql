alter table public.user_passport_stamps
add column if not exists stamp_language_code text,
add column if not exists stamp_language_name text;

create index if not exists user_passport_stamps_language_idx
on public.user_passport_stamps(user_id, stamp_language_code)
where stamp_language_code is not null;
