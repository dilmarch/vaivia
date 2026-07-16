do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trip_ideas_trip_id_id_unique'
      and conrelid = 'public.trip_ideas'::regclass
  ) then
    alter table public.trip_ideas
      add constraint trip_ideas_trip_id_id_unique unique (trip_id, id);
  end if;
end $$;

create table if not exists public.trip_idea_reactions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  idea_id uuid not null references public.trip_ideas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('heart', 'thumbs_up', 'thumbs_down')),
  score integer generated always as (
    case reaction
      when 'heart' then 2
      when 'thumbs_up' then 1
      when 'thumbs_down' then -1
      else 0
    end
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint trip_idea_reactions_one_per_user_per_idea unique (idea_id, user_id),
  constraint trip_idea_reactions_trip_idea_match
    foreign key (trip_id, idea_id)
    references public.trip_ideas(trip_id, id)
    on delete cascade
);

create index if not exists trip_idea_reactions_trip_id_idx
  on public.trip_idea_reactions(trip_id);

create index if not exists trip_idea_reactions_idea_id_idx
  on public.trip_idea_reactions(idea_id);

create index if not exists trip_idea_reactions_user_id_idx
  on public.trip_idea_reactions(user_id);

create index if not exists trip_idea_reactions_score_idx
  on public.trip_idea_reactions(idea_id, score);

alter table public.trip_idea_reactions enable row level security;

drop trigger if exists set_trip_idea_reactions_updated_at on public.trip_idea_reactions;
create trigger set_trip_idea_reactions_updated_at
  before update on public.trip_idea_reactions
  for each row
  execute function public.set_updated_at();

drop policy if exists "Users can view reactions for their trips" on public.trip_idea_reactions;
create policy "Users can view reactions for their trips"
  on public.trip_idea_reactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.trips t
      where t.id = trip_idea_reactions.trip_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert their own idea reactions" on public.trip_idea_reactions;
create policy "Users can insert their own idea reactions"
  on public.trip_idea_reactions
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.trips t
      where t.id = trip_idea_reactions.trip_id
        and t.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.trip_ideas i
      where i.id = trip_idea_reactions.idea_id
        and i.trip_id = trip_idea_reactions.trip_id
    )
  );

drop policy if exists "Users can update their own idea reactions" on public.trip_idea_reactions;
create policy "Users can update their own idea reactions"
  on public.trip_idea_reactions
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.trips t
      where t.id = trip_idea_reactions.trip_id
        and t.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.trips t
      where t.id = trip_idea_reactions.trip_id
        and t.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.trip_ideas i
      where i.id = trip_idea_reactions.idea_id
        and i.trip_id = trip_idea_reactions.trip_id
    )
  );

drop policy if exists "Users can delete their own idea reactions" on public.trip_idea_reactions;
create policy "Users can delete their own idea reactions"
  on public.trip_idea_reactions
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.trips t
      where t.id = trip_idea_reactions.trip_id
        and t.user_id = auth.uid()
    )
  );;
