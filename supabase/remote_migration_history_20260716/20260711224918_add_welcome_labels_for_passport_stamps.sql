create table if not exists public.language_welcome_labels (
  language_code text primary key,
  language_name text,
  welcome_label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.language_welcome_labels enable row level security;

drop policy if exists "Language welcome labels are readable" on public.language_welcome_labels;

create policy "Language welcome labels are readable"
on public.language_welcome_labels
for select
to anon, authenticated
using (true);

grant select on public.language_welcome_labels to anon, authenticated;

alter table public.countries
  add column if not exists welcome_label text,
  add column if not exists welcome_label_source text;

alter table public.user_passport_stamps
  add column if not exists welcome_label_snapshot text;

insert into public.language_welcome_labels (
  language_code,
  language_name,
  welcome_label,
  updated_at
)
values
  ('eng', 'English', 'WELCOME', now()),
  ('fra', 'French', 'BIENVENUE', now()),
  ('spa', 'Spanish', 'BIENVENIDO', now()),
  ('ita', 'Italian', 'BENVENUTO', now()),
  ('por', 'Portuguese', 'BEM-VINDO', now()),
  ('deu', 'German', 'WILLKOMMEN', now()),
  ('nld', 'Dutch', 'WELKOM', now()),
  ('jpn', 'Japanese', 'ようこそ', now()),
  ('kor', 'Korean', '환영합니다', now()),
  ('zho', 'Chinese', '欢迎', now()),
  ('ara', 'Arabic', 'أهلاً وسهلاً', now()),
  ('ell', 'Greek', 'ΚΑΛΩΣ ΗΡΘΑΤΕ', now()),
  ('tur', 'Turkish', 'HOŞ GELDİNİZ', now()),
  ('tha', 'Thai', 'ยินดีต้อนรับ', now()),
  ('vie', 'Vietnamese', 'CHÀO MỪNG', now())
on conflict (language_code) do update
set language_name = excluded.language_name,
    welcome_label = excluded.welcome_label,
    updated_at = excluded.updated_at;

update public.countries c
set welcome_label = lwl.welcome_label,
    welcome_label_source = 'language_curated',
    updated_at = now()
from public.language_welcome_labels lwl
where c.primary_language_code = lwl.language_code
  and (c.welcome_label is null or btrim(c.welcome_label) = '');

update public.countries
set welcome_label = 'WELCOME',
    welcome_label_source = 'english_fallback',
    updated_at = now()
where welcome_label is null or btrim(welcome_label) = '';

update public.user_passport_stamps ups
set welcome_label_snapshot = c.welcome_label,
    updated_at = now()
from public.countries c
where ups.country_code = c.alpha2
  and (ups.welcome_label_snapshot is null or btrim(ups.welcome_label_snapshot) = '')
  and c.welcome_label is not null
  and btrim(c.welcome_label) <> '';

update public.user_passport_stamps
set welcome_label_snapshot = 'WELCOME',
    updated_at = now()
where welcome_label_snapshot is null or btrim(welcome_label_snapshot) = '';;
