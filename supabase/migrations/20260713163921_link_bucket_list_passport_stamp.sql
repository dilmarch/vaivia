alter table public.user_travel_bucket_list
add column if not exists passport_stamp_id uuid
  references public.user_passport_stamps(id) on delete set null;

create index if not exists user_travel_bucket_list_passport_stamp_idx
on public.user_travel_bucket_list(passport_stamp_id)
where passport_stamp_id is not null;

with matching_stamps as (
  select
    bucket.id as bucket_list_item_id,
    stamp.id as passport_stamp_id,
    count(*) over (partition by bucket.id) as match_count,
    row_number() over (
      partition by bucket.id
      order by stamp.created_at desc, stamp.id
    ) as match_rank
  from public.user_travel_bucket_list bucket
  join public.user_passport_stamps stamp
    on stamp.user_id = bucket.user_id
   and stamp.country_code = bucket.country_code
   and stamp.first_visited_on = bucket.completed_at::date
   and coalesce(stamp.visit_city, '') = coalesce(bucket.city, '')
   and coalesce(stamp.visit_region, '') = coalesce(bucket.region, '')
  where bucket.status = 'completed'
    and bucket.completed_at is not null
    and bucket.passport_stamp_id is null
)
update public.user_travel_bucket_list bucket
set passport_stamp_id = matching_stamps.passport_stamp_id,
    updated_at = now()
from matching_stamps
where bucket.id = matching_stamps.bucket_list_item_id
  and matching_stamps.match_count = 1
  and matching_stamps.match_rank = 1;

update public.countries
set welcome_label = '歡迎',
    welcome_label_source = 'country_curated',
    primary_language_code = coalesce(nullif(primary_language_code, ''), 'zho'),
    primary_language_name = coalesce(nullif(primary_language_name, ''), 'Mandarin Chinese'),
    updated_at = now()
where alpha2 = 'TW'
  and (welcome_label is null or welcome_label <> '歡迎');

insert into public.countries (
  alpha2,
  alpha3,
  common_name,
  official_name,
  flag_emoji,
  flag_svg_url,
  flag_png_url,
  region,
  subregion,
  currencies,
  rest_countries_payload,
  source,
  primary_language_code,
  primary_language_name,
  languages,
  welcome_label,
  welcome_label_source
)
values (
  'TW',
  'TWN',
  'Taiwan',
  'Taiwan',
  '🇹🇼',
  'https://flagcdn.com/tw.svg',
  'https://flagcdn.com/w320/tw.png',
  'Asia',
  'Eastern Asia',
  '{"TWD":{"name":"New Taiwan dollar","symbol":"NT$"}}'::jsonb,
  '{}'::jsonb,
  'curated',
  'zho',
  'Mandarin Chinese',
  '{"zho":"Mandarin Chinese"}'::jsonb,
  '歡迎',
  'country_curated'
)
on conflict (alpha2) do update
set alpha3 = excluded.alpha3,
    common_name = excluded.common_name,
    official_name = excluded.official_name,
    flag_emoji = excluded.flag_emoji,
    flag_svg_url = coalesce(public.countries.flag_svg_url, excluded.flag_svg_url),
    flag_png_url = coalesce(public.countries.flag_png_url, excluded.flag_png_url),
    region = coalesce(public.countries.region, excluded.region),
    subregion = coalesce(public.countries.subregion, excluded.subregion),
    currencies = case
      when public.countries.currencies = '{}'::jsonb then excluded.currencies
      else public.countries.currencies
    end,
    primary_language_code = excluded.primary_language_code,
    primary_language_name = excluded.primary_language_name,
    languages = excluded.languages,
    welcome_label = excluded.welcome_label,
    welcome_label_source = excluded.welcome_label_source,
    updated_at = now();
