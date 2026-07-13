create or replace function public.unfriend_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid := auth.uid();
    updated_friendship public.user_friendships;
begin
    if current_user_id is null then
        raise exception 'Authentication required';
    end if;

    if target_user_id is null or target_user_id = current_user_id then
        raise exception 'Invalid friend';
    end if;

    update public.user_friendships
       set status = 'cancelled',
           blocked_by_user_id = null,
           updated_at = now()
     where status = 'accepted'
       and (
            (
                requester_user_id = current_user_id
                and addressee_user_id = target_user_id
            )
            or
            (
                requester_user_id = target_user_id
                and addressee_user_id = current_user_id
            )
       )
     returning * into updated_friendship;

    if updated_friendship.id is null then
        raise exception 'Friendship could not be removed';
    end if;
end;
$$;

revoke all on function public.unfriend_user(uuid) from public;
grant execute on function public.unfriend_user(uuid) to authenticated;
