"use server";

import { randomBytes, createHash } from "node:crypto";
import { TZDate } from "@date-fns/tz";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventManager, requireEventOrganizer } from "@/lib/events/auth";
import { slugifyEventTitle } from "@/lib/events/format";
import {
  sendEventInvitationEmail,
  sendEventStatusEmail,
} from "@/lib/events/emails";
import { createServiceRoleClient } from "@/lib/supabase/service";

export type EventActionState = {
  ok: boolean;
  message: string;
  eventId?: string;
};

function text(formData: FormData, name: string) {
  return String(formData.get(name) || "").trim();
}

function nullableText(formData: FormData, name: string) {
  return text(formData, name) || null;
}

function localDateTimeToUtc(value: string, timezone: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error("Enter a complete date and time.");
  const date = new TZDate(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
    timezone,
  );
  if (Number.isNaN(date.getTime()))
    throw new Error("Enter a valid event date and time.");
  return date.toISOString();
}

function parseTags(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

function parseCapacity(value: string) {
  if (!value) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1)
    throw new Error("Capacity must be a positive whole number.");
  return number;
}

function eventPayload(formData: FormData, ownerUserId: string) {
  const title = text(formData, "title");
  const timezone = text(formData, "timezone") || "UTC";
  const startsAt = localDateTimeToUtc(
    text(formData, "starts_at_local"),
    timezone,
  );
  const endsAt = localDateTimeToUtc(text(formData, "ends_at_local"), timezone);
  if (!title) throw new Error("Event title is required.");
  if (new Date(endsAt) <= new Date(startsAt))
    throw new Error("End time must be after the start time.");
  const slug = slugifyEventTitle(text(formData, "slug") || title);
  if (!slug) throw new Error("Enter a valid event slug.");
  const requestedStatus =
    text(formData, "status") === "scheduled" ? "scheduled" : "draft";
  const publishAt = nullableText(formData, "publish_at_local")
    ? localDateTimeToUtc(text(formData, "publish_at_local"), timezone)
    : null;
  if (requestedStatus === "scheduled" && !publishAt) {
    throw new Error("Choose a publication time before scheduling this event.");
  }

  return {
    owner_user_id: ownerUserId,
    title,
    slug,
    short_summary: nullableText(formData, "short_summary"),
    description: nullableText(formData, "description"),
    category: nullableText(formData, "category"),
    tags: parseTags(text(formData, "tags")),
    cover_image_alt: nullableText(formData, "cover_image_alt"),
    status: requestedStatus,
    visibility:
      text(formData, "visibility") === "private" ? "private" : "public",
    registration_mode:
      text(formData, "registration_mode") === "ticketed" ? "ticketed" : "rsvp",
    starts_at: startsAt,
    ends_at: endsAt,
    timezone,
    venue_type:
      text(formData, "venue_type") === "online" ? "online" : "physical",
    venue_name: nullableText(formData, "venue_name"),
    address_line: nullableText(formData, "address_line"),
    city: nullableText(formData, "city"),
    region: nullableText(formData, "region"),
    country: nullableText(formData, "country"),
    postal_code: nullableText(formData, "postal_code"),
    google_place_id: nullableText(formData, "google_place_id"),
    latitude: nullableText(formData, "latitude")
      ? Number(text(formData, "latitude"))
      : null,
    longitude: nullableText(formData, "longitude")
      ? Number(text(formData, "longitude"))
      : null,
    organizer_display_name: nullableText(formData, "organizer_display_name"),
    organizer_contact_email: nullableText(formData, "organizer_contact_email"),
    accessibility_info: nullableText(formData, "accessibility_info"),
    attendee_notes: nullableText(formData, "attendee_notes"),
    age_restriction: nullableText(formData, "age_restriction"),
    refund_policy: nullableText(formData, "refund_policy"),
    overall_capacity: parseCapacity(text(formData, "overall_capacity")),
    publish_at: publishAt,
  };
}

