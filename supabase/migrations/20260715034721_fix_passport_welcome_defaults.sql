insert into public.language_welcome_labels (
  language_code,
  language_name,
  welcome_label,
  updated_at
)
values
  ('bul', 'Bulgarian', 'ДОБРЕ ДОШЛИ', now()),
  ('deu', 'German', 'WILLKOMMEN', now()),
  ('gle', 'Irish', 'FÁILTE', now()),
  ('heb', 'Hebrew', 'ברוכים הבאים', now()),
  ('hrv', 'Croatian', 'DOBRODOŠLI', now()),
  ('hun', 'Hungarian', 'ÜDVÖZÖLJÜK', now()),
  ('ind', 'Indonesian', 'SELAMAT DATANG', now()),
  ('mon', 'Mongolian', 'ТАВТАЙ МОРИЛНО УУ', now()),
  ('msa', 'Malay', 'SELAMAT DATANG', now()),
  ('spa', 'Spanish', 'BIENVENIDO', now()),
  ('zho', 'Chinese', '歡迎', now())
on conflict (language_code) do update
set language_name = excluded.language_name,
    welcome_label = excluded.welcome_label,
    updated_at = excluded.updated_at;

with country_defaults(
  alpha2,
  alpha3,
  common_name,
  flag_emoji,
  primary_language_code,
  primary_language_name,
  welcome_label
) as (
  values
    ('AT', 'AUT', 'Austria', '🇦🇹', 'deu', 'German', 'WILLKOMMEN'),
    ('BE', 'BEL', 'Belgium', '🇧🇪', 'nld', 'Dutch', 'WELKOM'),
    ('BG', 'BGR', 'Bulgaria', '🇧🇬', 'bul', 'Bulgarian', 'ДОБРЕ ДОШЛИ'),
    ('CU', 'CUB', 'Cuba', '🇨🇺', 'spa', 'Spanish', 'BIENVENIDO'),
    ('DE', 'DEU', 'Germany', '🇩🇪', 'deu', 'German', 'WILLKOMMEN'),
    ('DO', 'DOM', 'Dominican Republic', '🇩🇴', 'spa', 'Spanish', 'BIENVENIDO'),
    ('FR', 'FRA', 'France', '🇫🇷', 'fra', 'French', 'BIENVENUE'),
    ('GT', 'GTM', 'Guatemala', '🇬🇹', 'spa', 'Spanish', 'BIENVENIDO'),
    ('HK', 'HKG', 'Hong Kong', '🇭🇰', 'zho', 'Chinese', '歡迎'),
    ('HR', 'HRV', 'Croatia', '🇭🇷', 'hrv', 'Croatian', 'DOBRODOŠLI'),
    ('HU', 'HUN', 'Hungary', '🇭🇺', 'hun', 'Hungarian', 'ÜDVÖZÖLJÜK'),
    ('ID', 'IDN', 'Indonesia', '🇮🇩', 'ind', 'Indonesian', 'SELAMAT DATANG'),
    ('IE', 'IRL', 'Ireland', '🇮🇪', 'gle', 'Irish', 'FÁILTE'),
    ('IL', 'ISR', 'Israel', '🇮🇱', 'heb', 'Hebrew', 'ברוכים הבאים'),
    ('MN', 'MNG', 'Mongolia', '🇲🇳', 'mon', 'Mongolian', 'ТАВТАЙ МОРИЛНО УУ'),
    ('MY', 'MYS', 'Malaysia', '🇲🇾', 'msa', 'Malay', 'SELAMAT DATANG'),
    ('PE', 'PER', 'Peru', '🇵🇪', 'spa', 'Spanish', 'BIENVENIDO')
)
insert into public.countries (
  alpha2,
  alpha3,
  common_name,
  flag_emoji,
  primary_language_code,
  primary_language_name,
  welcome_label,
  welcome_label_source,
  source,
  updated_at
)
select
  alpha2,
  alpha3,
  common_name,
  flag_emoji,
  primary_language_code,
  primary_language_name,
  welcome_label,
  'country_curated',
  'vaivia_curated',
  now()
from country_defaults
on conflict (alpha2) do update
set alpha3 = coalesce(public.countries.alpha3, excluded.alpha3),
    common_name = coalesce(nullif(public.countries.common_name, ''), excluded.common_name),
    flag_emoji = coalesce(public.countries.flag_emoji, excluded.flag_emoji),
    primary_language_code = excluded.primary_language_code,
    primary_language_name = excluded.primary_language_name,
    welcome_label = excluded.welcome_label,
    welcome_label_source = excluded.welcome_label_source,
    updated_at = now();

with country_defaults(alpha2, language_code, language_name, welcome_label) as (
  values
    ('AT', 'deu', 'German', 'WILLKOMMEN'),
    ('BE', 'nld', 'Dutch', 'WELKOM'),
    ('BG', 'bul', 'Bulgarian', 'ДОБРЕ ДОШЛИ'),
    ('CU', 'spa', 'Spanish', 'BIENVENIDO'),
    ('DE', 'deu', 'German', 'WILLKOMMEN'),
    ('DO', 'spa', 'Spanish', 'BIENVENIDO'),
    ('FR', 'fra', 'French', 'BIENVENUE'),
    ('GT', 'spa', 'Spanish', 'BIENVENIDO'),
    ('HK', 'zho', 'Chinese', '歡迎'),
    ('HR', 'hrv', 'Croatian', 'DOBRODOŠLI'),
    ('HU', 'hun', 'Hungarian', 'ÜDVÖZÖLJÜK'),
    ('ID', 'ind', 'Indonesian', 'SELAMAT DATANG'),
    ('IE', 'gle', 'Irish', 'FÁILTE'),
    ('IL', 'heb', 'Hebrew', 'ברוכים הבאים'),
    ('MN', 'mon', 'Mongolian', 'ТАВТАЙ МОРИЛНО УУ'),
    ('MY', 'msa', 'Malay', 'SELAMAT DATANG'),
    ('PE', 'spa', 'Spanish', 'BIENVENIDO')
)
update public.user_passport_stamps ups
set welcome_label_snapshot = country_defaults.welcome_label,
    stamp_language_code = coalesce(ups.stamp_language_code, country_defaults.language_code),
    stamp_language_name = coalesce(ups.stamp_language_name, country_defaults.language_name),
    updated_at = now()
from country_defaults
where upper(ups.country_code) = country_defaults.alpha2
  and (
    ups.welcome_label_snapshot is null
    or btrim(ups.welcome_label_snapshot) = ''
    or upper(btrim(ups.welcome_label_snapshot)) = 'WELCOME'
  );
