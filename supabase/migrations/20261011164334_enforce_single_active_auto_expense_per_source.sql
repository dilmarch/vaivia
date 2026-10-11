-- A trip item owns at most one active auto-generated expense. Soft-deleted
-- expenses remain available for audit/history and do not block recreation.
create unique index if not exists trip_expenses_active_accommodation_unique
    on public.trip_expenses (accommodation_id)
    where source_type = 'accommodation'
      and accommodation_id is not null
      and deleted_at is null;

create unique index if not exists trip_expenses_active_transportation_unique
    on public.trip_expenses (transportation_item_id)
    where source_type = 'transportation'
      and transportation_item_id is not null
      and deleted_at is null;

create unique index if not exists trip_expenses_active_itinerary_event_unique
    on public.trip_expenses (itinerary_event_id)
    where source_type = 'itinerary_event'
      and itinerary_event_id is not null
      and deleted_at is null;
