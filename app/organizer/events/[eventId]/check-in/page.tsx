import type { Metadata } from "next";
import EventCheckInClient from "@/components/events/EventCheckInClient";
import { requireEventManager } from "@/lib/events/auth";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Event check-in – VAIVIA",
  robots: { index: false, follow: false },
};
export default async function EventCheckInPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  await requireEventManager(eventId);
  const { data: event } = await createServiceRoleClient()
    .from("events")
    .select("title")
    .eq("id", eventId)
    .single();
  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white md:pl-32 md:pr-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
            Door tools
          </p>
          <h1 className="mt-2 text-4xl font-black">
            Check in · {event?.title}
          </h1>
        </header>
        <EventCheckInClient eventId={eventId} />
      </div>
    </main>
  );
}
