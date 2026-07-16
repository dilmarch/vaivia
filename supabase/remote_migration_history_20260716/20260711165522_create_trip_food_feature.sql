
create table public.trip_food_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  item_type text not null check (item_type in ('place','food')),
  name text not null check (length(btrim(name)) > 0),
  description text,
  region text,
  personal_note text,
  google_place_id text,
  formatted_address text,
  location_lat double precision,
  location_lng double precision,
  primary_place_type text,
  place_types text[] not null default '{}',
  business_status text,
  regular_opening_hours jsonb,
  website_url text,
  phone_number text,
  google_maps_url text,
  facebook_url text,
  instagram_url text,
  meal_categories text[] not null default array['any']::text[],
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_food_items_place_required check (
    item_type <> 'place' or (
      google_place_id is not null and length(btrim(google_place_id)) > 0
      and formatted_address is not null and length(btrim(formatted_address)) > 0
    )
  ),
  constraint trip_food_items_coordinates_check check (
    (location_lat is null or location_lat between -90 and 90)
    and (location_lng is null or location_lng between -180 and 180)
  ),
  constraint trip_food_items_meals_allowed check (
    meal_categories <@ array['any','breakfast','brunch','lunch','dinner','snack','dessert','coffee','drinks','late_night','grocery_store']::text[]
    and cardinality(meal_categories) > 0
    and not ('any' = any(meal_categories) and cardinality(meal_categories) > 1)
  ),
  constraint trip_food_items_urls_check check (
    (website_url is null or website_url ~* '^https?://')
    and (google_maps_url is null or google_maps_url ~* '^https?://')
    and (facebook_url is null or facebook_url ~* '^https?://')
    and (instagram_url is null or instagram_url ~* '^https?://')
  ),
  constraint trip_food_items_trip_id_id_unique unique (trip_id,id)
);

create index trip_food_items_trip_type_idx on public.trip_food_items(trip_id,item_type);
create index trip_food_items_created_by_idx on public.trip_food_items(created_by);
create index trip_food_items_google_place_idx on public.trip_food_items(trip_id,google_place_id)
  where google_place_id is not null;

create trigger set_trip_food_items_updated_at
before update on public.trip_food_items
for each row execute function public.set_updated_at();

create table public.trip_food_reactions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  food_item_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('heart','thumbs_up','thumbs_down')),
  score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_food_reactions_one_per_user unique(food_item_id,user_id),
  constraint trip_food_reactions_item_match foreign key(trip_id,food_item_id)
    references public.trip_food_items(trip_id,id) on delete cascade
);

create index trip_food_reactions_trip_idx on public.trip_food_reactions(trip_id);
create trigger set_trip_food_reactions_updated_at
before update on public.trip_food_reactions
for each row execute function public.set_updated_at();

create table public.trip_food_tried (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  food_item_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tried_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint trip_food_tried_one_per_user unique(food_item_id,user_id),
  constraint trip_food_tried_item_match foreign key(trip_id,food_item_id)
    references public.trip_food_items(trip_id,id) on delete cascade
);

create index trip_food_tried_trip_idx on public.trip_food_tried(trip_id);

alter table public.trip_food_items enable row level security;
alter table public.trip_food_reactions enable row level security;
alter table public.trip_food_tried enable row level security;

create policy "Trip members can view food items"
on public.trip_food_items for select to authenticated
using (public.is_trip_active_member(trip_id));

create policy "Trip members can add food items"
on public.trip_food_items for insert to authenticated
with check (public.is_trip_active_member(trip_id) and created_by = (select auth.uid()));

create policy "Creators and trip owners can update food items"
on public.trip_food_items for update to authenticated
using (
  public.is_trip_active_member(trip_id)
  and (created_by = (select auth.uid()) or exists (
    select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())
  ))
)
with check (
  public.is_trip_active_member(trip_id)
  and (created_by = (select auth.uid()) or exists (
    select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())
  ))
);

create policy "Creators and trip owners can delete food items"
on public.trip_food_items for delete to authenticated
using (
  public.is_trip_active_member(trip_id)
  and (created_by = (select auth.uid()) or exists (
    select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())
  ))
);

create policy "Trip members can view food reactions"
on public.trip_food_reactions for select to authenticated
using (public.is_trip_active_member(trip_id));

create policy "Users can add their own food reactions"
on public.trip_food_reactions for insert to authenticated
with check (
  user_id = (select auth.uid()) and public.is_trip_active_member(trip_id)
  and exists (select 1 from public.trip_food_items f where f.id=food_item_id and f.trip_id=trip_id)
);

create policy "Users can update their own food reactions"
on public.trip_food_reactions for update to authenticated
using (user_id = (select auth.uid()) and public.is_trip_active_member(trip_id))
with check (
  user_id = (select auth.uid()) and public.is_trip_active_member(trip_id)
  and exists (select 1 from public.trip_food_items f where f.id=food_item_id and f.trip_id=trip_id)
);

create policy "Users can delete their own food reactions"
on public.trip_food_reactions for delete to authenticated
using (user_id = (select auth.uid()) and public.is_trip_active_member(trip_id));

create policy "Trip members can view tried statuses"
on public.trip_food_tried for select to authenticated
using (public.is_trip_active_member(trip_id));

create policy "Users can mark their own food tried"
on public.trip_food_tried for insert to authenticated
with check (
  user_id = (select auth.uid()) and public.is_trip_active_member(trip_id)
  and exists (select 1 from public.trip_food_items f where f.id=food_item_id and f.trip_id=trip_id)
);

create policy "Users can remove their own tried status"
on public.trip_food_tried for delete to authenticated
using (user_id = (select auth.uid()) and public.is_trip_active_member(trip_id));

grant select,insert,update,delete on public.trip_food_items to authenticated;
grant select,insert,update,delete on public.trip_food_reactions to authenticated;
grant select,insert,delete on public.trip_food_tried to authenticated;
;
