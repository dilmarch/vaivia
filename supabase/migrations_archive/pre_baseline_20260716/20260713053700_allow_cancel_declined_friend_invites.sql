create or replace function public.respond_to_friend_invitation(
    friendship_id uuid,
    next_status text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid := auth.uid();
    updated_friendship public.user_friendships;
    actor_name text;
begin
    if current_user_id is null then
        raise exception 'Authentication required';
    end if;

    if next_status not in ('accepted', 'declined', 'cancelled') then
        raise exception 'Invalid friendship status';
    end if;

    update public.user_friendships
       set status = next_status,
           blocked_by_user_id = null,
           responded_at = case
               when next_status in ('accepted', 'declined') then now()
               else responded_at
           end,
           updated_at = now()
     where id = friendship_id
       and (
            (
                next_status = 'cancelled'
                and requester_user_id = current_user_id
                and status in ('pending', 'declined')
            )
            or
            (
                next_status in ('accepted', 'declined')
                and addressee_user_id = current_user_id
                and status = 'pending'
            )
       )
     returning * into updated_friendship;

    if updated_friendship.id is null then
        raise exception 'Friend invitation could not be updated';
    end if;

    if next_status = 'accepted' then
        actor_name := public.get_user_display_name(current_user_id);

        insert into public.notifications (
          user_id,
          actor_user_id,
          type,
          title,
          body,
          metadata
        )
        values (
          updated_friendship.requester_user_id,
          current_user_id,
          'friend_request_accepted',
          'Friend request accepted',
          coalesce(actor_name, 'Someone') || ' accepted your friend request.',
          jsonb_build_object('friendshipId', updated_friendship.id)
        );
    end if;
end;
$$;

revoke all on function public.respond_to_friend_invitation(uuid, text) from public;
grant execute on function public.respond_to_friend_invitation(uuid, text) to authenticated;
