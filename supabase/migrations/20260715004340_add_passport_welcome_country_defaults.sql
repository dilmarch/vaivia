insert into public.language_welcome_labels (
  language_code,
  language_name,
  welcome_label,
  updated_at
)
values
  ('ind', 'Indonesian', 'SELAMAT DATANG', now()),
  ('bul', 'Bulgarian', 'ДОБРЕ ДОШЛИ', now()),
  ('hrv', 'Croatian', 'DOBRODOŠLI', now()),
  ('hun', 'Hungarian', 'ÜDVÖZÖLJÜK', now())
on conflict (language_code) do update
set language_name = excluded.language_name,
    welcome_label = excluded.welcome_label,
    updated_at = excluded.updated_at;

with country_defaults(alpha2, welcome_label) as (
  values
    ('BE', 'WELKOM'),
    ('BG', 'ДОБРЕ ДОШЛИ'),
    ('CU', 'BIENVENIDO'),
    ('GT', 'BIENVENIDO'),
    ('HK', '歡迎'),
    ('HR', 'DOBRODOŠLI'),
    ('HU', 'ÜDVÖZÖLJÜK'),
    ('ID', 'SELAMAT DATANG'),
    ('PE', 'BIENVENIDO')
)
update public.countries c
set welcome_label = country_defaults.welcome_label,
    welcome_label_source = 'country_curated',
    updated_at = now()
from country_defaults
where c.alpha2 = country_defaults.alpha2
  and (
    c.welcome_label is null
    or btrim(c.welcome_label) = ''
    or upper(btrim(c.welcome_label)) = 'WELCOME'
  );

with country_defaults(alpha2, welcome_label) as (
  values
    ('BE', 'WELKOM'),
    ('BG', 'ДОБРЕ ДОШЛИ'),
    ('CU', 'BIENVENIDO'),
    ('GT', 'BIENVENIDO'),
    ('HK', '歡迎'),
    ('HR', 'DOBRODOŠLI'),
    ('HU', 'ÜDVÖZÖLJÜK'),
    ('ID', 'SELAMAT DATANG'),
    ('PE', 'BIENVENIDO')
)
update public.user_passport_stamps ups
set welcome_label_snapshot = country_defaults.welcome_label,
    updated_at = now()
from country_defaults
where ups.country_code = country_defaults.alpha2
  and (
    ups.welcome_label_snapshot is null
    or btrim(ups.welcome_label_snapshot) = ''
    or upper(btrim(ups.welcome_label_snapshot)) = 'WELCOME'
  );
