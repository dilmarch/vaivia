import { requireEventManager } from "@/lib/events/auth";
import { createServiceRoleClient } from "@/lib/supabase/service";

function csv(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[=+@-]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  await requireEventManager(eventId);
  const service = createServiceRoleClient();
  const [{ data: event }, { data: tickets }, { data: rsvps }] =
    await Promise.all([
      service.from("events").select("slug").eq("id", eventId).single(),
      service
        .from("event_tickets")
        .select(
          "attendee_name,attendee_email,ticket_number,status,issued_at,checked_in_at,event_ticket_types(name)",
        )
        .eq("event_id", eventId),
      service
        .from("event_rsvps")
        .select("attendee_name,attendee_email,status,created_at")
        .eq("event_id", eventId),
    ]);
  const rows = [
    [
      "Name",
      "Email",
      "Admission",
      "Ticket number",
      "Status",
      "Registered at",
      "Checked in at",
    ],
    ...(tickets || []).map((ticket) => [
      ticket.attendee_name,
      ticket.attendee_email,
      (Array.isArray(ticket.event_ticket_types)
        ? ticket.event_ticket_types[0]
        : ticket.event_ticket_types
      )?.name || "Ticket",
      ticket.ticket_number,
      ticket.status,
      ticket.issued_at,
      ticket.checked_in_at,
    ]),
    ...(rsvps || []).map((rsvp) => [
      rsvp.attendee_name,
      rsvp.attendee_email,
      "RSVP",
      "",
      rsvp.status,
      rsvp.created_at,
      "",
    ]),
  ];
  const body = rows.map((row) => row.map(csv).join(",")).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event?.slug || "event"}-attendees.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
