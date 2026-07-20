import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, CalendarCheck, Ticket } from "lucide-react";
import { cancelMyEventRsvp } from "@/app/my-events/actions";
import ConfirmSubmitButton from "@/components/events/ConfirmSubmitButton";
import { requireEventUser, isEventOrganizerRole } from "@/lib/events/auth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { eventLocationLabel, formatEventDateTime } from "@/lib/events/format";

export const metadata: Metadata = { title: "My Events – VAIVIA" };

export default async function MyEventsPage() {
  const auth = await requireEventUser("/my-events");
  const service = createServiceRoleClient();
  const [{ data: tickets }, { data: rsvps }, { data: saves }] =
    await Promise.all([
      service
        .from("event_tickets")
        .select(
          "id,ticket_number,status,events(id,slug,title,starts_at,ends_at,timezone,venue_type,venue_name,city,region)",
        )
        .eq("owner_user_id", auth.user.id)
        .order("issued_at", { ascending: false }),
      service
        .from("event_rsvps")
        .select(
          "id,status,events(id,slug,title,starts_at,ends_at,timezone,venue_type,venue_name,city,region)",
        )
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false }),
      service
        .from("saved_events")
        .select(
          "id,events(id,slug,title,starts_at,ends_at,timezone,venue_type,venue_name,city,region,status,visibility)",
        )
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false }),
    ]);
  const now = Date.now();
  const admissions = [
    ...(tickets || []).map((ticket) => ({
      id: ticket.id,
      kind: "Ticket",
      status: ticket.status,
      ticketId: ticket.id,
      event: Array.isArray(ticket.events) ? ticket.events[0] : ticket.events,
    })),
    ...(rsvps || []).map((rsvp) => ({
      id: rsvp.id,
      kind: "RSVP",
      status: rsvp.status,
      ticketId: null,
      event: Array.isArray(rsvp.events) ? rsvp.events[0] : rsvp.events,
    })),
  ].filter((item) => item.event);
  const upcoming = admissions.filter(
    (item) =>
      new Date(item.event!.ends_at).getTime() >= now &&
      !["cancelled", "refunded", "void"].includes(item.status),
  );
  const past = admissions.filter(
    (item) =>
      new Date(item.event!.ends_at).getTime() < now ||
      ["cancelled", "refunded", "void"].includes(item.status),
  );

  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white md:pl-32 md:pr-8">
      <div className="mx-auto max-w-6xl space-y-9">
        <header className="flex flex-wrap items-end justify-between gap-4 rounded-[2.5rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.16),transparent_42%),#080511] p-7">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-lime-300">
              Your guest list
            </p>
            <h1 className="mt-3 text-4xl font-black sm:text-6xl">My Events</h1>
          </div>
          <div className="flex gap-3">
            <Link
              href="/events"
              className="rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950"
            >
              Browse events
            </Link>
            {isEventOrganizerRole(auth.profile?.role) ? (
              <Link
                href="/organizer/events"
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-black"
              >
                Manage events
              </Link>
            ) : null}
          </div>
        </header>
        <EventList
          title="Upcoming"
          icon={<CalendarCheck className="h-5 w-5" />}
          items={upcoming}
          empty="Your next event will show up here."
        />
        <EventList
          title="Past & inactive"
          icon={<Ticket className="h-5 w-5" />}
          items={past}
          empty="No past events yet."
        />
        <section>
          <h2 className="flex items-center gap-2 text-2xl font-black">
            <Bookmark className="h-5 w-5 text-lime-300" />
            Saved
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {(saves || []).map((saved) => {
              const event = Array.isArray(saved.events)
                ? saved.events[0]
                : saved.events;
              return event ? (
                <Link
                  key={saved.id}
                  href={`/events/${event.slug}`}
                  className="rounded-[1.75rem] border border-white/10 bg-[#080511] p-5 transition hover:border-lime-300/30"
                >
                  <p className="text-xl font-black">{event.title}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-400">
                    {formatEventDateTime(event.starts_at, event.timezone)} ·{" "}
                    {eventLocationLabel(event)}
                  </p>
                </Link>
              ) : null;
            })}
            {!saves?.length ? (
              <p className="rounded-[1.75rem] border border-dashed border-white/15 p-6 text-sm font-semibold text-slate-400">
                Save an event from the marketplace to keep it here.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function EventList({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  items: Array<{
    id: string;
    kind: string;
    status: string;
    ticketId: string | null;
    event: {
      id: string;
      slug: string;
      title: string;
      starts_at: string;
      timezone: string;
      venue_type: string;
      venue_name: string | null;
      city: string | null;
      region: string | null;
    } | null;
  }>;
  empty: string;
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-2xl font-black text-white">
        <span className="text-lime-300">{icon}</span>
        {title}
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {items.map((item) =>
          item.event ? (
            <article
              key={`${item.kind}-${item.id}`}
              className="rounded-[1.75rem] border border-white/10 bg-[#080511] p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-black">{item.event.title}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-400">
                    {formatEventDateTime(
                      item.event.starts_at,
                      item.event.timezone,
                    )}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-400">
                    {eventLocationLabel(item.event)}
                  </p>
                </div>
                <span className="rounded-full bg-lime-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-lime-200">
                  {item.kind} · {item.status}
                </span>
              </div>
              <div className="mt-4 flex items-center gap-4 border-t border-white/10 pt-4">
                <Link
                  href={
                    item.ticketId
                      ? `/my-events/tickets/${item.ticketId}`
                      : `/events/${item.event.slug}`
                  }
                  className="text-sm font-black text-lime-200"
                >
                  {item.ticketId ? "View ticket" : "View event"} →
                </Link>
                {item.kind === "RSVP" && item.status === "confirmed" ? (
                  <form action={cancelMyEventRsvp}>
                    <input
                      type="hidden"
                      name="event_id"
                      value={item.event.id}
                    />
                    <input
                      type="hidden"
                      name="event_slug"
                      value={item.event.slug}
                    />
                    <ConfirmSubmitButton
                      message="Cancel your RSVP for this event?"
                      className="text-sm font-black text-red-200"
                    >
                      Cancel RSVP
                    </ConfirmSubmitButton>
                  </form>
                ) : null}
              </div>
            </article>
          ) : null,
        )}
        {!items.length ? (
          <p className="rounded-[1.75rem] border border-dashed border-white/15 p-6 text-sm font-semibold text-slate-400">
            {empty}
          </p>
        ) : null}
      </div>
    </section>
  );
}
