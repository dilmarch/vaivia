create table if not exists public.trip_idea_reactions (
    id uuid primary key default gen_random_uuid(),
    trip_id uuid not null references public.trips(id) on delete cascade,
    idea_id uuid not null references public.trip_ideas(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    reaction text not null check (reaction in ('heart', 'thumbs_up', 'thumbs_down')),
    created_at timestamp with time zone not null default timezone('utc'::text, now()),
    updated_at timestamp with time zone not null default timezone('utc'::text, now()),
    unique (idea_id, user_id)
);

create index if not exists trip_idea_reactions_trip_id_idx
on public.trip_idea_reactions(trip_id);

create index if not exists trip_idea_reactions_idea_id_idx
on public.trip_idea_reactions(idea_id);

create index if not exists trip_idea_reactions_user_id_idx
on public.trip_idea_reactions(user_id);

alter table public.trip_idea_reactions enable row level security;

grant select, insert, update, delete on public.trip_idea_reactions to authenticated;

drop policy if exists "Users can view reactions on their own trip ideas" on public.trip_idea_reactions;
drop policy if exists "Users can create reactions on their own trip ideas" on public.trip_idea_reactions;
drop policy if exists "Users can update their own idea reactions" on public.trip_idea_reactions;
drop policy if exists "Users can delete their own idea reactions" on public.trip_idea_reactions;

create policy "Users can view reactions on their own trip ideas"
on public.trip_idea_reactions
for select
to authenticated
using (
    exists (
        select 1
        from public.trips
        where trips.id = trip_idea_reactions.trip_id
        and trips.user_id = (select auth.uid())
    )
);

create policy "Users can create reactions on their own trip ideas"
on public.trip_idea_reactions
for insert
to authenticated
with check (
    user_id = (select auth.uid())
    and exists (
        select 1
        from public.trips
        where trips.id = trip_idea_reactions.trip_id
        and trips.user_id = (select auth.uid())
    )
    and exists (
        select 1
        from public.trip_ideas
        where trip_ideas.id = trip_idea_reactions.idea_id
        and trip_ideas.trip_id = trip_idea_reactions.trip_id
    )
);

create policy "Users can update their own idea reactions"
on public.trip_idea_reactions
for update
to authenticated
using (
    user_id = (select auth.uid())
    and exists (
        select 1
        from public.trips
        where trips.id = trip_idea_reactions.trip_id
        and trips.user_id = (select auth.uid())
    )
)
with check (
    user_id = (select auth.uid())
    and exists (
        select 1
        from public.trips
        where trips.id = trip_idea_reactions.trip_id
        and trips.user_id = (select auth.uid())
    )
);

create policy "Users can delete their own idea reactions"
on public.trip_idea_reactions
for delete
to authenticated
using (
    user_id = (select auth.uid())
    and exists (
        select 1
        from public.trips
        where trips.id = trip_idea_reactions.trip_id
        and trips.user_id = (select auth.uid())
    )
);