export async function createEvent(
  _state: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  try {
    const auth = await requireEventOrganizer();
    const payload = eventPayload(formData, auth.user.id);
    if (
      payload.status === "scheduled" &&
      payload.registration_mode === "ticketed"
    ) {
      return {
        ok: false,
        message:
          "Create the ticketed event as a draft, add a ticket tier, then schedule it.",
      };
    }
    const { data: event, error } = await auth.supabase
      .from("events")
      .insert(payload)
      .select("id")
      .single();
    if (error || !event) {
      if (error?.code === "23505")
        return { ok: false, message: "That event URL is already in use." };
      throw error || new Error("Event was not created.");
    }
    const onlineUrl = nullableText(formData, "online_url");
    if (onlineUrl) {
      const { error: privateError } = await auth.supabase
        .from("event_private_details")
        .insert({ event_id: event.id, online_url: onlineUrl });
      if (privateError) throw privateError;
    }
    await auth.supabase.from("event_audit_log").insert({
      event_id: event.id,
      actor_user_id: auth.user.id,
      action: "event_created",
      subject_type: "event",
      subject_id: event.id,
    });
    redirect(`/organizer/events/${event.id}/edit`);
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT"))
      throw error;
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Could not create event.",
    };
  }
}

export async function updateEvent(
  _state: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const eventId = text(formData, "event_id");
  try {
    const auth = await requireEventManager(eventId);
    const { data: currentEvent } = await auth.supabase
      .from("events")
      .select("status")
      .eq("id", eventId)
      .single();
    if (!currentEvent) throw new Error("Event not found.");
    const payload = eventPayload(
      formData,
      text(formData, "owner_user_id") || auth.user.id,
    );
    delete (payload as Partial<typeof payload>).owner_user_id;
    if (!["draft", "scheduled"].includes(currentEvent.status)) {
      payload.status = currentEvent.status as typeof payload.status;
    }
    if (
      payload.status === "scheduled" &&
      payload.registration_mode === "ticketed"
    ) {
      const { count } = await auth.supabase
        .from("event_ticket_types")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .in("state", ["active", "sold_out"]);
      if (!count) {
        return {
          ok: false,
          message: "Add an active ticket tier before scheduling publication.",
        };
      }
    }
    const { error } = await auth.supabase
      .from("events")
      .update(payload)
      .eq("id", eventId);
    if (error) {
      if (error.code === "23505")
        return { ok: false, message: "That event URL is already in use." };
      throw error;
    }
    await auth.supabase.from("event_private_details").upsert({
      event_id: eventId,
      online_url: nullableText(formData, "online_url"),
    });
    await auth.supabase.from("event_audit_log").insert({
      event_id: eventId,
      actor_user_id: auth.user.id,
      action: "event_updated",
      subject_type: "event",
      subject_id: eventId,
    });
    revalidatePath(`/organizer/events/${eventId}`);
    revalidatePath(`/organizer/events/${eventId}/edit`);
    revalidatePath("/events");
    return { ok: true, message: "Event saved.", eventId };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save event.",
    };
  }
}

