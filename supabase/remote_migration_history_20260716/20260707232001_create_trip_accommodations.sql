do $$
begin
  if not exists (select 1 from pg_type where typname = 'accommodation_type') then
    create type public.accommodation_type as enum (
      'hotel',
      'motel',
      'home_rental',
      'hostel',
      'friend_family',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'accommodation_status') then
    create type public.accommodation_status as enum (
      'tentative',
      'booked',
      'cancelled'
    );
  end if;
end $$;

create table if not exists public.trip_accommodations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,

  hotel_name text not null,
  google_place_id text,
  google_maps_url text,

  address text,
  address_line_1 text,
  address_line_2 text,
  city text,
  region text,
  country text,
  postal_code text,

  latitude double precision,
  longitude double precision,

  check_in_date date not null,
  check_out_date date not null,
  check_in_time_start time without time zone,
  check_in_time_end time without time zone,

  accommodation_type public.accommodation_type not null default 'hotel',
  status public.accommodation_status not null default 'tentative',

  website text,
  is_private boolean not null default false,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint trip_accommodations_checkout_after_checkin
    check (check_out_date > check_in_date),

  constraint trip_accommodations_time_window_valid
    check (
      check_in_time_start is null
      or check_in_time_end is null
      or check_in_time_end > check_in_time_start
    ),

  constraint trip_accommodations_place_required_for_standard_types
    check (
      accommodation_type in ('friend_family', 'other')
      or google_place_id is not null
    ),

  constraint trip_accommodations_website_url_valid
    check (
      website is null
      or website ~* '^https?://.+'
    )
);

create index if not exists trip_accommodations_trip_id_idx
  on public.trip_accommodations(trip_id);

create index if not exists trip_accommodations_created_by_idx
  on public.trip_accommodations(created_by);

create index if not exists trip_accommodations_trip_check_in_idx
  on public.trip_accommodations(trip_id, check_in_date);

create index if not exists trip_accommodations_google_place_id_idx
  on public.trip_accommodations(google_place_id);

drop trigger if exists set_trip_accommodations_updated_at on public.trip_accommodations;

create trigger set_trip_accommodations_updated_at
before update on public.trip_accommodations
for each row
execute function public.set_updated_at();

alter table public.trip_accommodations enable row level security;

drop policy if exists "Trip members can view visible accommodations" on public.trip_accommodations;
create policy "Trip members can view visible accommodations"
on public.trip_accommodations
for select
using (
  public.is_trip_active_member(trip_id)
  and (
    is_private = false
    or created_by = auth.uid()
  )
);

drop policy if exists "Trip members can create accommodations" on public.trip_accommodations;
create policy "Trip members can create accommodations"
on public.trip_accommodations
for insert
with check (
  public.is_trip_active_member(trip_id)
  and created_by = auth.uid()
);

drop policy if exists "Trip members can update visible accommodations" on public.trip_accommodations;
create policy "Trip members can update visible accommodations"
on public.trip_accommodations
for update
using (
  public.is_trip_active_member(trip_id)
  and (
    is_private = false
    or created_by = auth.uid()
  )
)
with check (
  public.is_trip_active_member(trip_id)
  and (
    is_private = false
    or created_by = auth.uid()
  )
);

drop policy if exists "Trip members can delete visible accommodations" on public.trip_accommodations;
create policy "Trip members can delete visible accommodations"
on public.trip_accommodations
for delete
using (
  public.is_trip_active_member(trip_id)
  and (
    is_private = false
    or created_by = auth.uid()
  )
);
;
