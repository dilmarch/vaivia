import type { Metadata } from "next";
import Link from "next/link";
import {
  undoEventCheckIn,
  voidEventTicket,
} from "@/app/organizer/events/actions";
import ConfirmSubmitButton from "@/components/events/ConfirmSubmitButton";
import { EventAttendeeTablePresentation } from "@/components/events/EventOperationsPresentation";
import { requireEventManager } from "@/lib/events/auth";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Event attendees – VAIVIA",
  robots: { index: false, follow: false },
};

export default async function EventAttendeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { eventId } = await params;
  const filters = await searchParams;
  await requireEventManager(eventId);
  const service = createServiceRoleClient();
  const [{ data: event }, { data: tickets }, { data: rsvps }] =
    await Promise.all([
      service.from("events").select("title").eq("id", eventId).single(),
      service
        .from("event_tickets")
        .select(
          "id,ticket_number,attendee_name,attendee_email,status,issued_at,checked_in_at,event_ticket_types(name),event_orders(status,created_at)",
        )
        .eq("event_id", eventId)
        .order("issued_at", { ascending: false }),
      service
        .from("event_rsvps")
        .select("id,attendee_name,attendee_email,status,created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false }),
    ]);
  const q = (filters.q || "").toLowerCase();
  const rows = [
    ...(tickets || []).map((ticket) => ({
      id: ticket.id,
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      name: ticket.attendee_name,
      email: ticket.attendee_email,
      tier:
        (Array.isArray(ticket.event_ticket_types)
          ? ticket.event_ticket_types[0]
          : ticket.event_ticket_types
        )?.name || "Ticket",
      status: ticket.status,
      registeredAt: ticket.issued_at,
      checkedInAt: ticket.checked_in_at,
    })),
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
  ].filter(
    (row) =>
      (!q || `${row.name} ${row.email}`.toLowerCase().includes(q)) &&
      (!filters.status || row.status === filters.status),
  );

  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white md:pl-32 md:pr-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
              Private attendee data
            </p>
            <h1 className="mt-2 text-4xl font-black">
              Attendees · {event?.title}
            </h1>
          </div>
          <div className="flex gap-3">
            <Link
              href={`/api/events/${eventId}/attendees.csv`}
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-black"
            >
              Export CSV
            </Link>
            <Link
              href={`/organizer/events/${eventId}/check-in`}
              className="rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950"
            >
              Open check-in
            </Link>
          </div>
        </header>
        <form className="mt-6 grid gap-3 rounded-[1.5rem] border border-white/10 bg-[#080511] p-4 sm:grid-cols-[1fr_12rem_auto]">
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Search name or email"
            className="h-11 rounded-xl border border-white/15 bg-slate-950 px-3 text-sm font-bold text-white"
          />
          <select
            name="status"
            defaultValue={filters.status}
            className="h-11 rounded-xl border border-white/15 bg-slate-950 px-3 text-sm font-bold text-white"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="checked_in">Checked in</option>
            <option value="refunded">Refunded</option>
            <option value="cancelled">Cancelled</option>
            <option value="void">Void</option>
            <option value="confirmed">RSVP confirmed</option>
          </select>
          <button className="rounded-full bg-white/[0.08] px-5 text-sm font-black">
            Filter
          </button>
        </form>
        <div className="mt-5">
          <EventAttendeeTablePresentation
            attendees={rows}
            renderUndoAction={(row) =>
              row.ticketId ? (
                      <form action={undoEventCheckIn}>
                        <input type="hidden" name="event_id" value={eventId} />
                        <input
                          type="hidden"
                          name="ticket_id"
                          value={row.ticketId}
                        />
                        <ConfirmSubmitButton
                          message="Undo this check-in?"
                          className="text-xs font-black text-red-200"
                        >
                          Undo check-in
                        </ConfirmSubmitButton>
                      </form>
              ) : null
            }
            renderSecondaryAction={(row) =>
              row.ticketId && ["active", "checked_in"].includes(row.status) ? (
                      <form action={voidEventTicket} className="mt-2">
                        <input type="hidden" name="event_id" value={eventId} />
                        <input
                          type="hidden"
                          name="ticket_id"
                          value={row.ticketId}
                        />
                        <ConfirmSubmitButton
                          message="Void this ticket? This does not refund a paid order; issue financial refunds in Stripe."
                          className="text-xs font-black text-red-200"
                        >
                          Void ticket
                        </ConfirmSubmitButton>
                      </form>
              ) : null
            }
          />
        </div>
      </div>
    </main>
  );
}
