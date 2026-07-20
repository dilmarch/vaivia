import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { requireEventManager } from "@/lib/events/auth";
import { getManagedEvent } from "@/lib/events/data";
import { eventLocationLabel, formatEventDateTime } from "@/lib/events/format";

export const metadata: Metadata = {
  title: "Preview event – VAIVIA",
  robots: { index: false, follow: false },
};

export default async function EventPreviewPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  await requireEventManager(eventId);
  const { event } = await getManagedEvent(eventId);
  if (!event) notFound();
  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white md:pl-32 md:pr-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-lime-300/20 bg-lime-300/[0.08] p-4">
          <p className="text-sm font-black text-lime-100">
            Organizer preview · not public
          </p>
          <Link
            href={`/organizer/events/${eventId}/edit`}
            className="text-sm font-black text-lime-200"
          >
            Back to editor →
          </Link>
        </div>
        <article className="rounded-[2.5rem] border border-white/10 bg-[#080511] p-7 shadow-2xl sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
            {event.category || "VAIVIA Event"}
          </p>
          <h1 className="mt-3 text-4xl font-black sm:text-6xl">
            {event.title}
          </h1>
          {event.short_summary ? (
            <p className="mt-4 text-lg font-semibold leading-8 text-slate-300">
              {event.short_summary}
            </p>
          ) : null}
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <CalendarDays className="h-5 w-5 text-lime-300" />
              <p className="mt-2 font-black">
                {formatEventDateTime(event.starts_at, event.timezone)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <MapPin className="h-5 w-5 text-lime-300" />
              <p className="mt-2 font-black">{eventLocationLabel(event)}</p>
            </div>
          </div>
          <section className="mt-8 border-t border-white/10 pt-7">
            <h2 className="text-2xl font-black">About this event</h2>
            <div className="mt-4 whitespace-pre-wrap font-semibold leading-8 text-slate-300">
              {event.description || "More details are coming soon."}
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}
