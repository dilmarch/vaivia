drop view if exists public.connected_public_user_profiles;
create view public.connected_public_user_profiles
as
select
  user_profiles.id,
  user_profiles.first_name,
  user_profiles.last_name,
  user_profiles.username,
  user_profiles.avatar_url,
  user_profiles.role,
  user_profiles.join_date,
  user_profiles.created_at
from public.user_profiles
where user_profiles.id = (select auth.uid())
   or exists (
        select 1
        from public.user_friendships friendships
        where friendships.status = 'accepted'
          and (
            (
              friendships.requester_user_id = (select auth.uid())
              and friendships.addressee_user_id = user_profiles.id
            )
            or (
              friendships.addressee_user_id = (select auth.uid())
              and friendships.requester_user_id = user_profiles.id
            )
          )
      )
   or exists (
        select 1
        from public.trip_members viewer_membership
        join public.trip_members profile_membership
          on profile_membership.trip_id = viewer_membership.trip_id
        where viewer_membership.user_id = (select auth.uid())
          and viewer_membership.status = 'active'
          and profile_membership.user_id = user_profiles.id
          and profile_membership.status = 'active'
      )
   or exists (
        select 1
        from public.trips
        left join public.trip_members profile_membership
          on profile_membership.trip_id = trips.id
         and profile_membership.user_id = user_profiles.id
         and profile_membership.status = 'active'
        where trips.user_id = (select auth.uid())
          and (
            trips.user_id = user_profiles.id
            or profile_membership.user_id is not null
          )
      )
   or exists (
        select 1
        from public.trips
        join public.trip_members viewer_membership
          on viewer_membership.trip_id = trips.id
        where viewer_membership.user_id = (select auth.uid())
          and viewer_membership.status = 'active'
          and trips.user_id = user_profiles.id
      );
revoke all on public.connected_public_user_profiles from public;
grant select on public.connected_public_user_profiles to authenticated;
comment on view public.connected_public_user_profiles
is 'Email-free profile identity rows visible to connected users through accepted friendships or shared active trips.';
drop policy if exists "Friends can view accepted friend profiles" on public.user_profiles;
drop policy if exists "Trip members can view member profiles" on public.user_profiles;
