grant usage on schema public to authenticated;

create table if not exists public.user_finance_settings (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    home_currency text not null default 'CAD',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint user_finance_settings_user_id_key unique (user_id),
    constraint user_finance_settings_home_currency_check check (home_currency ~ '^[A-Z]{3}$')
);

create table if not exists public.trip_budget_categories (
    id uuid primary key default gen_random_uuid(),
    trip_id uuid not null references public.trips(id) on delete cascade,
    name text not null,
    linked_expense_category text not null,
    sort_order int not null default 0,
    is_default boolean not null default false,
    is_archived boolean not null default false,
    created_by uuid references auth.users(id) default auth.uid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint trip_budget_categories_trip_name_key unique (trip_id, name),
    constraint trip_budget_categories_linked_expense_category_check
        check (linked_expense_category in ('accommodations','transportation','entertainment','food','drink','souvenirs','other'))
);

create table if not exists public.trip_budgets (
    id uuid primary key default gen_random_uuid(),
    trip_id uuid not null references public.trips(id) on delete cascade,
    name text not null,
    reporting_currency text not null default 'CAD',
    total_budget_amount numeric(12,2),
    is_active boolean not null default true,
    created_by uuid references auth.users(id) default auth.uid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint trip_budgets_reporting_currency_check check (reporting_currency ~ '^[A-Z]{3}$'),
    constraint trip_budgets_total_budget_amount_check check (total_budget_amount is null or total_budget_amount >= 0)
);

create unique index if not exists trip_budgets_one_active_per_trip_idx
on public.trip_budgets (trip_id)
where is_active;

create table if not exists public.trip_budget_line_items (
    id uuid primary key default gen_random_uuid(),
    budget_id uuid not null references public.trip_budgets(id) on delete cascade,
    trip_id uuid not null references public.trips(id) on delete cascade,
    category_id uuid references public.trip_budget_categories(id) on delete set null,
    name text not null,
    linked_expense_category text not null,
    planned_amount numeric(12,2) not null default 0,
    currency text not null,
    notes text,
    sort_order int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint trip_budget_line_items_planned_amount_check check (planned_amount >= 0),
    constraint trip_budget_line_items_currency_check check (currency ~ '^[A-Z]{3}$'),
    constraint trip_budget_line_items_linked_expense_category_check
        check (linked_expense_category in ('accommodations','transportation','entertainment','food','drink','souvenirs','other'))
);

create table if not exists public.trip_expenses (
    id uuid primary key default gen_random_uuid(),
    trip_id uuid not null references public.trips(id) on delete cascade,
    expense_date date not null,
    description text not null,
    category text not null,
    amount numeric(12,2) not null,
    currency text not null,
    reporting_currency text not null,
    fetched_exchange_rate numeric(18,8),
    manual_exchange_rate numeric(18,8),
    exchange_rate_used numeric(18,8) not null,
    exchange_rate_is_manual boolean not null default false,
    amount_in_reporting_currency numeric(12,2) generated always as
        (round((amount * exchange_rate_used)::numeric, 2)) stored,
    paid_by_trip_member_id uuid references public.trip_members(id) on delete set null,
    paid_by_invitation_id uuid references public.trip_invitations(id) on delete set null,
    paid_by_family_member_id uuid references public.user_family_members(id) on delete set null,
    paid_by_user_id uuid references auth.users(id) on delete set null,
    paid_by_guest_name text,
    split_method text not null default 'equal',
    source_type text not null default 'manual',
    transportation_item_id uuid references public.transportation_items(id) on delete set null,
    itinerary_event_id uuid references public.itinerary_items(id) on delete set null,
    notes text,
    created_by uuid references auth.users(id) default auth.uid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz null,
    constraint trip_expenses_amount_check check (amount > 0),
    constraint trip_expenses_currency_check check (currency ~ '^[A-Z]{3}$'),
    constraint trip_expenses_reporting_currency_check check (reporting_currency ~ '^[A-Z]{3}$'),
    constraint trip_expenses_category_check check (category in ('accommodations','transportation','entertainment','food','drink','souvenirs','other')),
    constraint trip_expenses_split_method_check check (split_method in ('equal','exact','percentage')),
    constraint trip_expenses_source_type_check check (source_type in ('manual','transportation','itinerary_event')),
    constraint trip_expenses_exchange_rate_used_check check (exchange_rate_used > 0),
    constraint trip_expenses_fetched_exchange_rate_check check (fetched_exchange_rate is null or fetched_exchange_rate > 0),
    constraint trip_expenses_manual_exchange_rate_check check (manual_exchange_rate is null or manual_exchange_rate > 0)
);
