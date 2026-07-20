import type { Metadata } from "next";
import TicketTierManager from "@/components/events/TicketTierManager";
import { requireEventManager } from "@/lib/events/auth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { EventTicketType } from "@/lib/events/types";

export const metadata: Metadata = { title: "Event tickets – VAIVIA" };
export default async function EventTicketsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  await requireEventManager(eventId);
  const service = createServiceRoleClient();
  const [{ data: event }, { data: tiers }] = await Promise.all([
    service
      .from("events")
      .select("title,registration_mode")
      .eq("id", eventId)
      .single(),
    service
      .from("event_ticket_types")
      .select("*")
      .eq("event_id", eventId)
      .order("display_order"),
  ]);
  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white md:pl-32 md:pr-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
            Ticketing
          </p>
          <h1 className="mt-2 text-4xl font-black">{event?.title}</h1>
        </header>
        {event?.registration_mode === "ticketed" ? (
          <TicketTierManager
            eventId={eventId}
            tiers={(tiers || []) as unknown as EventTicketType[]}
          />
        ) : (
          <p className="rounded-[2rem] border border-white/10 bg-[#080511] p-7 font-semibold text-slate-300">
            This is an RSVP-only event. Change its registration mode in the
            editor to configure ticket tiers.
          </p>
        )}
      </div>
    </main>
  );
}
