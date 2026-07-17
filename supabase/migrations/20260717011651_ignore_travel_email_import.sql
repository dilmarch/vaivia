create or replace function public.ignore_travel_email_import(
  p_import_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_import public.travel_email_imports%rowtype;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select *
    into v_import
    from public.travel_email_imports
   where id = p_import_id
     and user_id = v_user_id
   for update;

  if not found then
    raise exception 'import_not_found' using errcode = 'P0002';
  end if;

  if v_import.status = 'imported' then
    return jsonb_build_object(
      'status', 'already_imported',
      'importId', p_import_id,
      'tripId', v_import.matched_trip_id
    );
  end if;

  update public.travel_email_import_items
     set is_excluded = true
   where import_id = p_import_id;

  update public.travel_email_imports
     set status = 'rejected'
   where id = p_import_id
     and user_id = v_user_id;

  update public.notifications
     set read_at = coalesce(read_at, now())
   where user_id = v_user_id
     and type in (
       'travel_email_ready',
       'travel_email_needs_review',
       'travel_email_failed'
     )
     and metadata->>'importId' = p_import_id::text;

  return jsonb_build_object(
    'status', 'ignored',
    'importId', p_import_id
  );
end;
$$;

grant execute on function public.ignore_travel_email_import(uuid)
to authenticated;
