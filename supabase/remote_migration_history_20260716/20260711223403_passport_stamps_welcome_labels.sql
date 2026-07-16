-- Add cached localized "Welcome" labels for passport stamp rendering.

alter table public.countries
  add column if not exists welcome_label text,
  add column if not exists welcome_label_source text not null default 'fallback';

alter table public.user_passport_stamps
  add column if not exists welcome_label_snapshot text;

create table if not exists public.language_welcome_labels (
  language_code text primary key,
  language_name text,
  welcome_label text not null,
  source text not null default 'curated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint language_welcome_labels_language_code_check check (language_code ~ '^[a-z]{3}$'),
  constraint language_welcome_labels_welcome_label_check check (length(btrim(welcome_label)) > 0)
);

alter table public.language_welcome_labels enable row level security;

drop policy if exists "Authenticated users can view welcome labels" on public.language_welcome_labels;
create policy "Authenticated users can view welcome labels"
  on public.language_welcome_labels
  for select
  to authenticated
  using (true);

grant select on public.language_welcome_labels to authenticated;

insert into public.language_welcome_labels (language_code, language_name, welcome_label, source)
values
  ('eng', 'English', 'WELCOME', 'curated'),
  ('fra', 'French', 'BIENVENUE', 'curated'),
  ('spa', 'Spanish', 'BIENVENIDO', 'curated'),
  ('ita', 'Italian', 'BENVENUTO', 'curated'),
  ('por', 'Portuguese', 'BEM-VINDO', 'curated'),
  ('deu', 'German', 'WILLKOMMEN', 'curated'),
  ('nld', 'Dutch', 'WELKOM', 'curated'),
  ('jpn', 'Japanese', 'ようこそ', 'curated'),
  ('kor', 'Korean', '환영합니다', 'curated'),
  ('zho', 'Chinese', '欢迎', 'curated'),
  ('ara', 'Arabic', 'أهلاً وسهلاً', 'curated'),
  ('ell', 'Greek', 'ΚΑΛΩΣ ΗΡΘΑΤΕ', 'curated'),
  ('tur', 'Turkish', 'HOŞ GELDİNİZ', 'curated'),
  ('tha', 'Thai', 'ยินดีต้อนรับ', 'curated'),
  ('vie', 'Vietnamese', 'CHÀO MỪNG', 'curated'),
  ('ind', 'Indonesian', 'SELAMAT DATANG', 'curated'),
  ('msa', 'Malay', 'SELAMAT DATANG', 'curated'),
  ('hin', 'Hindi', 'स्वागत है', 'curated'),
  ('ben', 'Bengali', 'স্বাগতম', 'curated'),
  ('rus', 'Russian', 'ДОБРО ПОЖАЛОВАТЬ', 'curated'),
  ('ukr', 'Ukrainian', 'ЛАСКАВО ПРОСИМО', 'curated'),
  ('pol', 'Polish', 'WITAMY', 'curated'),
  ('ces', 'Czech', 'VÍTEJTE', 'curated'),
  ('slk', 'Slovak', 'VITAJTE', 'curated'),
  ('hun', 'Hungarian', 'ÜDVÖZÖLJÜK', 'curated'),
  ('ron', 'Romanian', 'BUN VENIT', 'curated'),
  ('bul', 'Bulgarian', 'ДОБРЕ ДОШЛИ', 'curated'),
  ('hrv', 'Croatian', 'DOBRODOŠLI', 'curated'),
  ('srp', 'Serbian', 'ДОБРОДОШЛИ', 'curated'),
  ('swe', 'Swedish', 'VÄLKOMMEN', 'curated'),
  ('nor', 'Norwegian', 'VELKOMMEN', 'curated'),
  ('dan', 'Danish', 'VELKOMMEN', 'curated'),
  ('fin', 'Finnish', 'TERVETULOA', 'curated'),
  ('est', 'Estonian', 'TERE TULEMAST', 'curated'),
  ('lav', 'Latvian', 'LAIPNI LŪDZAM', 'curated'),
  ('lit', 'Lithuanian', 'SVEIKI ATVYKĘ', 'curated'),
  ('heb', 'Hebrew', 'ברוכים הבאים', 'curated'),
  ('isl', 'Icelandic', 'VELKOMIN', 'curated'),
  ('gle', 'Irish', 'FÁILTE', 'curated'),
  ('cym', 'Welsh', 'CROESO', 'curated'),
  ('cat', 'Catalan', 'BENVINGUTS', 'curated'),
  ('eus', 'Basque', 'ONGI ETORRI', 'curated'),
  ('glg', 'Galician', 'BENVIDOS', 'curated'),
  ('sqi', 'Albanian', 'MIRË SE VINI', 'curated'),
  ('mkd', 'Macedonian', 'ДОБРЕДОЈДОВТЕ', 'curated'),
  ('slv', 'Slovenian', 'DOBRODOŠLI', 'curated'),
  ('bos', 'Bosnian', 'DOBRODOŠLI', 'curated'),
  ('mon', 'Mongolian', 'ТАВТАЙ МОРИЛНО УУ', 'curated'),
  ('kaz', 'Kazakh', 'ҚОШ КЕЛДІҢІЗ', 'curated'),
  ('uzb', 'Uzbek', 'XUSH KELIBSIZ', 'curated'),
  ('aze', 'Azerbaijani', 'XOŞ GƏLMİSİNİZ', 'curated'),
  ('kat', 'Georgian', 'კეთილი იყოს თქვენი მობრძანება', 'curated'),
  ('hye', 'Armenian', 'ԲԱՐԻ ԳԱԼՈՒՍՏ', 'curated'),
  ('fas', 'Persian', 'خوش آمدید', 'curated'),
  ('urd', 'Urdu', 'خوش آمدید', 'curated'),
  ('tam', 'Tamil', 'வரவேற்கிறோம்', 'curated'),
  ('tel', 'Telugu', 'స్వాగతం', 'curated'),
  ('kan', 'Kannada', 'ಸ್ವಾಗತ', 'curated'),
  ('mal', 'Malayalam', 'സ്വാഗതം', 'curated'),
  ('sin', 'Sinhala', 'ආයුබෝවන්', 'curated'),
  ('nep', 'Nepali', 'स्वागत छ', 'curated'),
  ('khm', 'Khmer', 'សូមស្វាគមន៍', 'curated'),
  ('lao', 'Lao', 'ຍິນດີຕ້ອນຮັບ', 'curated'),
  ('mya', 'Burmese', 'ကြိုဆိုပါတယ်', 'curated'),
  ('fil', 'Filipino', 'MALIGAYANG PAGDATING', 'curated'),
  ('swa', 'Swahili', 'KARIBU', 'curated'),
  ('amh', 'Amharic', 'እንኳን ደህና መጡ', 'curated'),
  ('som', 'Somali', 'SOO DHAWOW', 'curated'),
  ('afr', 'Afrikaans', 'WELKOM', 'curated'),
  ('zul', 'Zulu', 'SIYAKWAMUKELA', 'curated'),
  ('xho', 'Xhosa', 'WAMKELEKILE', 'curated'),
  ('yor', 'Yoruba', 'KAABO', 'curated'),
  ('ibo', 'Igbo', 'NNOO', 'curated'),
  ('hau', 'Hausa', 'BARKA DA ZUWA', 'curated'),
  ('mlg', 'Malagasy', 'TONGASOA', 'curated'),
  ('kin', 'Kinyarwanda', 'MURAKAZA NEZA', 'curated'),
  ('run', 'Kirundi', 'MURAKAZA NEZA', 'curated')
