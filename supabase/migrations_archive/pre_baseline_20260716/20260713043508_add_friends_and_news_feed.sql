create table if not exists public.user_friendships (
    id uuid primary key default gen_random_uuid(),
    requester_user_id uuid not null references auth.users(id) on delete cascade,
    addressee_identifier text not null,
    addressee_user_id uuid references auth.users(id) on delete cascade,
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    responded_at timestamptz,
    constraint user_friendships_status_check
        check (status in ('pending', 'accepted', 'cancelled', 'declined')),
    constraint user_friendships_not_self_check
        check (addressee_user_id is null or requester_user_id <> addressee_user_id)
);

create index if not exists user_friendships_requester_idx
on public.user_friendships(requester_user_id, status);

create index if not exists user_friendships_addressee_idx
on public.user_friendships(addressee_user_id, status);

create unique index if not exists user_friendships_pending_identifier_idx
on public.user_friendships(requester_user_id, lower(addressee_identifier))
where status = 'pending';

alter table public.user_friendships enable row level security;

drop policy if exists "Users can view their own friendships" on public.user_friendships;
create policy "Users can view their own friendships"
on public.user_friendships
for select
to authenticated
using (
    (select auth.uid()) = requester_user_id
    or (select auth.uid()) = addressee_user_id
);

drop policy if exists "Users can create their own friendship requests" on public.user_friendships;
create policy "Users can create their own friendship requests"
on public.user_friendships
for insert
to authenticated
with check ((select auth.uid()) = requester_user_id);

drop policy if exists "Users can update their own friendship requests" on public.user_friendships;
create policy "Users can update their own friendship requests"
on public.user_friendships
for update
to authenticated
using (
    (select auth.uid()) = requester_user_id
    or (select auth.uid()) = addressee_user_id
)
with check (
    (select auth.uid()) = requester_user_id
    or (select auth.uid()) = addressee_user_id
);

drop policy if exists "Friends can view accepted friend profiles" on public.user_profiles;
create policy "Friends can view accepted friend profiles"
on public.user_profiles
for select
to authenticated
using (
    exists (
        select 1
        from public.user_friendships friendships
        where friendships.status = 'accepted'
          and (
              (
                  friendships.requester_user_id = (select auth.uid())
                  and friendships.addressee_user_id = user_profiles.id
              )
              or (
                  friendships.addressee_user_id = (select auth.uid())
                  and friendships.requester_user_id = user_profiles.id
              )
          )
    )
);

create or replace function public.create_friend_invitation(invitee_identifier text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid := auth.uid();
    normalized_identifier text := lower(trim(invitee_identifier));
    target_user_id uuid;
    created_invitation_id uuid;
begin
    if current_user_id is null then
        raise exception 'Authentication required';
    end if;

    if normalized_identifier = '' then
        raise exception 'Friend username or email is required';
    end if;

    select user_profiles.id
      into target_user_id
      from public.user_profiles
     where lower(coalesce(user_profiles.email, '')) = normalized_identifier
        or lower(coalesce(user_profiles.username, '')) = normalized_identifier
     limit 1;

    if target_user_id = current_user_id then
        raise exception 'You cannot invite yourself';
    end if;

    insert into public.user_friendships (
        requester_user_id,
        addressee_identifier,
        addressee_user_id,
        status
    )
    values (
        current_user_id,
        trim(invitee_identifier),
        target_user_id,
        'pending'
    )
    returning id into created_invitation_id;

    return created_invitation_id;
end;
$$;

revoke all on function public.create_friend_invitation(text) from public;
grant execute on function public.create_friend_invitation(text) to authenticated;

create or replace function public.respond_to_friend_invitation(
    friendship_id uuid,
    next_status text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid := auth.uid();
begin
    if current_user_id is null then
        raise exception 'Authentication required';
    end if;

    if next_status not in ('accepted', 'declined', 'cancelled') then
        raise exception 'Invalid friendship status';
    end if;

    update public.user_friendships
       set status = next_status,
           responded_at = case when next_status in ('accepted', 'declined') then now() else responded_at end,
           updated_at = now()
     where id = friendship_id
       and status = 'pending'
       and (
            (next_status = 'cancelled' and requester_user_id = current_user_id)
            or
            (next_status in ('accepted', 'declined') and addressee_user_id = current_user_id)
       );

    if not found then
        raise exception 'Friend invitation could not be updated';
    end if;
end;
$$;

revoke all on function public.respond_to_friend_invitation(uuid, text) from public;
grant execute on function public.respond_to_friend_invitation(uuid, text) to authenticated;

alter table public.user_preferences
add column if not exists news_feed_mode text not null default 'integrated';

do $$
begin
    if exists (
        select 1 from pg_constraint
        where conname = 'user_preferences_news_feed_mode_check'
    ) then
        alter table public.user_preferences
        drop constraint user_preferences_news_feed_mode_check;
    end if;

    alter table public.user_preferences
    add constraint user_preferences_news_feed_mode_check
    check (news_feed_mode in ('integrated', 'widget'));
end $$;

create table if not exists public.news_feed_reactions (
    id uuid primary key default gen_random_uuid(),
    post_key text not null,
    user_id uuid not null references auth.users(id) on delete cascade,
    emoji text not null,
    created_at timestamptz not null default now(),
    unique(post_key, user_id, emoji)
);

create index if not exists news_feed_reactions_post_idx
on public.news_feed_reactions(post_key);

alter table public.news_feed_reactions enable row level security;

drop policy if exists "Authenticated users can view news feed reactions" on public.news_feed_reactions;
create policy "Authenticated users can view news feed reactions"
on public.news_feed_reactions
for select
to authenticated
using (true);

drop policy if exists "Users can add their own news feed reactions" on public.news_feed_reactions;
create policy "Users can add their own news feed reactions"
on public.news_feed_reactions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own news feed reactions" on public.news_feed_reactions;
create policy "Users can delete their own news feed reactions"
on public.news_feed_reactions
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update on public.user_friendships to authenticated;
grant select, insert, delete on public.news_feed_reactions to authenticated;
