alter table public.travel_email_imports
  add column if not exists matched_trip_id uuid references public.trips(id) on delete set null,
  add column if not exists imported_at timestamptz;

alter table public.travel_email_import_items
  add column if not exists matched_trip_id uuid references public.trips(id) on delete set null,
  add column if not exists imported_record_id uuid references public.transportation_items(id) on delete set null,
  add column if not exists imported_at timestamptz,
  add column if not exists is_excluded boolean not null default false,
  add column if not exists reviewed_data jsonb;

create index if not exists travel_email_imports_matched_trip_id_idx
on public.travel_email_imports(matched_trip_id);

create index if not exists travel_email_import_items_matched_trip_id_idx
on public.travel_email_import_items(matched_trip_id);

create index if not exists travel_email_import_items_imported_record_id_idx
on public.travel_email_import_items(imported_record_id);

create or replace function public.import_travel_email_flights(
  p_import_id uuid,
  p_trip_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_import public.travel_email_imports%rowtype;
  v_trip public.trips%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_include boolean;
  v_data jsonb;
  v_flight_number text;
  v_airline_code text;
  v_airline_name text;
  v_departure_location text;
  v_arrival_location text;
  v_departure_date date;
  v_arrival_date date;
  v_departure_time text;
  v_arrival_time text;
  v_departure_timezone text;
  v_arrival_timezone text;
  v_status text;
  v_title text;
  v_notes text;
  v_trip_leg_id uuid;
  v_transportation_id uuid;
  v_created_ids uuid[] := array[]::uuid[];
  v_existing_id uuid;
  v_selected_count integer := 0;
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

  if v_import.status = 'imported' and exists (
    select 1
      from public.travel_email_import_items
     where import_id = p_import_id
       and imported_record_id is not null
  ) then
    return jsonb_build_object(
      'status', 'already_imported',
      'tripId', v_import.matched_trip_id,
      'transportationItemIds',
      coalesce(
        (
          select jsonb_agg(imported_record_id)
            from public.travel_email_import_items
           where import_id = p_import_id
             and imported_record_id is not null
        ),
        '[]'::jsonb
      )
    );
  end if;

  if v_import.status not in ('needs_review', 'ready', 'imported') then
    raise exception 'import_not_ready' using errcode = 'P0001';
  end if;

  select *
    into v_trip
    from public.trips
   where id = p_trip_id
     and archived_at is null;

  if not found then
    raise exception 'trip_not_found' using errcode = 'P0002';
  end if;

  if not (
    v_trip.user_id = v_user_id
    or exists (
      select 1
        from public.trip_members
       where trip_id = p_trip_id
         and user_id = v_user_id
         and status = 'active'
         and left_at is null
    )
  ) then
    raise exception 'trip_not_authorized' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_existing_id := null;
    v_transportation_id := null;
    v_item_id := nullif(v_item->>'item_id', '')::uuid;
    v_include := coalesce((v_item->>'include')::boolean, false);
    v_data := coalesce(v_item->'reviewed_data', '{}'::jsonb);

    if v_item_id is null then
      raise exception 'invalid_item_id' using errcode = '22023';
    end if;

    if not exists (
      select 1
        from public.travel_email_import_items
       where id = v_item_id
         and import_id = p_import_id
         and item_type = 'flight'
    ) then
      raise exception 'import_item_not_found' using errcode = 'P0002';
    end if;

    if not v_include then
      update public.travel_email_import_items
         set is_excluded = true,
             reviewed_data = v_data,
             matched_trip_id = p_trip_id
       where id = v_item_id;
      continue;
    end if;

    v_selected_count := v_selected_count + 1;
    v_flight_number := upper(regexp_replace(trim(coalesce(v_data->>'flight_number', '')), '[\s-]+', '', 'g'));
    v_airline_code := upper(regexp_replace(trim(coalesce(v_data->>'airline_code', '')), '[\s-]+', '', 'g'));
    if v_airline_code = '' and v_flight_number ~ '^[A-Z0-9]{2}[0-9]' then
      v_airline_code := substring(v_flight_number from 1 for 2);
    end if;
    v_airline_name := nullif(trim(coalesce(v_data->>'airline_name', '')), '');
    v_departure_location := nullif(trim(coalesce(v_data->>'departure_location', '')), '');
    v_arrival_location := nullif(trim(coalesce(v_data->>'arrival_location', '')), '');
    v_departure_date := nullif(trim(coalesce(v_data->>'departure_date', '')), '')::date;
    v_arrival_date := nullif(trim(coalesce(v_data->>'arrival_date', '')), '')::date;
    v_departure_time := nullif(trim(coalesce(v_data->>'departure_time', '')), '');
    v_arrival_time := nullif(trim(coalesce(v_data->>'arrival_time', '')), '');
    v_departure_timezone := nullif(trim(coalesce(v_data->>'departure_timezone', '')), '');
    v_arrival_timezone := nullif(trim(coalesce(v_data->>'arrival_timezone', '')), '');
    v_status := coalesce(nullif(trim(coalesce(v_data->>'status', '')), ''), 'planned');
    v_trip_leg_id := null;

    if v_status not in ('planned', 'booked', 'confirmed', 'cancelled', 'completed') then
      v_status := 'planned';
    end if;

    if v_flight_number = '' or v_departure_location is null or v_arrival_location is null or v_departure_date is null or v_departure_time is null then
      raise exception 'missing_required_flight_fields' using errcode = '22023';
    end if;

    select id
      into v_trip_leg_id
      from public.trip_legs
     where trip_id = p_trip_id
       and (start_date is null or start_date <= v_departure_date)
       and (end_date is null or end_date >= v_departure_date)
     order by sort_order asc
     limit 1;

    select id
      into v_existing_id
      from public.transportation_items
     where trip_id = p_trip_id
       and transport_type = 'flight'
       and upper(regexp_replace(coalesce(transport_number, ''), '[\s-]+', '', 'g')) = v_flight_number
       and upper(trim(coalesce(departure_location, ''))) = upper(trim(v_departure_location))
       and departure_date = v_departure_date
       and departure_time = v_departure_time
     limit 1;

    if v_existing_id is not null then
      update public.travel_email_import_items
         set reviewed_data = v_data,
             matched_trip_id = p_trip_id,
             imported_record_id = v_existing_id,
             imported_at = now(),
             is_excluded = false
       where id = v_item_id;

      v_created_ids := array_append(v_created_ids, v_existing_id);
      continue;
    end if;

    v_title := trim(concat(v_flight_number, ' ', coalesce(v_departure_location, ''), ' to ', coalesce(v_arrival_location, '')));
    v_notes := nullif(
      trim(
        concat_ws(
          E'\n\n',
          case
            when nullif(trim(coalesce(v_data->>'visa_requirements', '')), '') is not null
              then 'VISA requirements:' || E'\n' || trim(coalesce(v_data->>'visa_requirements', ''))
            else null
          end,
          case
            when nullif(trim(coalesce(v_data->>'luggage_requirements', '')), '') is not null
              then 'Luggage requirements:' || E'\n' || trim(coalesce(v_data->>'luggage_requirements', ''))
            else null
          end,
          nullif(trim(coalesce(v_data->>'notes', '')), '')
        )
      ),
      ''
    );

    insert into public.transportation_items (
      trip_id,
      created_by,
      title,
      transport_type,
      status,
      departure_date,
      arrival_date,
      departure_time,
      arrival_time,
      departure_location,
      arrival_location,
      departure_timezone,
      arrival_timezone,
      provider_name,
      provider_code,
      transport_number,
      reservation_code,
      seat_number,
      cabin_class,
      baggage_info,
      departure_terminal,
      arrival_terminal,
      cost,
      currency,
      notes,
      is_private,
      audience_mode,
      route_stops,
      trip_leg_id
    )
    values (
      p_trip_id,
      v_user_id,
      v_title,
      'flight',
      v_status,
      v_departure_date,
      v_arrival_date,
      v_departure_time,
      v_arrival_time,
      v_departure_location,
      v_arrival_location,
      v_departure_timezone,
      v_arrival_timezone,
      v_airline_name,
      nullif(v_airline_code, ''),
      v_flight_number,
      nullif(trim(coalesce(v_data->>'reservation_code', '')), ''),
      nullif(trim(coalesce(v_data->>'seat_number', '')), ''),
      nullif(trim(coalesce(v_data->>'cabin_class', '')), ''),
      nullif(trim(coalesce(v_data->>'luggage_requirements', '')), ''),
      nullif(trim(coalesce(v_data->>'departure_terminal', '')), ''),
      nullif(trim(coalesce(v_data->>'arrival_terminal', '')), ''),
      nullif(trim(coalesce(v_data->>'cost', '')), '')::numeric,
      coalesce(nullif(upper(trim(coalesce(v_data->>'currency', ''))), ''), 'CAD'),
      v_notes,
      coalesce(nullif(v_data->>'is_private', '')::boolean, false),
      'everyone',
      jsonb_build_array(
        jsonb_build_object('order', 0, 'label', v_departure_location),
        jsonb_build_object('order', 1, 'label', v_arrival_location)
      ),
      v_trip_leg_id
    )
    returning id into v_transportation_id;

    update public.travel_email_import_items
       set reviewed_data = v_data,
           matched_trip_id = p_trip_id,
           imported_record_id = v_transportation_id,
           imported_at = now(),
           is_excluded = false
     where id = v_item_id;

    v_created_ids := array_append(v_created_ids, v_transportation_id);
  end loop;

  if v_selected_count = 0 then
    raise exception 'no_flights_selected' using errcode = '22023';
  end if;

  update public.travel_email_imports
     set matched_trip_id = p_trip_id,
         status = 'imported',
         imported_at = now()
   where id = p_import_id;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    metadata
  )
  values (
    v_user_id,
    'travel_email_ready',
    'Flight added to your trip',
    case
      when array_length(v_created_ids, 1) = 1
        then coalesce(v_flight_number, 'A flight') || ' was added to ' || v_trip.title || '.'
      else array_length(v_created_ids, 1)::text || ' flights were added to ' || v_trip.title || '.'
    end,
    jsonb_build_object(
      'importId', p_import_id,
      'tripId', p_trip_id,
      'url', '/trips/' || coalesce(v_trip.slug, v_trip.id::text) || '?tab=journey',
      'source', 'travel_email_import_completion'
    )
  )
  on conflict do nothing;

  return jsonb_build_object(
    'status', 'imported',
    'tripId', p_trip_id,
    'tripSlug', v_trip.slug,
    'transportationItemIds', to_jsonb(v_created_ids)
  );
end;
$$;

grant execute on function public.import_travel_email_flights(uuid, uuid, jsonb)
to authenticated;
