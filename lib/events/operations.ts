import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hashEventSecret } from "@/lib/events/tickets";
import type {
  EventCheckInResult,
  EventOperationsAttendee,
  EventOperationsDetail,
  EventOperationsListItem,
  EventOperationsRole,
} from "@/lib/events/operationsContracts";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Database } from "@/src/types/supabase";

type EventClient = SupabaseClient<Database>;

export class EventOperationsError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "EventOperationsError";
  }
}

async function requireOperationsRole(
  supabase: EventClient,
  userId: string,
): Promise<EventOperationsRole> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data?.role !== "event_organizer" && data?.role !== "super_admin") {
    throw new EventOperationsError(
      "Event operations are unavailable for this account.",
      "forbidden",
      403,
    );
  }
  return data.role;
}

export async function requireEventOperationsAccess(
  supabase: EventClient,
  userId: string,
  eventId: string,
) {
  await requireOperationsRole(supabase, userId);
  const { data, error } = await supabase.rpc("event_user_can_manage", {
    target_event_id: eventId,
  });
  if (error) throw error;
  if (!data) {
    throw new EventOperationsError(
      "The event was not found or you cannot manage it.",
      "forbidden",
      403,
    );
  }
}

function listItem(event: {
  id: string;
  slug: string;
  title: string;
  status: string;
  visibility: string;
  starts_at: string;
  timezone: string;
  registration_mode: string;
}): EventOperationsListItem {
  return event;
}

