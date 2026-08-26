create table public.user_immunizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  disease text not null,
  immunization_name text not null,
  doses_required integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_immunizations_disease_length_check
    check (char_length(trim(disease)) between 1 and 120),
  constraint user_immunizations_name_length_check
    check (char_length(trim(immunization_name)) between 1 and 160),
  constraint user_immunizations_doses_required_check
    check (doses_required between 1 and 20)
);

comment on table public.user_immunizations is
  'Private immunization passport entries available only to their super-admin owner.';

create table public.user_immunization_doses (
  id uuid primary key default gen_random_uuid(),
  immunization_id uuid not null references public.user_immunizations(id) on delete cascade,
  dose_number integer not null,
  administered_on date,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_immunization_doses_number_check
    check (dose_number between 1 and 20),
  constraint user_immunization_doses_location_length_check
    check (location is null or char_length(trim(location)) between 1 and 240),
  constraint user_immunization_doses_received_pair_check
    check ((administered_on is null) = (location is null)),
  constraint user_immunization_doses_unique
    unique (immunization_id, dose_number)
);

comment on table public.user_immunization_doses is
  'Dose-by-dose private administration details for an immunization passport entry.';

create index user_immunizations_user_updated_idx
  on public.user_immunizations (user_id, updated_at desc);

create trigger set_user_immunizations_updated_at
before update on public.user_immunizations
for each row execute function public.set_updated_at();

create trigger set_user_immunization_doses_updated_at
before update on public.user_immunization_doses
for each row execute function public.set_updated_at();

alter table public.user_immunizations enable row level security;
alter table public.user_immunization_doses enable row level security;

create policy "Super admins can view their own immunizations"
on public.user_immunizations
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and (select public.is_super_admin())
);

create policy "Super admins can create their own immunizations"
on public.user_immunizations
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (select public.is_super_admin())
);

create policy "Super admins can update their own immunizations"
on public.user_immunizations
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and (select public.is_super_admin())
)
with check (
  (select auth.uid()) = user_id
  and (select public.is_super_admin())
);

create policy "Super admins can delete their own immunizations"
on public.user_immunizations
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and (select public.is_super_admin())
);

create policy "Super admins can view their own immunization doses"
on public.user_immunization_doses
for select
to authenticated
using (
  (select public.is_super_admin())
  and exists (
    select 1
    from public.user_immunizations immunizations
    where immunizations.id = user_immunization_doses.immunization_id
      and immunizations.user_id = (select auth.uid())
  )
);

create policy "Super admins can create their own immunization doses"
on public.user_immunization_doses
for insert
to authenticated
with check (
  (select public.is_super_admin())
  and exists (
    select 1
    from public.user_immunizations immunizations
    where immunizations.id = user_immunization_doses.immunization_id
      and immunizations.user_id = (select auth.uid())
  )
);

create policy "Super admins can update their own immunization doses"
on public.user_immunization_doses
for update
to authenticated
using (
  (select public.is_super_admin())
  and exists (
    select 1
    from public.user_immunizations immunizations
    where immunizations.id = user_immunization_doses.immunization_id
      and immunizations.user_id = (select auth.uid())
  )
)
with check (
  (select public.is_super_admin())
  and exists (
    select 1
    from public.user_immunizations immunizations
    where immunizations.id = user_immunization_doses.immunization_id
      and immunizations.user_id = (select auth.uid())
  )
);

create policy "Super admins can delete their own immunization doses"
on public.user_immunization_doses
for delete
to authenticated
using (
  (select public.is_super_admin())
  and exists (
    select 1
    from public.user_immunizations immunizations
    where immunizations.id = user_immunization_doses.immunization_id
      and immunizations.user_id = (select auth.uid())
  )
);

revoke all on table public.user_immunizations from public, anon;
revoke all on table public.user_immunization_doses from public, anon;
grant select, insert, update, delete on table public.user_immunizations to authenticated;
grant select, insert, update, delete on table public.user_immunization_doses to authenticated;
grant all on table public.user_immunizations to service_role;
grant all on table public.user_immunization_doses to service_role;

create or replace function public.save_user_immunization(
  target_disease text,
  target_immunization_name text,
  target_doses_required integer,
  target_doses jsonb,
  target_immunization_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  saved_immunization_id uuid;
  dose_record record;
  dose_date date;
  dose_location text;
  found_blank_dose boolean := false;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Only super admins can manage an immunization passport'
      using errcode = '42501';
  end if;

  if char_length(trim(coalesce(target_disease, ''))) not between 1 and 120 then
    raise exception 'Disease is required and must be 120 characters or fewer'
      using errcode = '22023';
  end if;

  if char_length(trim(coalesce(target_immunization_name, ''))) not between 1 and 160 then
    raise exception 'Immunization name is required and must be 160 characters or fewer'
      using errcode = '22023';
  end if;

  if target_doses_required not between 1 and 20 then
    raise exception 'Doses required must be between 1 and 20'
      using errcode = '22023';
  end if;

  if jsonb_typeof(target_doses) <> 'array'
     or jsonb_array_length(target_doses) <> target_doses_required then
    raise exception 'Provide one dose record for every required dose'
      using errcode = '22023';
  end if;

  for dose_record in
    select value, ordinality::integer as dose_number
    from jsonb_array_elements(target_doses) with ordinality
  loop
    dose_date := nullif(trim(dose_record.value ->> 'administered_on'), '')::date;
    dose_location := nullif(trim(dose_record.value ->> 'location'), '');

    if (dose_date is null) <> (dose_location is null) then
      raise exception 'Each received dose needs both a date and location'
        using errcode = '22023';
    end if;

    if dose_date > current_date then
      raise exception 'Dose dates cannot be in the future'
        using errcode = '22023';
    end if;

    if dose_location is not null and char_length(dose_location) > 240 then
      raise exception 'Dose locations must be 240 characters or fewer'
        using errcode = '22023';
    end if;

    if dose_date is null then
      found_blank_dose := true;
    elsif found_blank_dose then
      raise exception 'Received doses must be entered in order without gaps'
        using errcode = '22023';
    end if;

    if dose_record.dose_number = 1 and dose_date is null then
      raise exception 'The first dose date and location are required'
        using errcode = '22023';
    end if;
  end loop;

  if target_immunization_id is null then
    insert into public.user_immunizations (
      user_id,
      disease,
      immunization_name,
      doses_required
    ) values (
      auth.uid(),
      trim(target_disease),
      trim(target_immunization_name),
      target_doses_required
    )
    returning id into saved_immunization_id;
  else
    update public.user_immunizations
    set disease = trim(target_disease),
        immunization_name = trim(target_immunization_name),
        doses_required = target_doses_required
    where id = target_immunization_id
      and user_id = auth.uid()
    returning id into saved_immunization_id;

    if saved_immunization_id is null then
      raise exception 'Immunization passport entry not found'
        using errcode = 'P0002';
    end if;

    delete from public.user_immunization_doses
    where immunization_id = saved_immunization_id;
  end if;

  insert into public.user_immunization_doses (
    immunization_id,
    dose_number,
    administered_on,
    location
  )
  select
    saved_immunization_id,
    ordinality::integer,
    nullif(trim(value ->> 'administered_on'), '')::date,
    nullif(trim(value ->> 'location'), '')
  from jsonb_array_elements(target_doses) with ordinality;

  return saved_immunization_id;
end;
$$;

revoke all on function public.save_user_immunization(text, text, integer, jsonb, uuid)
  from public, anon;
grant execute on function public.save_user_immunization(text, text, integer, jsonb, uuid)
  to authenticated, service_role;
