import type { Metadata } from "next";
import Link from "next/link";
import { cancelMyEventRsvp } from "@/app/my-events/actions";
import ConfirmSubmitButton from "@/components/events/ConfirmSubmitButton";
import {
  MyEventsPresentation,
  SavedEventContent,
  eventOpenClassName,
  savedEventOpenClassName,
  type MyEventAdmission,
  type MyEventSummary,
  type SavedEventItem,
} from "@/components/events/MyEventsPresentation";
import { isEventOrganizerRole, requireEventUser } from "@/lib/events/auth";
import { loadMyEvents } from "@/lib/events/attendee";

export const metadata: Metadata = { title: "My Events – VAIVIA" };

function relation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] || null : value;
}

export default async function MyEventsPage() {
  const auth = await requireEventUser("/my-events");
  const data = await loadMyEvents(auth.supabase, auth.user.id);
  const admissions: MyEventAdmission[] = [
    ...data.tickets.map((ticket) => ({
      id: ticket.id,
      kind: "Ticket" as const,
      status: ticket.status,
      ticketId: ticket.id,
      event: relation(ticket.events) as MyEventSummary,
    })),
    ...data.rsvps.map((rsvp) => ({
      id: rsvp.id,
      kind: "RSVP" as const,
      status: rsvp.status,
      ticketId: null,
      event: relation(rsvp.events) as MyEventSummary,
    })),
  ].filter((item) => Boolean(item.event));
  const now = Date.now();
  const upcoming = admissions.filter(
    (item) =>
      new Date(item.event.ends_at).getTime() >= now &&
      !["cancelled", "refunded", "void"].includes(item.status),
  );
  const past = admissions.filter(
    (item) =>
      new Date(item.event.ends_at).getTime() < now ||
      ["cancelled", "refunded", "void"].includes(item.status),
  );
  const saved: SavedEventItem[] = data.saved
    .map((item) => ({
      id: item.id,
      event: relation(item.events) as MyEventSummary,
    }))
    .filter((item) => Boolean(item.event));

  return (
    <MyEventsPresentation
      upcoming={upcoming}
      past={past}
      saved={saved}
      browseAction={<Link href="/events" className="rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950">Browse events</Link>}
      manageAction={isEventOrganizerRole(auth.profile?.role) ? <Link href="/organizer/events" className="rounded-full border border-white/15 px-5 py-3 text-sm font-black">Manage events</Link> : undefined}
      renderAdmissionOpen={(item) => <Link href={item.ticketId ? `/my-events/tickets/${item.ticketId}` : `/events/${item.event.slug}`} className={eventOpenClassName}>{item.ticketId ? "View ticket" : "View event"} →</Link>}
      renderCancel={(item) => (
        <form action={cancelMyEventRsvp}>
          <input type="hidden" name="event_id" value={item.event.id} />
          <input type="hidden" name="event_slug" value={item.event.slug} />
          <ConfirmSubmitButton message="Cancel your RSVP for this event?" className="text-sm font-black text-red-200">Cancel RSVP</ConfirmSubmitButton>
        </form>
      )}
      renderSavedOpen={(item) => <Link href={`/events/${item.event.slug}`} className={savedEventOpenClassName}><SavedEventContent event={item.event} /></Link>}
    />
  );
}