export async function listManagedEvents(
  supabase: EventClient,
  userId: string,
) {
  const role = await requireOperationsRole(supabase, userId);
  const service = createServiceRoleClient();
  let query = service
    .from("events")
    .select(
      "id,slug,title,status,visibility,starts_at,timezone,registration_mode",
    )
    .order("starts_at", { ascending: false });

  if (role !== "super_admin") {
    const { data: assignments, error } = await supabase
      .from("event_team_members")
      .select("event_id")
      .eq("user_id", userId);
    if (error) throw error;
    const assignedIds = (assignments || []).map((item) => item.event_id);
    query = assignedIds.length
      ? query.or(
          `owner_user_id.eq.${userId},id.in.(${assignedIds.join(",")})`,
        )
      : query.eq("owner_user_id", userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return {
    role,
    events: (data || []).map(listItem),
  };
}

export async function loadManagedEvent(
  supabase: EventClient,
  userId: string,
  eventId: string,
): Promise<EventOperationsDetail> {
  await requireEventOperationsAccess(supabase, userId, eventId);
  const service = createServiceRoleClient();
  const [
    { data: event, error: eventError },
    { data: tickets, error: ticketError },
    { data: rsvps, error: rsvpError },
    { count: completedOrders, error: orderError },
  ] = await Promise.all([
    service
      .from("events")
      .select(
        "id,slug,title,status,visibility,starts_at,timezone,registration_mode",
      )
      .eq("id", eventId)
      .is("deleted_at", null)
      .maybeSingle(),
    service
      .from("event_tickets")
      .select(
        "id,ticket_number,attendee_name,attendee_email,status,issued_at,checked_in_at,event_ticket_types(name)",
      )
      .eq("event_id", eventId)
      .order("issued_at", { ascending: false }),
    service
      .from("event_rsvps")
      .select("id,attendee_name,attendee_email,status,created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
    service
      .from("event_orders")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .in("status", ["paid", "free"]),
  ]);
  if (eventError || ticketError || rsvpError || orderError) {
    throw eventError || ticketError || rsvpError || orderError;
  }
  if (!event) {
    throw new EventOperationsError("Event not found.", "not_found", 404);
  }

  const attendees: EventOperationsAttendee[] = [
    ...(tickets || []).map((ticket) => {
      const tier = Array.isArray(ticket.event_ticket_types)
        ? ticket.event_ticket_types[0]
        : ticket.event_ticket_types;
      return {
        id: ticket.id,
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        name: ticket.attendee_name,
        email: ticket.attendee_email,
        tier: tier?.name || "Ticket",
        status: ticket.status,
        registeredAt: ticket.issued_at,
        checkedInAt: ticket.checked_in_at,
      };
    }),
    ...(rsvps || []).map((rsvp) => ({
      id: rsvp.id,
      ticketId: null,
      ticketNumber: null,
      name: rsvp.attendee_name || "RSVP guest",
      email: rsvp.attendee_email || "",
      tier: "RSVP",
      status: rsvp.status,
      registeredAt: rsvp.created_at,
      checkedInAt: null,
    })),
  ];

  return {
    event: listItem(event),
    stats: {
      tickets: tickets?.length || 0,
      confirmedRsvps:
        rsvps?.filter((rsvp) => rsvp.status === "confirmed").length || 0,
      completedOrders: completedOrders || 0,
    },
    attendees,
  };
}

function parseCheckInResult(value: unknown): EventCheckInResult {
  if (!value || typeof value !== "object" || !("result" in value)) {
    return { result: "error" };
  }
  const result = String(value.result);
  const allowed = new Set<EventCheckInResult["result"]>([
    "checked_in",
    "already_used",
    "refunded",
    "cancelled",
    "void",
    "wrong_event",
    "invalid",
    "camera_unsupported",
    "camera_denied",
    "error",
  ]);
  if (!allowed.has(result as EventCheckInResult["result"])) {
    return { result: "error" };
  }
  const row = value as Record<string, unknown>;
  return {
    result: result as EventCheckInResult["result"],
    ...(typeof row.ticket_id === "string" ? { ticket_id: row.ticket_id } : {}),
    ...(typeof row.check_in_id === "string"
      ? { check_in_id: row.check_in_id }
      : {}),
    ...(typeof row.checked_in_at === "string"
      ? { checked_in_at: row.checked_in_at }
      : {}),
  };
}

export async function checkInEventTicket(
  supabase: EventClient,
  userId: string,
  eventId: string,
  rawValue: string,
) {
  await requireEventOperationsAccess(supabase, userId, eventId);
  const value = rawValue.trim();
  if (!value || value.length > 1024) {
    throw new EventOperationsError(
      "Enter a valid ticket number or QR value.",
      "validation_error",
      422,
    );
  }

  let redemptionHash = "";
  if (value.startsWith("vaivia:event-ticket:")) {
    redemptionHash = hashEventSecret(
      value.slice("vaivia:event-ticket:".length),
    );
  } else {
    const { data: ticket, error } = await createServiceRoleClient()
      .from("event_tickets")
      .select("redemption_hash")
      .eq("event_id", eventId)
      .ilike("ticket_number", value)
      .maybeSingle();
    if (error) throw error;
    redemptionHash = ticket?.redemption_hash || "";
  }
  if (!redemptionHash) return { result: "invalid" } satisfies EventCheckInResult;

  const { data, error } = await supabase.rpc("check_in_event_ticket", {
    target_event_id: eventId,
    target_redemption_hash: redemptionHash,
  });
  if (error) {
    if (error.code === "42501") {
      throw new EventOperationsError(
        "You cannot check in tickets for this event.",
        "forbidden",
        403,
      );
    }
    throw new EventOperationsError(
      "The ticket could not be checked in.",
      "check_in_failed",
      409,
    );
  }
  return parseCheckInResult(data);
}

export async function undoEventTicketCheckIn(
  supabase: EventClient,
  userId: string,
  eventId: string,
  ticketId: string,
) {
  await requireEventOperationsAccess(supabase, userId, eventId);
  const { data: ticket, error: lookupError } = await createServiceRoleClient()
    .from("event_tickets")
    .select("id")
    .eq("id", ticketId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!ticket) {
    throw new EventOperationsError("Ticket not found.", "not_found", 404);
  }
  const { data, error } = await supabase.rpc("undo_event_ticket_check_in", {
    target_ticket_id: ticketId,
  });
  if (error) throw error;
  if (!data) {
    throw new EventOperationsError(
      "This ticket is not checked in.",
      "conflict",
      409,
    );
  }
  return { ticketId, status: "active" as const };
}