export async function setEventLifecycle(formData: FormData) {
  const eventId = text(formData, "event_id");
  const action = text(formData, "lifecycle_action");
  const auth = await requireEventManager(eventId);
  if (!["publish", "unpublish", "cancel", "archive"].includes(action)) {
    throw new Error("Invalid event lifecycle action.");
  }
  const { data: currentEvent } = await auth.supabase
    .from("events")
    .select("status,registration_mode")
    .eq("id", eventId)
    .single();
  if (!currentEvent) throw new Error("Event not found.");
  if (["cancelled", "archived"].includes(currentEvent.status)) {
    throw new Error("Cancelled or archived events cannot change lifecycle.");
  }
  if (action === "publish" && currentEvent.registration_mode === "ticketed") {
    const { count } = await auth.supabase
      .from("event_ticket_types")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .in("state", ["active", "sold_out"]);
    if (!count) throw new Error("Add an active ticket tier before publishing.");
  }
  const now = new Date().toISOString();
  const update =
    action === "publish"
      ? { status: "published", published_at: now, cancelled_at: null }
      : action === "cancel"
        ? { status: "cancelled", cancelled_at: now }
        : action === "archive"
          ? { status: "archived", archived_at: now }
          : { status: "draft" };
  const { error } = await auth.supabase
    .from("events")
    .update(update)
    .eq("id", eventId);
  if (error) throw new Error("Could not update event status.");
  await auth.supabase.from("event_audit_log").insert({
    event_id: eventId,
    actor_user_id: auth.user.id,
    action: `event_${action}`,
    subject_type: "event",
    subject_id: eventId,
  });

  if (action === "cancel") {
    const service = createServiceRoleClient();
    const [{ data: event }, { data: tickets }, { data: rsvps }] =
      await Promise.all([
        service
          .from("events")
          .select(
            "title,slug,starts_at,timezone,venue_name,organizer_contact_email,refund_policy",
          )
          .eq("id", eventId)
          .single(),
        service
          .from("event_tickets")
          .select("attendee_email,id")
          .eq("event_id", eventId)
          .in("status", ["active", "checked_in"]),
        service
          .from("event_rsvps")
          .select("attendee_email,id")
          .eq("event_id", eventId)
          .eq("status", "confirmed"),
      ]);
    await service
      .from("event_tickets")
      .update({ status: "cancelled", voided_at: now })
      .eq("event_id", eventId)
      .in("status", ["active", "checked_in"]);
    for (const recipient of [...(tickets || []), ...(rsvps || [])]) {
      if (!event || !recipient.attendee_email) continue;
      await sendEventStatusEmail({
        recipient: recipient.attendee_email,
        eventTitle: event.title,
        eventSlug: event.slug,
        startsAt: event.starts_at,
        timezone: event.timezone,
        venue: event.venue_name || undefined,
        contactEmail: event.organizer_contact_email,
        refundPolicy: event.refund_policy,
        kind: "cancelled",
        idempotencyKey: `event-cancelled-${eventId}-${recipient.id}`,
      }).catch(() => undefined);
    }
  }
  revalidatePath("/events");
  revalidatePath(`/organizer/events/${eventId}`);
}

export async function saveTicketTier(
  _state: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const eventId = text(formData, "event_id");
  try {
    const auth = await requireEventManager(eventId);
    const { data: event } = await auth.supabase
      .from("events")
      .select("timezone")
      .eq("id", eventId)
      .single();
    if (!event) throw new Error("Event not found.");
    const tierId = text(formData, "ticket_type_id");
    const price = Math.round(Number(text(formData, "price") || 0) * 100);
    const totalQuantity = Number(text(formData, "total_quantity"));
    const minPerOrder = Number(text(formData, "min_per_order") || 1);
    const maxPerOrder = Number(text(formData, "max_per_order") || 10);
    const maxPerCustomer = nullableText(formData, "max_per_customer")
      ? Number(text(formData, "max_per_customer"))
      : null;
    if (!Number.isInteger(price) || price < 0)
      return { ok: false, message: "Enter a valid non-negative ticket price." };
    if (!Number.isInteger(totalQuantity) || totalQuantity < 1)
      return {
        ok: false,
        message: "Ticket quantity must be a positive whole number.",
      };
    if (
      !Number.isInteger(minPerOrder) ||
      !Number.isInteger(maxPerOrder) ||
      minPerOrder < 1 ||
      maxPerOrder < minPerOrder
    )
      return { ok: false, message: "Ticket order limits are invalid." };
    if (
      maxPerCustomer !== null &&
      (!Number.isInteger(maxPerCustomer) || maxPerCustomer < maxPerOrder)
    )
      return {
        ok: false,
        message: "Maximum per customer cannot be lower than maximum per order.",
      };
    const salesStartLocal = nullableText(formData, "sales_start_at");
    const salesEndLocal = nullableText(formData, "sales_end_at");
    const salesStart = salesStartLocal
      ? localDateTimeToUtc(salesStartLocal, event.timezone)
      : null;
    const salesEnd = salesEndLocal
      ? localDateTimeToUtc(salesEndLocal, event.timezone)
      : null;
    if (salesStart && salesEnd && new Date(salesEnd) <= new Date(salesStart))
      return { ok: false, message: "Sales end must be after sales start." };
    const payload = {
      event_id: eventId,
      name: text(formData, "name"),
      description: nullableText(formData, "description"),
      price_minor: price,
      currency: (text(formData, "currency") || "CAD").toUpperCase(),
      total_quantity: totalQuantity,
      sales_start_at: salesStart,
      sales_end_at: salesEnd,
      min_per_order: minPerOrder,
      max_per_order: maxPerOrder,
      max_per_customer: maxPerCustomer,
      display_order: Number(text(formData, "display_order") || 0),
      state: text(formData, "state") || "active",
      attendee_instructions: nullableText(formData, "attendee_instructions"),
    };
    if (!payload.name)
      return { ok: false, message: "Ticket name is required." };
    const request = tierId
      ? auth.supabase
          .from("event_ticket_types")
          .update(payload)
          .eq("id", tierId)
          .eq("event_id", eventId)
      : auth.supabase.from("event_ticket_types").insert(payload);
    const { error } = await request;
    if (error) throw error;
    revalidatePath(`/organizer/events/${eventId}/tickets`);
    revalidatePath(`/events`);
    return { ok: true, message: "Ticket tier saved." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Could not save ticket tier.",
    };
  }
}

