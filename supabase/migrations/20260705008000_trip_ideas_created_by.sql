alter table public.trip_ideas
add column if not exists created_by uuid references auth.users(id) on delete cascade;

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
        and table_name = 'trip_ideas'
        and column_name = 'user_id'
    ) then
        execute '
            update public.trip_ideas
            set created_by = user_id
            where created_by is null
        ';
    end if;

    if not exists (
        select 1
        from public.trip_ideas
        where created_by is null
    ) then
        alter table public.trip_ideas
        alter column created_by set not null;
    end if;
end
$$;

create index if not exists trip_ideas_created_by_idx
on public.trip_ideas(created_by);

drop policy if exists "Users can view their own trip ideas" on public.trip_ideas;
drop policy if exists "Users can create ideas for their own trips" on public.trip_ideas;
drop policy if exists "Users can update their own trip ideas" on public.trip_ideas;
drop policy if exists "Users can delete their own trip ideas" on public.trip_ideas;

create policy "Users can view their own trip ideas"
on public.trip_ideas
for select
to authenticated
using (
    created_by = (select auth.uid())
    and exists (
        select 1
        from public.trips
        where trips.id = trip_ideas.trip_id
        and trips.user_id = (select auth.uid())
    )
);

create policy "Users can create ideas for their own trips"
on public.trip_ideas
for insert
to authenticated
with check (
    created_by = (select auth.uid())
    and exists (
        select 1
        from public.trips
        where trips.id = trip_ideas.trip_id
        and trips.user_id = (select auth.uid())
    )
);

create policy "Users can update their own trip ideas"
on public.trip_ideas
for update
to authenticated
using (
    created_by = (select auth.uid())
    and exists (
        select 1
        from public.trips
        where trips.id = trip_ideas.trip_id
        and trips.user_id = (select auth.uid())
    )
)
with check (
    created_by = (select auth.uid())
    and exists (
        select 1
        from public.trips
        where trips.id = trip_ideas.trip_id
        and trips.user_id = (select auth.uid())
    )
);

create policy "Users can delete their own trip ideas"
on public.trip_ideas
for delete
to authenticated
using (
    created_by = (select auth.uid())
    and exists (
        select 1
        from public.trips
        where trips.id = trip_ideas.trip_id
        and trips.user_id = (select auth.uid())
    )
);
