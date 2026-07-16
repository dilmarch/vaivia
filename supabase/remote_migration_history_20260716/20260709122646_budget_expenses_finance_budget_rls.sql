drop policy if exists "Users can manage their own finance settings" on public.user_finance_settings;
create policy "Users can manage their own finance settings"
on public.user_finance_settings
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Trip members can view budget categories" on public.trip_budget_categories;
drop policy if exists "Trip members can create budget categories" on public.trip_budget_categories;
drop policy if exists "Trip members can update budget categories" on public.trip_budget_categories;
drop policy if exists "Trip members can delete budget categories" on public.trip_budget_categories;
create policy "Trip members can view budget categories" on public.trip_budget_categories for select to authenticated using (public.is_trip_active_member(trip_id));
create policy "Trip members can create budget categories" on public.trip_budget_categories for insert to authenticated with check (public.is_trip_active_member(trip_id));
create policy "Trip members can update budget categories" on public.trip_budget_categories for update to authenticated using (public.is_trip_active_member(trip_id)) with check (public.is_trip_active_member(trip_id));
create policy "Trip members can delete budget categories" on public.trip_budget_categories for delete to authenticated using (public.is_trip_active_member(trip_id));

drop policy if exists "Trip members can view budgets" on public.trip_budgets;
drop policy if exists "Trip members can create budgets" on public.trip_budgets;
drop policy if exists "Trip members can update budgets" on public.trip_budgets;
drop policy if exists "Trip members can delete budgets" on public.trip_budgets;
create policy "Trip members can view budgets" on public.trip_budgets for select to authenticated using (public.is_trip_active_member(trip_id));
create policy "Trip members can create budgets" on public.trip_budgets for insert to authenticated with check (public.is_trip_active_member(trip_id));
create policy "Trip members can update budgets" on public.trip_budgets for update to authenticated using (public.is_trip_active_member(trip_id)) with check (public.is_trip_active_member(trip_id));
create policy "Trip members can delete budgets" on public.trip_budgets for delete to authenticated using (public.is_trip_active_member(trip_id));

drop policy if exists "Trip members can view budget line items" on public.trip_budget_line_items;
drop policy if exists "Trip members can create budget line items" on public.trip_budget_line_items;
drop policy if exists "Trip members can update budget line items" on public.trip_budget_line_items;
drop policy if exists "Trip members can delete budget line items" on public.trip_budget_line_items;
create policy "Trip members can view budget line items" on public.trip_budget_line_items for select to authenticated using (public.is_trip_active_member(trip_id));
create policy "Trip members can create budget line items" on public.trip_budget_line_items for insert to authenticated with check (public.is_trip_active_member(trip_id));
create policy "Trip members can update budget line items" on public.trip_budget_line_items for update to authenticated using (public.is_trip_active_member(trip_id)) with check (public.is_trip_active_member(trip_id));
create policy "Trip members can delete budget line items" on public.trip_budget_line_items for delete to authenticated using (public.is_trip_active_member(trip_id));;