on conflict (language_code) do update
set language_name = excluded.language_name,
    welcome_label = excluded.welcome_label,
    source = excluded.source,
    updated_at = now();

-- Populate country-level cached labels from the primary language where possible.
update public.countries c
set welcome_label = lwl.welcome_label,
    welcome_label_source = 'language_curated',
    updated_at = now()
from public.language_welcome_labels lwl
where c.primary_language_code = lwl.language_code
  and (c.welcome_label is null or btrim(c.welcome_label) = '');

-- Preserve existing country-specific arrival labels as a fallback if no welcome mapping exists yet.
update public.countries
set welcome_label = arrival_label,
    welcome_label_source = coalesce(nullif(arrival_label_source, ''), 'arrival_label_fallback'),
    updated_at = now()
where (welcome_label is null or btrim(welcome_label) = '')
  and arrival_label is not null
  and btrim(arrival_label) <> '';

-- Final safe fallback.
update public.countries
set welcome_label = 'WELCOME',
    welcome_label_source = 'english_fallback',
    updated_at = now()
where welcome_label is null or btrim(welcome_label) = '';

-- Backfill existing stamps with a snapshot so old stamps render consistently.
update public.user_passport_stamps ups
set welcome_label_snapshot = c.welcome_label,
    updated_at = now()
from public.countries c
where ups.country_code = c.alpha2
  and (ups.welcome_label_snapshot is null or btrim(ups.welcome_label_snapshot) = '');

create index if not exists countries_primary_language_code_idx
  on public.countries(primary_language_code);

create index if not exists countries_welcome_label_source_idx
  on public.countries(welcome_label_source);
;
