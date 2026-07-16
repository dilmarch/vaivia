grant usage on schema public to authenticated;

alter table public.transportation_items
add column if not exists is_private boolean not null default false;

grant select, insert, update, delete
on table public.transportation_items
to authenticated;

alter table public.transportation_items enable row level security;

drop policy if exists "Users can view their own transportation items"
on public.transportation_items;

drop policy if exists "Users can create transportation items for their own trips"
on public.transportation_items;

drop policy if exists "Users can update their own transportation items"
on public.transportation_items;

drop policy if exists "Users can delete their own transportation items"
on public.transportation_items;

create policy "Users can view transportation items for accessible trips"
on public.transportation_items
for select
to authenticated
using (
    (
        coalesce(transportation_items.is_private, false) = false
        and (
            exists (
                select 1
                from public.trips
                where trips.id = transportation_items.trip_id
                and trips.user_id = (select auth.uid())
            )
            or exists (
                select 1
                from public.trip_members
                where trip_members.trip_id = transportation_items.trip_id
                and trip_members.user_id = (select auth.uid())
                and trip_members.status = 'active'
            )
        )
    )
    or transportation_items.user_id = (select auth.uid())
);

create policy "Users can create transportation items for accessible trips"
on public.transportation_items
for insert
to authenticated
with check (
    transportation_items.user_id = (select auth.uid())
    and (
        exists (
            select 1
            from public.trips
            where trips.id = transportation_items.trip_id
            and trips.user_id = (select auth.uid())
        )
        or exists (
            select 1
            from public.trip_members
            where trip_members.trip_id = transportation_items.trip_id
            and trip_members.user_id = (select auth.uid())
            and trip_members.status = 'active'
        )
    )
);

create policy "Users can update their own transportation items"
on public.transportation_items
for update
to authenticated
using (
    transportation_items.user_id = (select auth.uid())
    and (
        exists (
            select 1
            from public.trips
            where trips.id = transportation_items.trip_id
            and trips.user_id = (select auth.uid())
        )
        or exists (
            select 1
            from public.trip_members
            where trip_members.trip_id = transportation_items.trip_id
            and trip_members.user_id = (select auth.uid())
            and trip_members.status = 'active'
        )
    )
)
with check (
    transportation_items.user_id = (select auth.uid())
    and (
        exists (
            select 1
            from public.trips
            where trips.id = transportation_items.trip_id
            and trips.user_id = (select auth.uid())
        )
        or exists (
            select 1
            from public.trip_members
            where trip_members.trip_id = transportation_items.trip_id
            and trip_members.user_id = (select auth.uid())
            and trip_members.status = 'active'
        )
    )
);

create policy "Users can delete their own transportation items"
on public.transportation_items
for delete
to authenticated
using (
    transportation_items.user_id = (select auth.uid())
    and (
        exists (
            select 1
            from public.trips
            where trips.id = transportation_items.trip_id
            and trips.user_id = (select auth.uid())
        )
        or exists (
            select 1
            from public.trip_members
            where trip_members.trip_id = transportation_items.trip_id
            and trip_members.user_id = (select auth.uid())
            and trip_members.status = 'active'
        )
    )
);
