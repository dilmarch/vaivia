create table if not exists public.trip_expense_splits (
    id uuid primary key default gen_random_uuid(),
    expense_id uuid not null references public.trip_expenses(id) on delete cascade,
    trip_id uuid not null references public.trips(id) on delete cascade,
    participant_kind text not null,
    trip_member_id uuid references public.trip_members(id) on delete cascade,
    invitation_id uuid references public.trip_invitations(id) on delete cascade,
    family_member_id uuid references public.user_family_members(id) on delete cascade,
    user_id uuid references auth.users(id) on delete set null,
    guest_name text,
    split_amount numeric(12,2) not null,
    split_percentage numeric(7,4),
    currency text not null,
    amount_in_reporting_currency numeric(12,2),
    is_included boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint trip_expense_splits_participant_kind_check check (participant_kind in ('member','invitation','family_member','guest')),
    constraint trip_expense_splits_split_amount_check check (split_amount >= 0),
    constraint trip_expense_splits_split_percentage_check check (split_percentage is null or split_percentage between 0 and 100),
    constraint trip_expense_splits_currency_check check (currency ~ '^[A-Z]{3}$')
);

create table if not exists public.trip_expense_receipts (
    id uuid primary key default gen_random_uuid(),
    expense_id uuid not null references public.trip_expenses(id) on delete cascade,
    trip_id uuid not null references public.trips(id) on delete cascade,
    storage_bucket text not null default 'expense-receipts',
    storage_path text not null,
    file_name text not null,
    mime_type text not null,
    file_size_bytes bigint,
    uploaded_by uuid references auth.users(id) default auth.uid(),
    created_at timestamptz not null default now(),
    constraint trip_expense_receipts_mime_type_check check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
    constraint trip_expense_receipts_file_size_check check (file_size_bytes is null or file_size_bytes <= 10485760)
);

create table if not exists public.currency_exchange_rates (
    id uuid primary key default gen_random_uuid(),
    rate_date date not null,
    base_currency text not null,
    target_currency text not null,
    rate numeric(18,8) not null,
    provider text not null default 'frankfurter',
    fetched_at timestamptz not null default now(),
    constraint currency_exchange_rates_unique_key unique (rate_date, base_currency, target_currency, provider),
    constraint currency_exchange_rates_base_currency_check check (base_currency ~ '^[A-Z]{3}$'),
    constraint currency_exchange_rates_target_currency_check check (target_currency ~ '^[A-Z]{3}$'),
    constraint currency_exchange_rates_rate_check check (rate > 0)
);

create index if not exists trip_expenses_trip_date_idx on public.trip_expenses (trip_id, expense_date);
create index if not exists trip_expenses_trip_category_idx on public.trip_expenses (trip_id, category);
create index if not exists trip_expenses_trip_paid_by_member_idx on public.trip_expenses (trip_id, paid_by_trip_member_id);
create index if not exists trip_expense_splits_expense_id_idx on public.trip_expense_splits (expense_id);
create index if not exists trip_expense_splits_trip_member_idx on public.trip_expense_splits (trip_id, trip_member_id);
create index if not exists trip_budget_line_items_budget_id_idx on public.trip_budget_line_items (budget_id);
create index if not exists currency_exchange_rates_lookup_idx on public.currency_exchange_rates (rate_date, base_currency, target_currency);

insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do nothing;

grant select, insert, update, delete on table public.user_finance_settings to authenticated;
grant select, insert, update, delete on table public.trip_budget_categories to authenticated;
grant select, insert, update, delete on table public.trip_budgets to authenticated;
grant select, insert, update, delete on table public.trip_budget_line_items to authenticated;
grant select, insert, update, delete on table public.trip_expenses to authenticated;
grant select, insert, update, delete on table public.trip_expense_splits to authenticated;
grant select, insert, update, delete on table public.trip_expense_receipts to authenticated;
grant select, insert on table public.currency_exchange_rates to authenticated;

alter table public.user_finance_settings enable row level security;
alter table public.trip_budget_categories enable row level security;
alter table public.trip_budgets enable row level security;
alter table public.trip_budget_line_items enable row level security;
alter table public.trip_expenses enable row level security;
alter table public.trip_expense_splits enable row level security;
alter table public.trip_expense_receipts enable row level security;
alter table public.currency_exchange_rates enable row level security;
