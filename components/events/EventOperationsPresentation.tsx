import type { ReactNode } from "react";
import { Plus, Users } from "lucide-react";
import { formatEventDateTime } from "@/lib/events/format";
import type {
  EventOperationsAttendee,
  EventOperationsListItem,
} from "@/lib/events/operationsContracts";

export function EventOperationsStatsPresentation({
  tickets,
  confirmedRsvps,
  completedOrders,
}: {
  tickets: number;
  confirmedRsvps: number;
  completedOrders: number;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Stat label="Tickets issued" value={tickets} />
      <Stat label="Confirmed RSVPs" value={confirmedRsvps} />
      <Stat label="Completed orders" value={completedOrders} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5">
      <p className="text-3xl font-black text-lime-300">{value}</p>
      <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
    </div>
  );
}

export function EventOperationsListPresentation({
  events,
  createAction,
  renderManageAction,
  renderPublicAction,
}: {
  events: EventOperationsListItem[];
  createAction?: ReactNode;
  renderManageAction: (event: EventOperationsListItem) => ReactNode;
  renderPublicAction?: (event: EventOperationsListItem) => ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white md:pl-32 md:pr-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4 rounded-[2.5rem] border border-white/10 bg-[#080511] p-7">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
              Organizer studio
            </p>
            <h1 className="mt-3 text-4xl font-black sm:text-6xl">Events</h1>
          </div>
          {createAction}
        </header>
        <div className="mt-7 grid gap-4">
          {events.map((event) => (
            <article
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/10 bg-[#080511] p-5"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black">{event.title}</h2>
                  <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-300">
                    {event.status}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-400">
                  {formatEventDateTime(event.starts_at, event.timezone)} ·{" "}
                  {event.visibility} · {event.registration_mode}
                </p>
              </div>
              <div className="flex gap-3">
                {renderManageAction(event)}
                {event.status === "published" &&
                event.visibility === "public"
                  ? renderPublicAction?.(event)
                  : null}
              </div>
            </article>
          ))}
          {!events.length ? (
            <div className="rounded-[2rem] border border-dashed border-white/15 p-10 text-center">
              <Users className="mx-auto h-9 w-9 text-slate-500" />
              <h2 className="mt-4 text-2xl font-black">
                Create your first event
              </h2>
              <p className="mt-2 text-sm font-semibold text-slate-400">
                Start as a draft, then add tickets and publish when it’s ready.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export function EventCreateActionPresentation({
  renderAction,
}: {
  renderAction: (props: {
    className: string;
    children: ReactNode;
  }) => ReactNode;
}) {
  return renderAction({
    className:
      "inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950",
    children: (
      <>
        <Plus className="h-4 w-4" />
        New event
      </>
    ),
  });
}

export function EventAttendeeTablePresentation({
  attendees,
  renderUndoAction,
  renderSecondaryAction,
  showTicketNumber = false,
  showEmptyState = false,
}: {
  attendees: EventOperationsAttendee[];
  renderUndoAction?: (attendee: EventOperationsAttendee) => ReactNode;
  renderSecondaryAction?: (attendee: EventOperationsAttendee) => ReactNode;
  showTicketNumber?: boolean;
  showEmptyState?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-[1.75rem] border border-white/10">
      <table className="min-w-full bg-[#080511] text-left text-sm">
        <thead className="bg-white/[0.05] text-[10px] uppercase tracking-[0.14em] text-slate-400">
          <tr>
            <th className="p-4">Attendee</th>
            <th className="p-4">Tier</th>
            <th className="p-4">Status</th>
            <th className="p-4">Registered</th>
            <th className="p-4">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {attendees.map((attendee) => (
            <tr key={`${attendee.tier}-${attendee.id}`}>
              <td className="p-4">
                <p className="font-black">{attendee.name}</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  {attendee.email}
                </p>
                {showTicketNumber && attendee.ticketNumber ? (
                  <p className="mt-1 font-mono text-[10px] text-slate-500">
                    {attendee.ticketNumber}
                  </p>
                ) : null}
              </td>
              <td className="p-4 font-bold">{attendee.tier}</td>
              <td className="p-4 font-black text-lime-200">
                {attendee.status.replace("_", " ")}
                {attendee.checkedInAt ? (
                  <span className="block text-xs text-slate-500">
                    {new Date(attendee.checkedInAt).toLocaleString()}
                  </span>
                ) : null}
              </td>
              <td className="p-4 text-slate-400">
                {new Date(attendee.registeredAt).toLocaleDateString()}
              </td>
              <td className="p-4">
                {attendee.ticketId && attendee.status === "checked_in"
                  ? renderUndoAction?.(attendee)
                  : null}
                {renderSecondaryAction?.(attendee)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {showEmptyState && !attendees.length ? (
        <p className="bg-[#080511] p-8 text-center text-sm font-semibold text-slate-400">
          No attendees match these filters.
        </p>
      ) : null}
    </div>
  );
}
