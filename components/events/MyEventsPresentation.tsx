import type { ReactNode } from "react";
import { Bookmark, CalendarCheck, Ticket } from "lucide-react";
import { eventLocationLabel, formatEventDateTime } from "@/lib/events/format";

export type MyEventSummary = {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  venue_type: string;
  venue_name: string | null;
  city: string | null;
  region: string | null;
};

export type MyEventAdmission = {
  id: string;
  kind: "Ticket" | "RSVP";
  status: string;
  ticketId: string | null;
  event: MyEventSummary;
};

export type SavedEventItem = { id: string; event: MyEventSummary };

function AdmissionList({
  title,
  icon,
  items,
  empty,
  renderOpen,
  renderCancel,
}: {
  title: string;
  icon: ReactNode;
  items: MyEventAdmission[];
  empty: string;
  renderOpen: (item: MyEventAdmission) => ReactNode;
  renderCancel: (item: MyEventAdmission) => ReactNode;
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-2xl font-black text-white"><span className="text-lime-300">{icon}</span>{title}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <article key={`${item.kind}-${item.id}`} className="rounded-[1.75rem] border border-white/10 bg-[#080511] p-5">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xl font-black">{item.event.title}</p><p className="mt-2 text-sm font-semibold text-slate-400">{formatEventDateTime(item.event.starts_at, item.event.timezone)}</p><p className="mt-1 text-sm font-semibold text-slate-400">{eventLocationLabel(item.event)}</p></div><span className="rounded-full bg-lime-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-lime-200">{item.kind} · {item.status}</span></div>
            <div className="mt-4 flex items-center gap-4 border-t border-white/10 pt-4">{renderOpen(item)}{item.kind === "RSVP" && item.status === "confirmed" ? renderCancel(item) : null}</div>
          </article>
        ))}
        {!items.length ? <p className="rounded-[1.75rem] border border-dashed border-white/15 p-6 text-sm font-semibold text-slate-400">{empty}</p> : null}
      </div>
    </section>
  );
}

export function MyEventsPresentation({
  upcoming,
  past,
  saved,
  browseAction,
  manageAction,
  renderAdmissionOpen,
  renderCancel,
  renderSavedOpen,
}: {
  upcoming: MyEventAdmission[];
  past: MyEventAdmission[];
  saved: SavedEventItem[];
  browseAction: ReactNode;
  manageAction?: ReactNode;
  renderAdmissionOpen: (item: MyEventAdmission) => ReactNode;
  renderCancel: (item: MyEventAdmission) => ReactNode;
  renderSavedOpen: (item: SavedEventItem) => ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white md:pl-32 md:pr-8">
      <div className="mx-auto max-w-6xl space-y-9">
        <header className="flex flex-wrap items-end justify-between gap-4 rounded-[2.5rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.16),transparent_42%),#080511] p-7"><div><p className="text-xs font-black uppercase tracking-[0.25em] text-lime-300">Your guest list</p><h1 className="mt-3 text-4xl font-black sm:text-6xl">My Events</h1></div><div className="flex gap-3">{browseAction}{manageAction}</div></header>
        <AdmissionList title="Upcoming" icon={<CalendarCheck className="h-5 w-5" aria-hidden="true" />} items={upcoming} empty="Your next event will show up here." renderOpen={renderAdmissionOpen} renderCancel={renderCancel} />
        <AdmissionList title="Past & inactive" icon={<Ticket className="h-5 w-5" aria-hidden="true" />} items={past} empty="No past events yet." renderOpen={renderAdmissionOpen} renderCancel={renderCancel} />
        <section><h2 className="flex items-center gap-2 text-2xl font-black"><Bookmark className="h-5 w-5 text-lime-300" aria-hidden="true" />Saved</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{saved.map((item) => <div key={item.id}>{renderSavedOpen(item)}</div>)}{!saved.length ? <p className="rounded-[1.75rem] border border-dashed border-white/15 p-6 text-sm font-semibold text-slate-400">Save an event from the marketplace to keep it here.</p> : null}</div></section>
      </div>
    </main>
  );
}

export const eventOpenClassName = "text-sm font-black text-lime-200";
export const savedEventOpenClassName = "block w-full rounded-[1.75rem] border border-white/10 bg-[#080511] p-5 text-left transition hover:border-lime-300/30";

export function SavedEventContent({ event }: { event: MyEventSummary }) {
  return <><span className="block text-xl font-black">{event.title}</span><span className="mt-2 block text-sm font-semibold text-slate-400">{formatEventDateTime(event.starts_at, event.timezone)} · {eventLocationLabel(event)}</span></>;
}
