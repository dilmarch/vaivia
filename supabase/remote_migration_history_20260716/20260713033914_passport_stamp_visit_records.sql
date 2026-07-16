alter table public.user_passport_stamps
drop constraint if exists user_passport_stamps_user_country_unique;
alter table public.user_passport_stamps
add column if not exists visit_city text,
add column if not exists visit_region text,
add column if not exists visit_month integer,
add column if not exists visit_status text not null default 'visited',
add column if not exists port_of_entry_type text,
add column if not exists port_of_entry_name text;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_passport_stamps_visit_month_check'
      and conrelid = 'public.user_passport_stamps'::regclass
  ) then
    alter table public.user_passport_stamps
    add constraint user_passport_stamps_visit_month_check
    check (visit_month is null or (visit_month >= 1 and visit_month <= 12));
  end if;
end $$;
alter table public.user_passport_stamps
drop constraint if exists user_passport_stamps_visit_status_check;
alter table public.user_passport_stamps
add constraint user_passport_stamps_visit_status_check
check (visit_status in ('visited', 'lived'));
create index if not exists user_passport_stamps_user_country_visit_idx
on public.user_passport_stamps(user_id, country_code, first_visited_on);
create index if not exists user_passport_stamps_user_source_trip_idx
on public.user_passport_stamps(user_id, source_trip_id);
