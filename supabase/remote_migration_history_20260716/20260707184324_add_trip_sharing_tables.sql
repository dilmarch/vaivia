create table if not exists public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'active' check (status in ('active', 'left')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz default now(),
  left_at timestamptz,
  created_at timestamptz default now(),
  unique (trip_id, user_id)
);

create table if not exists public.trip_invitations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  invited_user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  invited_username text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  consent_confirmed boolean not null default false,
  created_at timestamptz default now(),
  responded_at timestamptz,
  constraint trip_invitations_has_invitee check (
    invited_user_id is not null
    or invited_email is not null
    or invited_username is not null
  )
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  trip_id uuid references public.trips(id) on delete cascade,
  invitation_id uuid references public.trip_invitations(id) on delete cascade,
  type text not null check (
    type in (
      'trip_invite_received',
      'trip_invite_accepted',
      'trip_invite_declined',
      'trip_updated',
      'trip_item_added',
      'trip_item_updated',
      'trip_item_deleted'
    )
  ),
  title text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz default now()
);

alter table public.trips
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text,
  add column if not exists updated_at timestamptz default now();

alter table public.itinerary_items
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists is_private boolean not null default false,
  add column if not exists updated_at timestamptz default now();

alter table public.transportation_items
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists is_private boolean not null default false;

alter table public.budget_items
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists is_private boolean not null default false;

alter table public.trip_ideas
  add column if not exists is_private boolean not null default false;

alter table public.itinerary_items alter column created_by set default auth.uid();
alter table public.transportation_items alter column created_by set default auth.uid();
alter table public.budget_items alter column created_by set default auth.uid();
alter table public.trip_ideas alter column created_by set default auth.uid();;
