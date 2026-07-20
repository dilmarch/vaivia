import type { Metadata } from "next";
import { TZDate } from "@date-fns/tz";
import OrganizerEventEditor from "@/components/events/OrganizerEventEditor";
import { requireEventManager } from "@/lib/events/auth";
import { getManagedEvent } from "@/lib/events/data";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Edit event – VAIVIA" };

function localInput(value: string | null, timezone: string) {
  if (!value) return "";
  const date = new TZDate(value, timezone);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  await requireEventManager(eventId);
  const data = await getManagedEvent(eventId);
  if (!data.event) notFound();
  const event = {
    ...data.event,
    starts_at_local: localInput(data.event.starts_at, data.event.timezone),
    ends_at_local: localInput(data.event.ends_at, data.event.timezone),
    publish_at_local: localInput(data.event.publish_at, data.event.timezone),
  };
  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white md:pl-32 md:pr-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
            Organizer studio
          </p>
          <h1 className="mt-2 text-4xl font-black">Edit {data.event.title}</h1>
        </header>
        <OrganizerEventEditor
          event={event}
          privateDetails={data.privateDetails}
        />
      </div>
    </main>
  );
}
