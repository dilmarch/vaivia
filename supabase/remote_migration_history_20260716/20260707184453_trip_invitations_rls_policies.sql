drop policy if exists "Users can view invitations they sent or received" on public.trip_invitations;
create policy "Users can view invitations they sent or received"
on public.trip_invitations
for select
using (
  invited_by = auth.uid()
  or invited_user_id = auth.uid()
);

drop policy if exists "Users can respond to their pending invitations" on public.trip_invitations;
create policy "Users can respond to their pending invitations"
on public.trip_invitations
for update
using (
  invited_user_id = auth.uid()
  and status = 'pending'
)
with check (
  invited_user_id = auth.uid()
  and status in ('accepted', 'declined')
);;
