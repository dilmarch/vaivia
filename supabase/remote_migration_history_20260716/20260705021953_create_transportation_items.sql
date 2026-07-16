create table if not exists public.transportation_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  itinerary_item_id uuid references public.itinerary_items(id) on delete set null,

  title text,
  transport_type text not null default 'flight',
  status text default 'planned',

  provider_name text,
  provider_code text,
  transport_number text,
  confirmation_number text,
  booking_reference text,

  departure_date date,
  departure_time time without time zone,
  departure_timezone text,
  departure_location text,
  departure_formatted_address text,
  departure_google_place_id text,
  departure_lat double precision,
  departure_lng double precision,
  departure_terminal text,
  departure_gate text,
  departure_platform text,

  arrival_date date,
  arrival_time time without time zone,
  arrival_timezone text,
  arrival_location text,
  arrival_formatted_address text,
  arrival_google_place_id text,
  arrival_lat double precision,
  arrival_lng double precision,
  arrival_terminal text,
  arrival_gate text,
  arrival_platform text,

  seat_number text,
  cabin_class text,
  fare_class text,
  baggage_info text,

  pickup_location text,
  pickup_formatted_address text,
  pickup_google_place_id text,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_location text,
  dropoff_formatted_address text,
  dropoff_google_place_id text,
  dropoff_lat double precision,
  dropoff_lng double precision,

  cost numeric default 0,
  currency text default 'CAD',
  paid_status text default 'unpaid',
  booking_url text,
  provider_url text,
  notes text,
  sort_order integer default 0,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),

  constraint transportation_items_transport_type_check check (
    transport_type in ('flight', 'train', 'bus', 'ferry', 'car', 'rental_car', 'rideshare', 'taxi', 'subway', 'tram', 'walking', 'other')
  ),
  constraint transportation_items_status_check check (
    status in ('planned', 'booked', 'confirmed', 'cancelled', 'completed')
  ),
  constraint transportation_items_paid_status_check check (
    paid_status in ('unpaid', 'paid', 'partial', 'refunded')
  )
);

create index if not exists transportation_items_trip_id_idx
  on public.transportation_items(trip_id);

create index if not exists transportation_items_itinerary_item_id_idx
  on public.transportation_items(itinerary_item_id);

create index if not exists transportation_items_departure_date_time_idx
  on public.transportation_items(departure_date, departure_time);

alter table public.transportation_items enable row level security;

create policy "Users can view their own transportation items"
  on public.transportation_items
  for select
  using (
    exists (
      select 1
      from public.trips
      where trips.id = transportation_items.trip_id
        and trips.user_id = auth.uid()
    )
  );

create policy "Users can create their own transportation items"
  on public.transportation_items
  for insert
  with check (
    exists (
      select 1
      from public.trips
      where trips.id = transportation_items.trip_id
        and trips.user_id = auth.uid()
    )
  );

create policy "Users can update their own transportation items"
  on public.transportation_items
  for update
  using (
    exists (
      select 1
      from public.trips
      where trips.id = transportation_items.trip_id
        and trips.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.trips
      where trips.id = transportation_items.trip_id
        and trips.user_id = auth.uid()
    )
  );

create policy "Users can delete their own transportation items"
  on public.transportation_items
  for delete
  using (
    exists (
      select 1
      from public.trips
      where trips.id = transportation_items.trip_id
        and trips.user_id = auth.uid()
    )
  );;
