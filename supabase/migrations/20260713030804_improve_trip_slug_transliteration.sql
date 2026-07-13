create extension if not exists unaccent with schema extensions;

create or replace function public.approximate_latin_slug_input(input_value text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  with expanded as (
    select
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(
                      replace(
                        replace(
                          replace(
                            replace(
                              coalesce(input_value, ''),
                              'ß',
                              'ss'
                            ),
                            'ẞ',
                            'SS'
                          ),
                          'æ',
                          'ae'
                        ),
                        'Æ',
                        'AE'
                      ),
                      'œ',
                      'oe'
                    ),
                    'Œ',
                    'OE'
                  ),
                  'þ',
                  'th'
                ),
                'Þ',
                'Th'
              ),
              'ĳ',
              'ij'
            ),
            'Ĳ',
            'IJ'
          ),
          'ĸ',
          'k'
        ),
        'ŉ',
        'n'
      ) as value
  )
  select extensions.unaccent(
    translate(
      value,
      'ıİđĐłŁøØðÐħĦŋŊ',
      'iIdDlLoOdDhHnN'
    )
  )
  from expanded;
$$;

create or replace function public.normalize_trip_slug(input_value text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select trim(both '-' from regexp_replace(
    regexp_replace(
      lower(public.approximate_latin_slug_input(coalesce(input_value, ''))),
      '[^a-z0-9]+',
      '-',
      'g'
    ),
    '-+',
    '-',
    'g'
  ));
$$;

create or replace function public.get_trip_slug_fallback_for_user(
  target_user_id uuid,
  excluded_trip_id uuid default null
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'trip-' || greatest(count(*)::integer + 1, 1)::text
  from public.trips
  where trips.user_id = target_user_id
    and (excluded_trip_id is null or trips.id <> excluded_trip_id);
$$;

create or replace function public.get_available_trip_slug(
  base_slug text,
  excluded_trip_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  normalized_base text;
  candidate text;
  suffix integer := 2;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required to generate a trip slug.';
  end if;

  normalized_base := public.normalize_trip_slug(base_slug);

  if normalized_base = '' then
    normalized_base := public.get_trip_slug_fallback_for_user(
      current_user_id,
      excluded_trip_id
    );
  end if;

  candidate := normalized_base;

  while public.trip_slug_conflicts_for_user(
    current_user_id,
    candidate,
    excluded_trip_id
  ) loop
    candidate := normalized_base || '-' || suffix::text;
    suffix := suffix + 1;
  end loop;

  return candidate;
end;
$$;

create or replace function public.get_available_trip_slug_for_user(
  target_user_id uuid,
  base_slug text,
  excluded_trip_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_base text;
  candidate text;
  suffix integer := 2;
begin
  if target_user_id is null then
    raise exception 'A user is required to generate a trip slug.';
  end if;

  normalized_base := public.normalize_trip_slug(base_slug);

  if normalized_base = '' then
    normalized_base := public.get_trip_slug_fallback_for_user(
      target_user_id,
      excluded_trip_id
    );
  end if;

  candidate := normalized_base;

  while public.trip_slug_conflicts_for_user(
    target_user_id,
    candidate,
    excluded_trip_id
  ) loop
    candidate := normalized_base || '-' || suffix::text;
    suffix := suffix + 1;
  end loop;

  return candidate;
end;
$$;

create or replace function public.set_and_validate_trip_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_slug text;
  member_conflict record;
begin
  normalized_slug := public.normalize_trip_slug(
    coalesce(nullif(new.slug, ''), new.title, '')
  );

  if normalized_slug = '' then
    normalized_slug := public.get_trip_slug_fallback_for_user(new.user_id, new.id);
  end if;

  new.slug := normalized_slug;

  if public.trip_slug_conflicts_for_user(new.user_id, new.slug, new.id) then
    raise exception 'Trip slug already exists for this user.'
      using errcode = '23505';
  end if;

  for member_conflict in
    select trip_members.user_id
    from public.trip_members
    where trip_members.trip_id = new.id
      and trip_members.status = 'active'
      and trip_members.user_id is not null
  loop
    if public.trip_slug_conflicts_for_user(
      member_conflict.user_id,
      new.slug,
      new.id
    ) then
      raise exception 'Trip slug already exists for a trip member.'
        using errcode = '23505';
    end if;
  end loop;

  return new;
end;
$$;
