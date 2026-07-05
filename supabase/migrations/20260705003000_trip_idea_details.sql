alter table public.trip_ideas
add column if not exists location text,
add column if not exists formatted_address text,
add column if not exists google_place_id text,
add column if not exists location_lat double precision,
add column if not exists location_lng double precision,
add column if not exists location_city text,
add column if not exists location_region text,
add column if not exists location_country text,
add column if not exists location_country_code text,
add column if not exists location_postal_code text,
add column if not exists location_website text,
add column if not exists ticket_website text,
add column if not exists is_24_hours boolean not null default false,
add column if not exists ticket_policy text not null default 'any',
add column if not exists age_policy text not null default 'all_ages',
add column if not exists dress_code text,
add column if not exists other_notes text;

alter table public.trip_ideas
drop constraint if exists trip_ideas_ticket_policy_check,
add constraint trip_ideas_ticket_policy_check
check (ticket_policy in ('free', 'advance_ticket', 'door_ticket', 'any'));

alter table public.trip_ideas
drop constraint if exists trip_ideas_age_policy_check,
add constraint trip_ideas_age_policy_check
check (age_policy in ('all_ages', 'nineteen_plus'));

create index if not exists trip_ideas_location_city_idx
on public.trip_ideas(location_city);
