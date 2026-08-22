"use client";

import { useState } from "react";
import type { EventSummary } from "@/lib/events/types";
import {
  EventsIndexPresentation,
  type EventFilterValues,
} from "@/components/events/EventsIndexPresentation";
import { EventCard } from "@/components/events/EventCard";

export function EventsPageClient({
  initialValues,
  events,
  page,
  totalPages,
}: {
  initialValues: EventFilterValues;
  events: Array<EventSummary & { priceLabel: string }>;
  page: number;
  totalPages: number;
}) {
  const [values, setValues] = useState(initialValues);
  function navigate(nextPage?: number) {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(values)) {
      if (value.trim()) query.set(name, value.trim());
    }
    if (nextPage && nextPage > 1) query.set("page", String(nextPage));
    window.location.assign(`/events${query.size ? `?${query.toString()}` : ""}`);
  }
  return (
    <EventsIndexPresentation
      values={values}
      onValue={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
      onSubmit={(event) => {
        event.preventDefault();
        navigate();
      }}
      onMyEvents={() => window.location.assign("/my-events")}
      onClear={() => window.location.assign("/events")}
      cards={events.map((event) => <EventCard key={event.id} event={event} priceLabel={event.priceLabel} />)}
      page={page}
      totalPages={totalPages}
      onPage={navigate}
    />
  );
}
