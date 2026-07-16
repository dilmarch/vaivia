alter table public.trip_ideas
add column if not exists attended boolean not null default false;

create index if not exists trip_ideas_trip_attended_created_idx
on public.trip_ideas(trip_id, attended, created_at desc);
