create policy "Users can view own app alerts"
on public.notifications
for select
using (user_id = auth.uid());;