function parseInvitationEmails(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
    ),
  ].slice(0, 250);
}

export async function inviteEventGuests(
  _state: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const eventId = text(formData, "event_id");
  try {
    const auth = await requireEventManager(eventId);
    const emails = parseInvitationEmails(text(formData, "emails"));
    if (!emails.length)
      return { ok: false, message: "Add at least one valid email address." };
    const service = createServiceRoleClient();
    const { data: event } = await service
      .from("events")
      .select("id,title")
      .eq("id", eventId)
      .single();
    if (!event) throw new Error("Event not found.");
    let sent = 0;
    for (const email of emails) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const { data: existing } = await service
        .from("event_invitations")
        .select("send_count")
        .eq("event_id", eventId)
        .eq("email_normalized", email)
        .maybeSingle();
      const { data: invitation, error } = await service
        .from("event_invitations")
        .upsert(
          {
            event_id: eventId,
            email_normalized: email,
            token_hash: tokenHash,
            status: "pending",
            invited_by: auth.user.id,
            expires_at: new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            last_sent_at: new Date().toISOString(),
            revoked_at: null,
            send_count: (existing?.send_count || 0) + 1,
          },
          { onConflict: "event_id,email_normalized" },
        )
        .select("id")
        .single();
      if (error || !invitation) continue;
      await sendEventInvitationEmail({
        recipient: email,
        eventTitle: event.title,
        invitationToken: token,
        invitationId: invitation.id,
      })
        .then(() => {
          sent += 1;
        })
        .catch(() => undefined);
    }
    revalidatePath(`/organizer/events/${eventId}/invitations`);
    return {
      ok: true,
      message: `${sent} invitation${sent === 1 ? "" : "s"} sent.`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Could not send invitations.",
    };
  }
}

export async function resendEventInvitation(formData: FormData) {
  const eventId = text(formData, "event_id");
  const invitationId = text(formData, "invitation_id");
  await requireEventManager(eventId);
  const service = createServiceRoleClient();
  const { data: invitation } = await service
    .from("event_invitations")
    .select("email_normalized")
    .eq("id", invitationId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!invitation) throw new Error("Invitation not found.");
  const retry = new FormData();
  retry.set("event_id", eventId);
  retry.set("emails", invitation.email_normalized);
  const result = await inviteEventGuests({ ok: false, message: "" }, retry);
  if (!result.ok) throw new Error(result.message);
}

