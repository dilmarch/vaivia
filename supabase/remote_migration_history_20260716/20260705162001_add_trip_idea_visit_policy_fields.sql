alter table public.trip_ideas
add column if not exists ticket_policy text default 'any',
add column if not exists age_policy text default 'all_ages',
add column if not exists dress_code text,
add column if not exists is_24_hours boolean not null default false;

alter table public.trip_ideas
drop constraint if exists trip_ideas_ticket_policy_check;

alter table public.trip_ideas
add constraint trip_ideas_ticket_policy_check
check (
  ticket_policy in (
    'free',
    'advance_ticket',
    'door_ticket',
    'any'
  )
);

alter table public.trip_ideas
drop constraint if exists trip_ideas_age_policy_check;

alter table public.trip_ideas
add constraint trip_ideas_age_policy_check
check (
  age_policy in (
    'all_ages',
    'nineteen_plus'
  )
);;
