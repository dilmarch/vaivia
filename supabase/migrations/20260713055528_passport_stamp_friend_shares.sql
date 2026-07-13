create table if not exists public.user_passport_stamp_shares (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  source_stamp_id uuid not null references public.user_passport_stamps(id) on delete cascade,
  accepted_stamp_id uuid references public.user_passport_stamps(id) on delete set null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint user_passport_stamp_shares_status_check
    check (status in ('pending', 'accepted', 'declined')),
  constraint user_passport_stamp_shares_not_self_check
    check (sender_user_id <> recipient_user_id)
);

create unique index if not exists user_passport_stamp_shares_pending_unique_idx
on public.user_passport_stamp_shares(sender_user_id, recipient_user_id, source_stamp_id)
where status = 'pending';

create index if not exists user_passport_stamp_shares_recipient_idx
on public.user_passport_stamp_shares(recipient_user_id, status, created_at desc);

alter table public.user_passport_stamp_shares enable row level security;

drop policy if exists "Users can view their own passport stamp shares"
on public.user_passport_stamp_shares;

create policy "Users can view their own passport stamp shares"
on public.user_passport_stamp_shares
for select
to authenticated
using (
  (select auth.uid()) = sender_user_id
  or (select auth.uid()) = recipient_user_id
);

drop policy if exists "Users can create passport stamp shares they send"
on public.user_passport_stamp_shares;

create policy "Users can create passport stamp shares they send"
on public.user_passport_stamp_shares
for insert
to authenticated
with check ((select auth.uid()) = sender_user_id);

drop policy if exists "Recipients can update passport stamp shares"
on public.user_passport_stamp_shares;

create policy "Recipients can update passport stamp shares"
on public.user_passport_stamp_shares
for update
to authenticated
using ((select auth.uid()) = recipient_user_id)
with check ((select auth.uid()) = recipient_user_id);

grant select, insert, update on table public.user_passport_stamp_shares to authenticated;

create table if not exists public.news_feed_posts (
  id uuid primary key default gen_random_uuid(),
  post_key text not null unique,
  user_id uuid references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  audience_user_id uuid references auth.users(id) on delete cascade,
  post_type text not null,
  title text not null,
  body text not null,
  meta text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists news_feed_posts_audience_created_idx
on public.news_feed_posts(audience_user_id, archived_at, created_at desc);

alter table public.news_feed_posts enable row level security;

drop policy if exists "Users can view their own news feed posts"
on public.news_feed_posts;

create policy "Users can view their own news feed posts"
on public.news_feed_posts
for select
to authenticated
using (
  audience_user_id = (select auth.uid())
  or user_id = (select auth.uid())
  or actor_user_id = (select auth.uid())
);

grant select on table public.news_feed_posts to authenticated;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type = any (
      array[
        'trip_invite_received',
        'trip_invite_accepted',
        'trip_invite_declined',
        'trip_updated',
        'trip_item_added',
        'trip_item_updated',
        'trip_item_deleted',
        'trip_slug_changed',
        'friend_request_received',
        'friend_request_accepted',
        'passport_stamp_share_received',
        'passport_stamp_share_accepted',
        'passport_stamp_share_declined',
        'passport_stamp_added'
      ]::text[]
    )
  );

create or replace function public.send_passport_stamp_share(
  source_stamp_id uuid,
  recipient_user_ids uuid[]
)
returns setof public.user_passport_stamp_shares
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  stamp_row public.user_passport_stamps;
  recipient_id uuid;
  share_row public.user_passport_stamp_shares;
  sender_name text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into stamp_row
    from public.user_passport_stamps
   where id = source_stamp_id
     and user_id = current_user_id;

  if stamp_row.id is null then
    raise exception 'Passport stamp not found';
  end if;

  sender_name := public.get_user_display_name(current_user_id);

  foreach recipient_id in array coalesce(recipient_user_ids, array[]::uuid[]) loop
    if recipient_id is null or recipient_id = current_user_id then
      continue;
    end if;

    if not exists (
      select 1
        from public.user_friendships friendships
       where friendships.status = 'accepted'
         and (
              (
                friendships.requester_user_id = current_user_id
                and friendships.addressee_user_id = recipient_id
              )
              or
              (
                friendships.addressee_user_id = current_user_id
                and friendships.requester_user_id = recipient_id
              )
         )
    ) then
      continue;
    end if;

    insert into public.user_passport_stamp_shares (
      sender_user_id,
      recipient_user_id,
      source_stamp_id,
      status
    )
    values (
      current_user_id,
      recipient_id,
      source_stamp_id,
      'pending'
    )
    on conflict (sender_user_id, recipient_user_id, source_stamp_id)
      where status = 'pending'
    do update set updated_at = now()
    returning * into share_row;

    insert into public.notifications (
      user_id,
      actor_user_id,
      type,
      title,
      body,
      metadata
    )
    values (
      recipient_id,
      current_user_id,
      'passport_stamp_share_received',
      'Passport stamp received',
      coalesce(sender_name, 'A friend') || ' sent you a passport stamp.',
      jsonb_build_object(
        'action', 'review_passport_stamp_share',
        'shareId', share_row.id,
        'sourceStampId', source_stamp_id
      )
    );

    return next share_row;
  end loop;

  return;
end;
$$;

revoke all on function public.send_passport_stamp_share(uuid, uuid[]) from public;
grant execute on function public.send_passport_stamp_share(uuid, uuid[]) to authenticated;

