import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service";
import type { EventSummary, EventTicketType } from "@/lib/events/types";

const PUBLIC_EVENT_FIELDS =
  "id,slug,title,short_summary,description,category,tags,cover_image_storage_path,cover_image_alt,status,visibility,registration_mode,starts_at,ends_at,timezone,venue_type,venue_name,address_line,city,region,country,postal_code,google_place_id,latitude,longitude,organizer_display_name,organizer_contact_email,accessibility_info,attendee_notes,age_restriction,refund_policy,overall_capacity,publish_at,published_at,owner_user_id,created_at";

async function attachCoverUrls<T extends EventSummary>(events: T[]) {
  const service = createServiceRoleClient();
  return Promise.all(
    events.map(async (event) => {
      if (!event.cover_image_storage_path)
        return { ...event, coverImageUrl: null };
      const { data } = await service.storage
        .from("event-covers")
        .createSignedUrl(event.cover_image_storage_path, 60 * 60);
      return { ...event, coverImageUrl: data?.signedUrl || null };
    }),
  );
}

export async function listPublicEvents(filters?: {
  query?: string;
  category?: string;
  city?: string;
  price?: "free" | "paid";
  from?: string;
  to?: string;
  page?: number;
}) {
  const service = createServiceRoleClient();
  const page = Math.max(1, filters?.page || 1);
  const pageSize = 12;
  let query = service
    .from("events")
    .select(PUBLIC_EVENT_FIELDS, { count: "exact" })
    .eq("status", "published")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .or(`publish_at.is.null,publish_at.lte.${new Date().toISOString()}`)
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (filters?.query) {
    const safe = filters.query
      .replace(/[%_,()]/g, " ")
      .trim()
      .slice(0, 80);
    if (safe)
      query = query.or(`title.ilike.%${safe}%,short_summary.ilike.%${safe}%`);
  }
  if (filters?.category) query = query.eq("category", filters.category);
  if (filters?.city) query = query.ilike("city", filters.city.slice(0, 80));
  if (filters?.from) query = query.gte("starts_at", filters.from);
  if (filters?.to) query = query.lte("starts_at", filters.to);

  const { data, error, count } = await query;
  if (error) throw new Error("Could not load events.");
  let events = (data || []) as unknown as EventSummary[];

  if (filters?.price) {
    const ids = events.map((event) => event.id);
    const { data: tiers } = ids.length
      ? await service
          .from("event_ticket_types")
          .select("event_id,price_minor")
          .in("event_id", ids)
          .eq("state", "active")
      : { data: [] };
    const hasPaid = new Set(
      (tiers || [])
        .filter((tier) => tier.price_minor > 0)
        .map((tier) => tier.event_id),
    );
    events = events.filter((event) =>
      filters.price === "paid" ? hasPaid.has(event.id) : !hasPaid.has(event.id),
    );
  }

  return {
    events: await attachCoverUrls(events),
    count: count || 0,
    page,
    pageSize,
  };
}

export async function getPublicEventBySlug(slug: string) {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("events")
    .select(PUBLIC_EVENT_FIELDS)
    .eq("slug", slug)
    .eq("status", "published")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .or(`publish_at.is.null,publish_at.lte.${new Date().toISOString()}`)
    .maybeSingle();
  if (error || !data) return null;
  const [event] = await attachCoverUrls([data as unknown as EventSummary]);
  const { data: tiers } = await service
    .from("event_ticket_types")
    .select("*")
    .eq("event_id", event.id)
    .in("state", ["active", "sold_out"])
    .order("display_order");
  return { event, ticketTypes: (tiers || []) as unknown as EventTicketType[] };
}

export async function getManagedEvent(eventId: string) {
  const service = createServiceRoleClient();
  const [{ data: event }, { data: privateDetails }, { data: ticketTypes }] =
    await Promise.all([
      service.from("events").select("*").eq("id", eventId).maybeSingle(),
      service
        .from("event_private_details")
        .select("*")
        .eq("event_id", eventId)
        .maybeSingle(),
      service
        .from("event_ticket_types")
        .select("*")
        .eq("event_id", eventId)
        .order("display_order"),
    ]);
  return { event, privateDetails, ticketTypes: ticketTypes || [] };
}
