/* eslint-disable @next/next/no-img-element -- Capacitor renders local WebView markup without next/image. */
import { useCallback, useEffect, useState } from "react";
import { EventCardPresentation } from "@/components/events/EventCardPresentation";
import {
  EventsIndexPresentation,
  type EventFilterValues,
} from "@/components/events/EventsIndexPresentation";
import type { MobileEventsResponse } from "@/lib/mobileApi/contracts";
import { ScreenMessage } from "../components/ScreenMessage";
import type { MobileApiClient } from "../lib/apiClient";

const EMPTY_FILTERS: EventFilterValues = { q: "", city: "", category: "", from: "", to: "", price: "" };

export function EventsScreen({ apiClient, onEvent, onMyEvents }: { apiClient: MobileApiClient; onEvent: (eventId: string) => void; onMyEvents: () => void }) {
  const [values, setValues] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MobileEventsResponse | null>(null);
  const [error, setError] = useState("");
  const load = useCallback((signal: AbortSignal) => apiClient.getEvents({ ...applied, page }, signal), [apiClient, applied, page]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void load(controller.signal).then((result) => { if (!controller.signal.aborted) setData(result); }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load events."); });
    return () => controller.abort();
  }, [load]);
  if (!data) return <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white">{error ? <ScreenMessage title="Events are unavailable" message={error} actionLabel="Try again" onAction={() => setApplied({ ...applied })} /> : <ScreenMessage title="Finding events" message="Loading upcoming VAIVIA experiences." />}</main>;
  return <EventsIndexPresentation
    values={values}
    onValue={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
    onSubmit={(event) => { event.preventDefault(); setPage(1); setApplied(values); }}
    onMyEvents={onMyEvents}
    onClear={() => { setValues(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); setPage(1); }}
    cards={data.events.map((item) => <EventCardPresentation key={item.id} event={item} priceLabel={item.priceLabel} image={item.coverImageUrl ? <img src={item.coverImageUrl} alt={item.cover_image_alt || ""} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /> : undefined} renderAction={(content, className) => <button type="button" onClick={() => onEvent(item.id)} className={`${className} w-full text-left`}>{content}</button>} />)}
    page={data.page}
    totalPages={data.totalPages}
    onPage={setPage}
  />;
}
