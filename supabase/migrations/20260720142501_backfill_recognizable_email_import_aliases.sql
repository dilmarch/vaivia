-- Give existing users with valid usernames the same recognizable primary
-- forwarding-address format used for new accounts. Legacy aliases intentionally
-- remain active so saved forwarding rules and previously shared addresses keep
-- working.

do $$
declare
  profile_record record;
  attempt integer;
  local_part text;
  issued boolean;
begin
  for profile_record in
    select
      profile.id,
      public.normalize_vaivia_username(profile.username) as username
    from public.user_profiles profile
    where profile.username is not null
      and not exists (
        select 1
        from public.user_email_import_addresses address
        where address.user_id = profile.id
          and address.is_primary
          and address.is_active
          and address.address_format = 'username'
          and split_part(address.inbound_token, '.', 1) =
            public.normalize_vaivia_username(profile.username)
      )
    order by profile.id
  loop
    issued := false;

    for attempt in 1..8 loop
      local_part := profile_record.username || '.' ||
        pg_catalog.encode(extensions.gen_random_bytes(6), 'hex');

      begin
        perform private.set_primary_email_import_alias(
          profile_record.id,
          local_part,
          false,
          null
        );
        issued := true;
        exit;
      exception when unique_violation then
        -- Retry only the random suffix. Existing aliases are never reassigned.
      end;
    end loop;

    if not issued then
      raise exception 'Could not backfill a unique email import alias'
        using errcode = '23505';
    end if;
  end loop;
end;
$$;
