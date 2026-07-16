-- Complete VAIVIA budget/expense/currency foundation and receipt storage access.
-- This migration is intentionally idempotent where possible because some budget tables already exist.

-- Ensure core budget / expense / currency tables exist.
create table if not exists public.user_finance_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_currency text not null default 'CAD' check (home_currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.currency_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  rate_date date not null,
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  target_currency text not null check (target_currency ~ '^[A-Z]{3}$'),
  rate numeric not null check (rate > 0),
  provider text not null default 'frankfurter',
  fetched_at timestamptz not null default now(),
  unique (rate_date, base_currency, target_currency, provider)
);

create table if not exists public.trip_budgets (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  reporting_currency text not null default 'CAD' check (reporting_currency ~ '^[A-Z]{3}$'),
  total_budget_amount numeric check (total_budget_amount is null or total_budget_amount >= 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_budget_categories (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  linked_expense_category text not null check (linked_expense_category = any (array['accommodations','transportation','entertainment','food','drink','souvenirs','other'])),
  sort_order integer not null default 0,
  is_default boolean not null default false,
  is_archived boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, name)
);

create table if not exists public.trip_budget_line_items (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.trip_budgets(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  category_id uuid references public.trip_budget_categories(id) on delete set null,
  name text not null,
  linked_expense_category text not null check (linked_expense_category = any (array['accommodations','transportation','entertainment','food','drink','souvenirs','other'])),
  planned_amount numeric not null default 0 check (planned_amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  expense_date date not null,
  description text not null,
  category text not null check (category = any (array['accommodations','transportation','entertainment','food','drink','souvenirs','other'])),
  amount numeric not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reporting_currency text not null check (reporting_currency ~ '^[A-Z]{3}$'),
  fetched_exchange_rate numeric check (fetched_exchange_rate is null or fetched_exchange_rate > 0),
  manual_exchange_rate numeric check (manual_exchange_rate is null or manual_exchange_rate > 0),
  exchange_rate_used numeric not null check (exchange_rate_used > 0),
  exchange_rate_is_manual boolean not null default false,
  amount_in_reporting_currency numeric,
  paid_by_trip_member_id uuid references public.trip_members(id) on delete set null,
  paid_by_invitation_id uuid references public.trip_invitations(id) on delete set null,
  paid_by_family_member_id uuid references public.user_family_members(id) on delete set null,
  paid_by_user_id uuid references auth.users(id) on delete set null,
  paid_by_guest_name text,
  split_method text not null default 'equal' check (split_method = any (array['equal','exact','percentage'])),
  source_type text not null default 'manual' check (source_type = any (array['manual','transportation','itinerary_event'])),
  transportation_item_id uuid references public.transportation_items(id) on delete set null,
  itinerary_event_id uuid references public.itinerary_items(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.trip_expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.trip_expenses(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  participant_kind text not null check (participant_kind = any (array['member','invitation','family_member','guest'])),
  trip_member_id uuid references public.trip_members(id) on delete cascade,
  invitation_id uuid references public.trip_invitations(id) on delete cascade,
  family_member_id uuid references public.user_family_members(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  guest_name text,
  split_amount numeric not null check (split_amount >= 0),
  split_percentage numeric check (split_percentage is null or (split_percentage >= 0 and split_percentage <= 100)),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_in_reporting_currency numeric,
  is_included boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_expense_receipts (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.trip_expenses(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  storage_bucket text not null default 'expense-receipts',
  storage_path text not null,
  file_name text not null,
  mime_type text not null check (mime_type = any (array['image/jpeg','image/png','image/webp','application/pdf'])),
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes <= 10485760),
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Common indexes for budget/expense reads.
create index if not exists trip_budgets_trip_id_idx on public.trip_budgets(trip_id);
create unique index if not exists trip_budgets_one_active_per_trip_idx on public.trip_budgets(trip_id) where is_active;
create index if not exists trip_budget_categories_trip_id_idx on public.trip_budget_categories(trip_id);
create index if not exists trip_budget_line_items_budget_id_idx on public.trip_budget_line_items(budget_id);
create index if not exists trip_budget_line_items_trip_id_idx on public.trip_budget_line_items(trip_id);
create index if not exists trip_expenses_trip_date_idx on public.trip_expenses(trip_id, expense_date) where deleted_at is null;
create index if not exists trip_expenses_trip_category_idx on public.trip_expenses(trip_id, category) where deleted_at is null;
create index if not exists trip_expenses_transportation_item_id_idx on public.trip_expenses(transportation_item_id) where transportation_item_id is not null;
create index if not exists trip_expenses_itinerary_event_id_idx on public.trip_expenses(itinerary_event_id) where itinerary_event_id is not null;
create index if not exists trip_expense_splits_expense_id_idx on public.trip_expense_splits(expense_id);
create index if not exists trip_expense_splits_trip_id_idx on public.trip_expense_splits(trip_id);
create index if not exists trip_expense_receipts_expense_id_idx on public.trip_expense_receipts(expense_id);
create index if not exists currency_exchange_rates_lookup_idx on public.currency_exchange_rates(rate_date, base_currency, target_currency, provider);

-- Enable RLS on all budget/currency tables.
alter table public.user_finance_settings enable row level security;
alter table public.currency_exchange_rates enable row level security;
alter table public.trip_budgets enable row level security;
alter table public.trip_budget_categories enable row level security;
alter table public.trip_budget_line_items enable row level security;
alter table public.trip_expenses enable row level security;
alter table public.trip_expense_splits enable row level security;
alter table public.trip_expense_receipts enable row level security;

-- Ensure Data API roles have table privileges. RLS still controls rows.
grant select, insert, update, delete on public.user_finance_settings to authenticated;
grant select, insert on public.currency_exchange_rates to authenticated;
grant select, insert, update, delete on public.trip_budgets to authenticated;
grant select, insert, update, delete on public.trip_budget_categories to authenticated;
grant select, insert, update, delete on public.trip_budget_line_items to authenticated;
grant select, insert, update, delete on public.trip_expenses to authenticated;
grant select, insert, update, delete on public.trip_expense_splits to authenticated;
grant select, insert, delete on public.trip_expense_receipts to authenticated;

-- Add RLS policies only where missing.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_finance_settings' and policyname='Users can manage their own finance settings') then
    create policy "Users can manage their own finance settings"
      on public.user_finance_settings
      for all
      to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='currency_exchange_rates' and policyname='Authenticated users can view exchange rates') then
    create policy "Authenticated users can view exchange rates"
      on public.currency_exchange_rates
      for select
      to authenticated
      using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='currency_exchange_rates' and policyname='Authenticated users can cache exchange rates') then
    create policy "Authenticated users can cache exchange rates"
      on public.currency_exchange_rates
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_budgets' and policyname='Trip members can view budgets') then
    create policy "Trip members can view budgets" on public.trip_budgets for select to authenticated using (is_trip_active_member(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_budgets' and policyname='Trip members can create budgets') then
    create policy "Trip members can create budgets" on public.trip_budgets for insert to authenticated with check (is_trip_active_member(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_budgets' and policyname='Trip members can update budgets') then
    create policy "Trip members can update budgets" on public.trip_budgets for update to authenticated using (is_trip_active_member(trip_id)) with check (is_trip_active_member(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_budgets' and policyname='Trip members can delete budgets') then
    create policy "Trip members can delete budgets" on public.trip_budgets for delete to authenticated using (is_trip_active_member(trip_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_budget_categories' and policyname='Trip members can view budget categories') then
    create policy "Trip members can view budget categories" on public.trip_budget_categories for select to authenticated using (is_trip_active_member(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_budget_categories' and policyname='Trip members can create budget categories') then
    create policy "Trip members can create budget categories" on public.trip_budget_categories for insert to authenticated with check (is_trip_active_member(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_budget_categories' and policyname='Trip members can update budget categories') then
    create policy "Trip members can update budget categories" on public.trip_budget_categories for update to authenticated using (is_trip_active_member(trip_id)) with check (is_trip_active_member(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_budget_categories' and policyname='Trip members can delete budget categories') then
    create policy "Trip members can delete budget categories" on public.trip_budget_categories for delete to authenticated using (is_trip_active_member(trip_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_budget_line_items' and policyname='Trip members can view budget line items') then
    create policy "Trip members can view budget line items" on public.trip_budget_line_items for select to authenticated using (is_trip_active_member(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_budget_line_items' and policyname='Trip members can create budget line items') then
    create policy "Trip members can create budget line items" on public.trip_budget_line_items for insert to authenticated with check (is_trip_active_member(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_budget_line_items' and policyname='Trip members can update budget line items') then
    create policy "Trip members can update budget line items" on public.trip_budget_line_items for update to authenticated using (is_trip_active_member(trip_id)) with check (is_trip_active_member(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_budget_line_items' and policyname='Trip members can delete budget line items') then
    create policy "Trip members can delete budget line items" on public.trip_budget_line_items for delete to authenticated using (is_trip_active_member(trip_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_expenses' and policyname='Trip members can view expenses') then
    create policy "Trip members can view expenses" on public.trip_expenses for select to authenticated using (is_trip_active_member(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_expenses' and policyname='Trip members can create expenses') then
    create policy "Trip members can create expenses" on public.trip_expenses for insert to authenticated with check (is_trip_active_member(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_expenses' and policyname='Trip members can update expenses') then
    create policy "Trip members can update expenses" on public.trip_expenses for update to authenticated using (is_trip_active_member(trip_id)) with check (is_trip_active_member(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_expenses' and policyname='Trip members can delete expenses') then
    create policy "Trip members can delete expenses" on public.trip_expenses for delete to authenticated using (is_trip_active_member(trip_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_expense_splits' and policyname='Trip members can view expense splits') then
    create policy "Trip members can view expense splits" on public.trip_expense_splits for select to authenticated using (is_trip_active_member(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_expense_splits' and policyname='Trip members can create expense splits') then
    create policy "Trip members can create expense splits" on public.trip_expense_splits for insert to authenticated with check (is_trip_active_member(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_expense_splits' and policyname='Trip members can update expense splits') then
    create policy "Trip members can update expense splits" on public.trip_expense_splits for update to authenticated using (is_trip_active_member(trip_id)) with check (is_trip_active_member(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_expense_splits' and policyname='Trip members can delete expense splits') then
    create policy "Trip members can delete expense splits" on public.trip_expense_splits for delete to authenticated using (is_trip_active_member(trip_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_expense_receipts' and policyname='Trip members can view expense receipts') then
    create policy "Trip members can view expense receipts" on public.trip_expense_receipts for select to authenticated using (is_trip_active_member(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_expense_receipts' and policyname='Trip members can create expense receipts') then
    create policy "Trip members can create expense receipts" on public.trip_expense_receipts for insert to authenticated with check (is_trip_active_member(trip_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_expense_receipts' and policyname='Trip members can delete expense receipts') then
    create policy "Trip members can delete expense receipts" on public.trip_expense_receipts for delete to authenticated using (is_trip_active_member(trip_id));
  end if;
end $$;

-- Receipt storage bucket: private, 10MB max, limited MIME types.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-receipts',
  'expense-receipts',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

-- Storage policies expect receipt files to be stored under: {trip_id}/{expense_id}/{filename}
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Trip members can view expense receipts') then
    create policy "Trip members can view expense receipts"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'expense-receipts'
        and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.is_trip_active_member(((storage.foldername(name))[1])::uuid)
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Trip members can upload expense receipts') then
    create policy "Trip members can upload expense receipts"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'expense-receipts'
        and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.is_trip_active_member(((storage.foldername(name))[1])::uuid)
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Trip members can update expense receipts') then
    create policy "Trip members can update expense receipts"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'expense-receipts'
        and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.is_trip_active_member(((storage.foldername(name))[1])::uuid)
      )
      with check (
        bucket_id = 'expense-receipts'
        and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.is_trip_active_member(((storage.foldername(name))[1])::uuid)
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Trip members can delete expense receipts') then
    create policy "Trip members can delete expense receipts"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'expense-receipts'
        and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.is_trip_active_member(((storage.foldername(name))[1])::uuid)
      );
  end if;
end $$;;
