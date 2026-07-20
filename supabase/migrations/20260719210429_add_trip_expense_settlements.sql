create table if not exists public.trip_expense_settlements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  paid_by_participant_value text not null,
  received_by_participant_value text not null,
  amount numeric(12, 2) not null,
  reporting_currency text not null,
  settled_on date not null default ((now() at time zone 'utc')::date),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint trip_expense_settlements_amount_positive check (amount > 0),
  constraint trip_expense_settlements_currency_code check (
    reporting_currency ~ '^[A-Z]{3}$'
  ),
  constraint trip_expense_settlements_paid_by_format check (
    paid_by_participant_value ~ '^(member|member_user|invitation|family_member|guest):.+'
  ),
  constraint trip_expense_settlements_received_by_format check (
    received_by_participant_value ~ '^(member|member_user|invitation|family_member|guest):.+'
  ),
  constraint trip_expense_settlements_distinct_people check (
    paid_by_participant_value <> received_by_participant_value
  )
);

comment on table public.trip_expense_settlements is
  'Payments between trip participants that reduce the expense tracker balances without changing trip spending totals.';

create index if not exists trip_expense_settlements_trip_date_idx
  on public.trip_expense_settlements (trip_id, settled_on desc);

create index if not exists trip_expense_settlements_trip_created_idx
  on public.trip_expense_settlements (trip_id, created_at desc);

alter table public.trip_expense_settlements enable row level security;

create policy "Trip members can view expense settlements"
  on public.trip_expense_settlements
  for select
  to authenticated
  using (public.is_trip_active_member(trip_id));

create policy "Trip members can create expense settlements"
  on public.trip_expense_settlements
  for insert
  to authenticated
  with check (
    public.is_trip_active_member(trip_id)
    and created_by = (select auth.uid())
  );

revoke all on table public.trip_expense_settlements from anon;
grant select, insert on table public.trip_expense_settlements to authenticated;
grant all on table public.trip_expense_settlements to service_role;