export async function revokeEventInvitation(formData: FormData) {
  const eventId = text(formData, "event_id");
  const invitationId = text(formData, "invitation_id");
  await requireEventManager(eventId);
  const service = createServiceRoleClient();
  await service
    .from("event_invitations")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("event_id", eventId);
  revalidatePath(`/organizer/events/${eventId}/invitations`);
}

export async function undoEventCheckIn(formData: FormData) {
  const eventId = text(formData, "event_id");
  const ticketId = text(formData, "ticket_id");
  const auth = await requireEventManager(eventId);
  const { error } = await auth.supabase.rpc("undo_event_ticket_check_in", {
    target_ticket_id: ticketId,
  });
  if (error) throw new Error("Check-in could not be undone.");
  revalidatePath(`/organizer/events/${eventId}/attendees`);
  revalidatePath(`/organizer/events/${eventId}/check-in`);
}

export async function voidEventTicket(formData: FormData) {
  const eventId = text(formData, "event_id");
  const ticketId = text(formData, "ticket_id");
  const auth = await requireEventManager(eventId);
  const service = createServiceRoleClient();
  const { data: ticket } = await service
    .from("event_tickets")
    .select(
      "id,status,attendee_email,events(title,slug,starts_at,timezone,venue_name,organizer_contact_email,refund_policy)",
    )
    .eq("id", ticketId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!ticket || !["active", "checked_in"].includes(ticket.status))
    throw new Error("Only an active ticket can be voided.");
  const now = new Date().toISOString();
  const { error } = await service
    .from("event_tickets")
    .update({ status: "void", voided_at: now })
    .eq("id", ticketId)
    .eq("event_id", eventId)
    .in("status", ["active", "checked_in"]);
  if (error) throw new Error("Ticket could not be voided.");
  await service.from("event_audit_log").insert({
    event_id: eventId,
    actor_user_id: auth.user.id,
    action: "ticket_voided",
    subject_type: "event_ticket",
    subject_id: ticketId,
  });
  const event = Array.isArray(ticket.events) ? ticket.events[0] : ticket.events;
  if (event && ticket.attendee_email) {
    await sendEventStatusEmail({
      recipient: ticket.attendee_email,
      eventTitle: event.title,
      eventSlug: event.slug,
      startsAt: event.starts_at,
      timezone: event.timezone,
      venue: event.venue_name || undefined,
      contactEmail: event.organizer_contact_email,
      refundPolicy: event.refund_policy,
      kind: "void",
      idempotencyKey: `event-ticket-voided-${ticketId}`,
    }).catch(() => undefined);
  }
  revalidatePath(`/organizer/events/${eventId}/attendees`);
}

export async function addEventTeamMember(formData: FormData) {
  const eventId = text(formData, "event_id");
  const email = text(formData, "email").toLowerCase();
  const role =
    text(formData, "team_role") === "check_in" ? "check_in" : "manager";
  const auth = await requireEventManager(eventId);
  const service = createServiceRoleClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("id,role")
    .ilike("email", email)
    .maybeSingle();
  if (!profile || !["event_organizer", "super_admin"].includes(profile.role)) {
    throw new Error("That account is not an event organizer.");
  }
  const { error } = await auth.supabase.from("event_team_members").upsert(
    {
      event_id: eventId,
      user_id: profile.id,
      role,
      created_by: auth.user.id,
    },
    { onConflict: "event_id,user_id" },
  );
  if (error) throw new Error("Team member could not be assigned.");
  await auth.supabase.from("event_audit_log").insert({
    event_id: eventId,
    actor_user_id: auth.user.id,
    action: "event_team_member_assigned",
    subject_type: "user_profile",
    subject_id: profile.id,
    metadata: { role },
  });
  revalidatePath(`/organizer/events/${eventId}`);
}

export async function removeEventTeamMember(formData: FormData) {
  const eventId = text(formData, "event_id");
  const memberId = text(formData, "member_id");
  const auth = await requireEventManager(eventId);
  await auth.supabase
    .from("event_team_members")
    .delete()
    .eq("id", memberId)
    .eq("event_id", eventId);
  revalidatePath(`/organizer/events/${eventId}`);
}
