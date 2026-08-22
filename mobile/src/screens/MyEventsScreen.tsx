import { useEffect, useState } from "react";
import {
  MyEventsPresentation,
  SavedEventContent,
  eventOpenClassName,
  savedEventOpenClassName,
  type MyEventAdmission,
  type MyEventSummary,
  type SavedEventItem,
} from "@/components/events/MyEventsPresentation";
import type { MobileMyEventsResponse } from "@/lib/mobileApi/contracts";
import { ScreenMessage } from "../components/ScreenMessage";
import type { MobileApiClient } from "../lib/apiClient";

function relation(value: unknown): MyEventSummary | null { return (Array.isArray(value) ? value[0] : value) as MyEventSummary | null; }

export function MyEventsScreen({ apiClient, onBrowse, onEvent, onTicket }: { apiClient: MobileApiClient; onBrowse: () => void; onEvent: (eventId: string) => void; onTicket: (ticketId: string) => void }) {
  const [data, setData] = useState<MobileMyEventsResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); void apiClient.getMyEvents(controller.signal).then((result) => { if (!controller.signal.aborted) setData(result); }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load My Events."); }); return () => controller.abort(); }, [apiClient]);
  if (!data) return <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white"><ScreenMessage title={error ? "My Events is unavailable" : "Loading My Events"} message={error || "Getting your tickets and RSVPs ready."} /></main>;
  const admissions: MyEventAdmission[] = [
    ...data.tickets.map((item) => ({ id: String(item.id), kind: "Ticket" as const, status: String(item.status), ticketId: String(item.id), event: relation(item.events)! })),
    ...data.rsvps.map((item) => ({ id: String(item.id), kind: "RSVP" as const, status: String(item.status), ticketId: null, event: relation(item.events)! })),
  ].filter((item) => Boolean(item.event));
  const now = Date.now();
  const upcoming = admissions.filter((item) => new Date(item.event.ends_at).getTime() >= now && !["cancelled", "refunded", "void"].includes(item.status));
  const past = admissions.filter((item) => new Date(item.event.ends_at).getTime() < now || ["cancelled", "refunded", "void"].includes(item.status));
  const saved: SavedEventItem[] = data.saved.map((item) => ({ id: String(item.id), event: relation(item.events)! })).filter((item) => Boolean(item.event));
  async function cancel(item: MyEventAdmission) {
    if (!window.confirm("Cancel your RSVP for this event?")) return;
    try {
      await apiClient.cancelEventRsvp(item.event.id, {
        idempotencyKey: `event-rsvp-cancel:${item.event.id}`,
      });
      setData((current) =>
        current
          ? {
              ...current,
              rsvps: current.rsvps.map((entry) =>
                String(entry.id) === item.id
                  ? { ...entry, status: "cancelled" }
                  : entry,
              ),
            }
          : current,
      );
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "That RSVP could not be cancelled.",
      );
    }
  }
  return <><MyEventsPresentation upcoming={upcoming} past={past} saved={saved} browseAction={<button type="button" onClick={onBrowse} className="rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950">Browse events</button>} renderAdmissionOpen={(item) => <button type="button" onClick={() => item.ticketId ? onTicket(item.ticketId) : onEvent(item.event.id)} className={eventOpenClassName}>{item.ticketId ? "View ticket" : "View event"} →</button>} renderCancel={(item) => <button type="button" onClick={() => void cancel(item)} className="text-sm font-black text-red-200">Cancel RSVP</button>} renderSavedOpen={(item) => <button type="button" onClick={() => onEvent(item.event.id)} className={savedEventOpenClassName}><SavedEventContent event={item.event} /></button>} />{error ? <p role="alert" className="fixed bottom-32 left-4 right-4 z-[100] rounded-2xl bg-red-950 p-4 text-sm font-bold text-red-100">{error}</p> : null}</>;
}
