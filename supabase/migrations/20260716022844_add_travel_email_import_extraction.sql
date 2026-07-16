alter table public.travel_email_imports
  add column if not exists import_type text,
  add column if not exists extracted_data jsonb,
  add column if not exists extraction_confidence numeric(5,4),
  add column if not exists extraction_model text,
  add column if not exists requires_data_review boolean not null default true;

create table if not exists public.travel_email_import_attachments (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.travel_email_imports(id) on delete cascade,
  provider_attachment_id text,
  filename text,
  mime_type text,
  size_bytes bigint,
  storage_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.travel_email_import_items (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.travel_email_imports(id) on delete cascade,
  item_type text not null,
  item_order integer not null default 0,
  confidence numeric(5,4),
  extracted_data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists travel_email_import_attachments_import_id_idx
on public.travel_email_import_attachments(import_id);

create index if not exists travel_email_import_items_import_id_idx
on public.travel_email_import_items(import_id);

create index if not exists travel_email_import_items_item_type_idx
on public.travel_email_import_items(item_type);

alter table public.travel_email_import_attachments enable row level security;
alter table public.travel_email_import_items enable row level security;

drop policy if exists "Users can view their own travel email attachments"
on public.travel_email_import_attachments;

create policy "Users can view their own travel email attachments"
on public.travel_email_import_attachments
for select
to authenticated
using (
  exists (
    select 1
      from public.travel_email_imports imports
     where imports.id = travel_email_import_attachments.import_id
       and imports.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can delete their own travel email attachments"
on public.travel_email_import_attachments;

create policy "Users can delete their own travel email attachments"
on public.travel_email_import_attachments
for delete
to authenticated
using (
  exists (
    select 1
      from public.travel_email_imports imports
     where imports.id = travel_email_import_attachments.import_id
       and imports.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can view their own travel email import items"
on public.travel_email_import_items;

create policy "Users can view their own travel email import items"
on public.travel_email_import_items
for select
to authenticated
using (
  exists (
    select 1
      from public.travel_email_imports imports
     where imports.id = travel_email_import_items.import_id
       and imports.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can delete their own travel email import items"
on public.travel_email_import_items;

create policy "Users can delete their own travel email import items"
on public.travel_email_import_items
for delete
to authenticated
using (
  exists (
    select 1
      from public.travel_email_imports imports
     where imports.id = travel_email_import_items.import_id
       and imports.user_id = (select auth.uid())
  )
);

revoke insert, update on public.travel_email_import_attachments from anon, authenticated;
revoke insert, update on public.travel_email_import_attachments from public;
revoke insert, update on public.travel_email_import_items from anon, authenticated;
revoke insert, update on public.travel_email_import_items from public;

grant select, delete on public.travel_email_import_attachments to authenticated;
grant select, delete on public.travel_email_import_items to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'travel-email-imports',
  'travel-email-imports',
  false,
  15000000,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/plain',
    'text/html'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

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
        'passport_stamp_added',
        'feature_suggestion_implemented',
        'terms_updated',
        'terms_acceptance_required',
        'profile_onboarding_prompt',
        'theme_exploration_prompt',
        'travel_email_ready',
        'travel_email_needs_review',
        'travel_email_failed'
      ]::text[]
    )
  );

alter table public.user_notification_preferences
  drop constraint if exists user_notification_preferences_type_check;

alter table public.user_notification_preferences
  add constraint user_notification_preferences_type_check
  check (
    notification_type = any (
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
        'passport_stamp_added',
        'feature_suggestion_implemented',
        'terms_updated',
        'terms_acceptance_required',
        'profile_onboarding_prompt',
        'theme_exploration_prompt',
        'travel_email_ready',
        'travel_email_needs_review',
        'travel_email_failed'
      ]::text[]
    )
  );
