import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EventAttendeeTablePresentation,
  EventCreateActionPresentation,
  EventOperationsListPresentation,
  EventOperationsStatsPresentation,
} from "@/components/events/EventOperationsPresentation";
import type {
  EventOperationsDetail,
  EventOperationsListItem,
} from "@/lib/events/operationsContracts";
import type { MobileApiClient } from "../lib/apiClient";
import { ScreenMessage } from "../components/ScreenMessage";

export function EventOperationsListScreen({
  apiClient,
  onEvent,
  onPublicEvent,
}: {
  apiClient: MobileApiClient;
  onEvent: (eventId: string) => void;
  onPublicEvent: (eventId: string) => void;
}) {
  const [events, setEvents] = useState<EventOperationsListItem[] | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void apiClient
      .getManagedEvents(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setEvents(result.events);
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Managed events could not be loaded.",
          );
        }
      });
    return () => controller.abort();
  }, [apiClient, reloadKey]);

  if (!events) {
    return (
      <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white">
        <ScreenMessage
          title={error ? "Event operations are unavailable" : "Loading events"}
          message={error || "Finding the events you can manage."}
          actionLabel={error ? "Try again" : undefined}
          onAction={error ? () => setReloadKey((value) => value + 1) : undefined}
        />
      </main>
    );
  }

  return (
    <EventOperationsListPresentation
      events={events}
      createAction={
        <EventCreateActionPresentation
          renderAction={(props) => (
            <button
              type="button"
              disabled
              title="Event creation remains available on the web app"
              {...props}
              className={`${props.className} cursor-not-allowed opacity-50`}
            />
          )}
        />
      }
      renderManageAction={(event) => (
        <button
          type="button"
          onClick={() => onEvent(event.id)}
          className="rounded-full border border-white/15 px-4 py-2 text-sm font-black"
        >
          Door tools
        </button>
      )}
      renderPublicAction={(event) => (
        <button
          type="button"
          onClick={() => onPublicEvent(event.id)}
          className="rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950"
        >
          Public page
        </button>
      )}
    />
  );
}

export function EventOperationsDetailScreen({
  apiClient,
  eventId,
  onBack,
  onCheckIn,
}: {
  apiClient: MobileApiClient;
  eventId: string;
  onBack: () => void;
  onCheckIn: () => void;
}) {
  const [data, setData] = useState<EventOperationsDetail | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [pendingTicketId, setPendingTicketId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await apiClient.getManagedEvent(eventId, signal);
      if (!signal?.aborted) {
        setData(result);
        setError("");
      }
    },
    [apiClient, eventId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Event operations could not be loaded.",
        );
      }
    });
    return () => controller.abort();
  }, [load, reloadKey]);

  const attendees = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.attendees || []).filter(
      (attendee) =>
        (!normalized ||
          `${attendee.name} ${attendee.email} ${attendee.ticketNumber || ""}`
            .toLowerCase()
            .includes(normalized)) &&
        (!status || attendee.status === status),
    );
  }, [data?.attendees, query, status]);

  async function undo(ticketId: string) {
    if (pendingTicketId) return;
    setPendingTicketId(ticketId);
    try {
      await apiClient.undoEventCheckIn(eventId, ticketId, {
        idempotencyKey: `undo-check-in:${eventId}:${ticketId}`,
      });
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The check-in could not be undone.",
      );
    } finally {
      setPendingTicketId(null);
    }
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white">
        <ScreenMessage
          title={error ? "Event operations are unavailable" : "Loading door tools"}
          message={error || "Loading attendee and ticket information."}
          actionLabel={error ? "Try again" : undefined}
          onAction={error ? () => setReloadKey((value) => value + 1) : undefined}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[2.5rem] border border-white/10 bg-[#080511] p-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
            Door operations · {data.event.status}
          </p>
          <h1 className="mt-3 text-4xl font-black">{data.event.title}</h1>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onBack}
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-black"
            >
              Back to events
            </button>
            <button
              type="button"
              onClick={onCheckIn}
              className="rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950"
            >
              Open check-in
            </button>
          </div>
        </header>
        <EventOperationsStatsPresentation {...data.stats} />
        {error ? (
          <p role="alert" className="rounded-2xl border border-red-300/25 bg-red-300/10 p-4 text-sm font-bold text-red-100">
            {error}
          </p>
        ) : null}
        <section>
          <div className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-[#080511] p-4 sm:grid-cols-[1fr_12rem]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, or ticket"
              aria-label="Search attendees"
              className="h-11 rounded-xl border border-white/15 bg-slate-950 px-3 text-sm font-bold text-white"
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter attendee status"
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
          </div>
          <div className="mt-5">
            <EventAttendeeTablePresentation
              attendees={attendees}
              showTicketNumber
              showEmptyState
              renderUndoAction={(attendee) => (
                <button
                  type="button"
                  disabled={Boolean(pendingTicketId)}
                  onClick={() => attendee.ticketId && void undo(attendee.ticketId)}
                  className="text-xs font-black text-red-200 disabled:opacity-50"
                >
                  {pendingTicketId === attendee.ticketId
                    ? "Undoing…"
                    : "Undo check-in"}
                </button>
              )}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
