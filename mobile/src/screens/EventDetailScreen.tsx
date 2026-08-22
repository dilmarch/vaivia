/* eslint-disable @next/next/no-img-element -- Capacitor renders local WebView markup without next/image. */
import { useEffect, useMemo, useState } from "react";
import { Browser } from "@capacitor/browser";
import { EventDetailPresentation } from "@/components/events/EventDetailPresentation";
import { EventRegistrationPresentation } from "@/components/events/EventRegistrationPresentation";
import type { MobileEventDetailResponse } from "@/lib/mobileApi/contracts";
import { ScreenMessage } from "../components/ScreenMessage";
import type { MobileApiClient } from "../lib/apiClient";

export function EventDetailScreen({ apiClient, eventId, onCheckout, onMyEvents }: { apiClient: MobileApiClient; eventId: string; onCheckout: (orderId: string, result?: "pending" | "success" | "cancelled") => void; onMyEvents: () => void }) {
  const [data, setData] = useState<MobileEventDetailResponse | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<"save" | "register" | null>(null);
  const [message, setMessage] = useState("");
  const selectedCount = useMemo(() => Object.values(quantities).reduce((sum, value) => sum + value, 0), [quantities]);
  useEffect(() => {
    const controller = new AbortController();
    void apiClient.getEvent(eventId, controller.signal).then((result) => { if (!controller.signal.aborted) setData(result); }).catch((reason: unknown) => { if (!controller.signal.aborted) setMessage(reason instanceof Error ? reason.message : "Could not load this event."); });
    return () => controller.abort();
  }, [apiClient, eventId]);
  if (!data) return <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white"><ScreenMessage title={message ? "Event unavailable" : "Loading event"} message={message || "Getting event details ready."} /></main>;
  const event = data.event;
  async function toggleSave() {
    setPending("save"); setMessage("");
    try { const result = await apiClient.setEventSaved(event.id, !data!.saved, { idempotencyKey: `event-save:${event.id}:${!data!.saved}` }); setData((current) => current ? { ...current, saved: result.saved } : current); } catch (error) { setMessage(error instanceof Error ? error.message : "This event could not be saved."); } finally { setPending(null); }
  }
  async function register() {
    if (event.registration_mode === "ticketed" && !selectedCount) { setMessage("Choose at least one ticket."); return; }
    setPending("register"); setMessage("");
    const selections = Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
    const idempotencyKey = crypto.randomUUID();
    try {
      const result = await apiClient.registerEvent(event.id, event.registration_mode === "rsvp" ? { mode: "rsvp" } : { mode: "tickets", idempotencyKey, selections }, { idempotencyKey });
      if (result.mode === "paid") {
        onCheckout(result.orderId, "pending");
        await Browser.open({
          url: result.checkoutUrl,
          presentationStyle: "popover",
        });
        return;
      }
      setMessage(result.mode === "rsvp" ? "You’re going! Your RSVP is confirmed." : "Your tickets are ready in My Events.");
      if (result.mode === "free") onMyEvents();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Registration could not be completed."); } finally { setPending(null); }
  }
  return <EventDetailPresentation event={event} cover={event.coverImageUrl ? <img src={event.coverImageUrl} alt={event.cover_image_alt || ""} className="absolute inset-0 h-full w-full object-cover" /> : undefined} registration={<EventRegistrationPresentation registrationMode={event.registration_mode} ticketTypes={data.ticketTypes} quantities={quantities} saved={data.saved} pending={pending} message={message} onQuantity={(ticketTypeId, quantity) => setQuantities((current) => ({ ...current, [ticketTypeId]: quantity }))} onRegister={() => void register()} onSave={() => void toggleSave()} />} />;
}
