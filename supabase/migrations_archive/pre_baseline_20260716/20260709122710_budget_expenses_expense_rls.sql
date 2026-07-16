drop policy if exists "Trip members can view expenses" on public.trip_expenses;
drop policy if exists "Trip members can create expenses" on public.trip_expenses;
drop policy if exists "Trip members can update expenses" on public.trip_expenses;
drop policy if exists "Trip members can delete expenses" on public.trip_expenses;

create policy "Trip members can view expenses"
on public.trip_expenses
for select
to authenticated
using (public.is_trip_active_member(trip_id));

create policy "Trip members can create expenses"
on public.trip_expenses
for insert
to authenticated
with check (public.is_trip_active_member(trip_id));

create policy "Trip members can update expenses"
on public.trip_expenses
for update
to authenticated
using (public.is_trip_active_member(trip_id))
with check (public.is_trip_active_member(trip_id));

create policy "Trip members can delete expenses"
on public.trip_expenses
for delete
to authenticated
using (public.is_trip_active_member(trip_id));

drop policy if exists "Trip members can view expense splits" on public.trip_expense_splits;
drop policy if exists "Trip members can create expense splits" on public.trip_expense_splits;
drop policy if exists "Trip members can update expense splits" on public.trip_expense_splits;
drop policy if exists "Trip members can delete expense splits" on public.trip_expense_splits;

create policy "Trip members can view expense splits"
on public.trip_expense_splits
for select
to authenticated
using (public.is_trip_active_member(trip_id));

create policy "Trip members can create expense splits"
on public.trip_expense_splits
for insert
to authenticated
with check (public.is_trip_active_member(trip_id));

create policy "Trip members can update expense splits"
on public.trip_expense_splits
for update
to authenticated
using (public.is_trip_active_member(trip_id))
with check (public.is_trip_active_member(trip_id));

create policy "Trip members can delete expense splits"
on public.trip_expense_splits
for delete
to authenticated
using (public.is_trip_active_member(trip_id));

drop policy if exists "Trip members can view expense receipts" on public.trip_expense_receipts;
drop policy if exists "Trip members can create expense receipts" on public.trip_expense_receipts;
drop policy if exists "Trip members can delete expense receipts" on public.trip_expense_receipts;

create policy "Trip members can view expense receipts"
on public.trip_expense_receipts
for select
to authenticated
using (public.is_trip_active_member(trip_id));

create policy "Trip members can create expense receipts"
on public.trip_expense_receipts
for insert
to authenticated
with check (public.is_trip_active_member(trip_id));

create policy "Trip members can delete expense receipts"
on public.trip_expense_receipts
for delete
to authenticated
using (public.is_trip_active_member(trip_id));

drop policy if exists "Authenticated users can view exchange rates" on public.currency_exchange_rates;
drop policy if exists "Authenticated users can cache exchange rates" on public.currency_exchange_rates;

create policy "Authenticated users can view exchange rates"
on public.currency_exchange_rates
for select
to authenticated
using (true);

create policy "Authenticated users can cache exchange rates"
on public.currency_exchange_rates
for insert
to authenticated
with check (true);
