"use client";

import { useMemo, useState } from "react";
import type { EventTicketType } from "@/lib/events/types";
import { EventRegistrationPresentation } from "@/components/events/EventRegistrationPresentation";

type Props = {
  eventId: string;
  slug: string;
  registrationMode: "rsvp" | "ticketed";
  ticketTypes: EventTicketType[];
  authenticated: boolean;
  initiallySaved: boolean;
};

export default function EventRegistrationPanel({
  eventId,
  slug,
  registrationMode,
  ticketTypes,
  authenticated,
  initiallySaved,
}: Props) {
  const [saved, setSaved] = useState(initiallySaved);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<"save" | "register" | null>(null);
  const [message, setMessage] = useState("");
  const selectedCount = useMemo(
    () => Object.values(quantities).reduce((sum, value) => sum + value, 0),
    [quantities],
  );

  function goToLogin(intent: string) {
    window.location.assign(
      `/auth/login?next=${encodeURIComponent(`/events/${slug}?intent=${intent}`)}`,
    );
  }

  async function toggleSave() {
    if (!authenticated) return goToLogin("save");
    setPending("save");
    setMessage("");
    const response = await fetch(`/api/events/${eventId}/save`, {
      method: saved ? "DELETE" : "POST",
    });
    if (response.ok) setSaved(!saved);
    else setMessage("This event could not be saved.");
    setPending(null);
  }

  async function register() {
    if (!authenticated)
      return goToLogin(registrationMode === "rsvp" ? "rsvp" : "tickets");
    if (registrationMode === "ticketed" && !selectedCount) {
      setMessage("Choose at least one ticket.");
      return;
    }
    setPending("register");
    setMessage("");
    const selected = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
    const storageKey = `vaivia:event-registration:${eventId}:${JSON.stringify(selected)}`;
    const idempotencyKey =
      sessionStorage.getItem(storageKey) || crypto.randomUUID();
    sessionStorage.setItem(storageKey, idempotencyKey);
    const response = await fetch(`/api/events/${eventId}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        registrationMode === "rsvp"
          ? { mode: "rsvp" }
          : { mode: "tickets", idempotencyKey, selections: selected },
      ),
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401 && result.loginUrl)
      return window.location.assign(result.loginUrl);
    if (!response.ok) {
      setMessage(result.error || "Registration could not be completed.");
      setPending(null);
      return;
    }
    if (result.checkoutUrl) return window.location.assign(result.checkoutUrl);
    setMessage(
      registrationMode === "rsvp"
        ? "You’re going! Your RSVP is confirmed."
        : "Your tickets are ready in My Events.",
    );
    setPending(null);
  }

  return (
    <EventRegistrationPresentation
      registrationMode={registrationMode}
      ticketTypes={ticketTypes}
      quantities={quantities}
      saved={saved}
      pending={pending}
      message={message}
      onQuantity={(ticketTypeId, quantity) =>
        setQuantities((current) => ({ ...current, [ticketTypeId]: quantity }))
      }
      onRegister={register}
      onSave={toggleSave}
    />
  );
}