create or replace function public.respond_to_passport_stamp_share(
  share_id uuid,
  next_status text,
  stamp_patch jsonb default '{}'::jsonb
)
returns public.user_passport_stamp_shares
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  share_row public.user_passport_stamp_shares;
  source_stamp public.user_passport_stamps;
  accepted_stamp public.user_passport_stamps;
  visit_year integer;
  visit_month integer;
  first_visited_on date;
  actor_name text;
  feed_body text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if next_status not in ('accepted', 'declined') then
    raise exception 'Invalid passport stamp response';
  end if;

  select *
    into share_row
    from public.user_passport_stamp_shares
   where id = share_id
     and recipient_user_id = current_user_id
     and status = 'pending'
   for update;

  if share_row.id is null then
    raise exception 'Passport stamp share could not be found';
  end if;

  select *
    into source_stamp
    from public.user_passport_stamps
   where id = share_row.source_stamp_id;

  if source_stamp.id is null then
    raise exception 'Shared passport stamp could not be found';
  end if;

  if next_status = 'declined' then
    update public.user_passport_stamp_shares
       set status = 'declined',
           responded_at = now(),
           updated_at = now()
     where id = share_id
     returning * into share_row;

    return share_row;
  end if;

  visit_year := nullif(stamp_patch->>'firstVisitYear', '')::integer;
  visit_month := nullif(stamp_patch->>'visitMonth', '')::integer;

  if visit_year is null then
    visit_year := extract(year from coalesce(source_stamp.first_visited_on, source_stamp.stamped_at::date, source_stamp.created_at::date));
  end if;

  if visit_month is null then
    visit_month := coalesce(source_stamp.visit_month, extract(month from coalesce(source_stamp.first_visited_on, source_stamp.stamped_at::date, source_stamp.created_at::date))::integer);
  end if;

  if visit_year > extract(year from current_date)::integer
     or (
       visit_year = extract(year from current_date)::integer
       and visit_month > extract(month from current_date)::integer
     ) then
    raise exception 'Passport stamps cannot be added for future travel';
  end if;

  first_visited_on := make_date(visit_year, greatest(1, least(12, visit_month)), 1);

  insert into public.user_passport_stamps (
    user_id,
    country_code,
    country_name,
    flag_emoji,
    source,
    first_visited_on,
    stamped_at,
    first_entry_iata_code,
    first_entry_icao_code,
    first_entry_city,
    first_entry_airport_name,
    first_entry_airport_google_place_id,
    first_entry_airport_formatted_address,
    welcome_label_snapshot,
    arrival_label_snapshot,
    stamp_display_country_name,
    stamp_display_flag,
    visit_city,
    visit_region,
    visit_month,
    visit_status,
    port_of_entry_type,
    port_of_entry_name,
    updated_at
  )
  values (
    current_user_id,
    source_stamp.country_code,
    source_stamp.country_name,
    source_stamp.flag_emoji,
    'manual',
    first_visited_on,
    now(),
    source_stamp.first_entry_iata_code,
    source_stamp.first_entry_icao_code,
    coalesce(nullif(stamp_patch->>'airportCity', ''), source_stamp.first_entry_city),
    coalesce(nullif(stamp_patch->>'airportName', ''), source_stamp.first_entry_airport_name),
    source_stamp.first_entry_airport_google_place_id,
    source_stamp.first_entry_airport_formatted_address,
    source_stamp.welcome_label_snapshot,
    source_stamp.arrival_label_snapshot,
    source_stamp.stamp_display_country_name,
    source_stamp.stamp_display_flag,
    coalesce(nullif(stamp_patch->>'visitCity', ''), source_stamp.visit_city),
    coalesce(nullif(stamp_patch->>'visitRegion', ''), source_stamp.visit_region),
    visit_month,
    case when stamp_patch->>'visitStatus' = 'lived' then 'lived' else coalesce(source_stamp.visit_status, 'visited') end,
    source_stamp.port_of_entry_type,
    coalesce(nullif(stamp_patch->>'portOfEntryName', ''), source_stamp.port_of_entry_name),
    now()
  )
  returning * into accepted_stamp;

  update public.user_passport_stamp_shares
     set status = 'accepted',
         accepted_stamp_id = accepted_stamp.id,
         responded_at = now(),
         updated_at = now()
   where id = share_id
   returning * into share_row;

  actor_name := public.get_user_display_name(current_user_id);
  feed_body :=
    coalesce(actor_name, 'A friend') ||
    ' added a new passport stamp: ' ||
    coalesce(accepted_stamp.stamp_display_country_name, accepted_stamp.country_name) ||
    ' in ' ||
    visit_year::text ||
    case when coalesce(accepted_stamp.visit_city, '') <> '' then
      ', entered in ' || accepted_stamp.visit_city
    else
      ''
    end ||
    case when coalesce(accepted_stamp.port_of_entry_name, '') <> '' then
      ' via ' || accepted_stamp.port_of_entry_name
    else
      ''
    end ||
    '.';

  insert into public.news_feed_posts (
    post_key,
    user_id,
    actor_user_id,
    audience_user_id,
    post_type,
    title,
    body,
    meta,
    metadata
  )
  values (
    'passport-stamp-share-' || share_row.id::text,
    current_user_id,
    current_user_id,
    share_row.sender_user_id,
    'friends',
    'Friend added a passport stamp',
    feed_body,
    'Passport stamp',
    jsonb_build_object(
      'shareId', share_row.id,
      'stampId', accepted_stamp.id,
      'countryCode', accepted_stamp.country_code
    )
  )
  on conflict (post_key) do nothing;

  return share_row;
end;
$$;

revoke all on function public.respond_to_passport_stamp_share(uuid, text, jsonb) from public;
grant execute on function public.respond_to_passport_stamp_share(uuid, text, jsonb) to authenticated;
