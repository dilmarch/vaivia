import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CalendarDays, Clock3, MapPin, ShieldCheck } from "lucide-react";
import EventRegistrationPanel from "@/components/events/EventRegistrationPanel";
import { getPublicEventBySlug } from "@/lib/events/data";
import { eventLocationLabel, formatEventDateTime } from "@/lib/events/format";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicEventBySlug(slug);
  if (!result)
    return {
      title: "Event not found – VAIVIA",
      robots: { index: false, follow: false },
    };
  return {
    title: `${result.event.title} – VAIVIA Events`,
    description: result.event.short_summary || undefined,
    openGraph: {
      title: result.event.title,
      description: result.event.short_summary || undefined,
      images: result.event.coverImageUrl
        ? [
            {
              url: result.event.coverImageUrl,
              alt: result.event.cover_image_alt || result.event.title,
            },
          ]
        : undefined,
      type: "website",
    },
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getPublicEventBySlug(slug);
  if (!result) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: saved } = user
    ? await supabase
        .from("saved_events")
        .select("id")
        .eq("event_id", result.event.id)
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };
  const event = result.event;
  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-[calc(6.5rem+var(--safe-area-top))] text-white md:pl-32 md:pr-8 md:pt-24">
      <div className="mx-auto max-w-7xl">
        <div className="relative aspect-[16/8] min-h-64 overflow-hidden rounded-[2.5rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.3),transparent_45%),#080511] shadow-2xl shadow-black/45">
          {event.coverImageUrl ? (
            <Image
              src={event.coverImageUrl}
              alt={event.cover_image_alt || ""}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c0115] via-transparent to-transparent" />
        </div>
        <div className="relative z-10 -mt-20 grid gap-7 px-2 lg:grid-cols-[minmax(0,1fr)_23rem] lg:px-7">
          <article className="rounded-[2.25rem] border border-white/10 bg-[#080511]/95 p-6 shadow-2xl shadow-black/40 sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
              {event.category || "VAIVIA Event"}
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">
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
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  Event time · {event.timezone}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <MapPin className="h-5 w-5 text-lime-300" />
                <p className="mt-2 font-black">{eventLocationLabel(event)}</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  {event.venue_type === "online"
                    ? "Access shared after registration"
                    : [event.city, event.region, event.country]
                        .filter(Boolean)
                        .join(", ")}
                </p>
              </div>
            </div>
            <section className="mt-8 border-t border-white/10 pt-7">
              <h2 className="text-2xl font-black">About this event</h2>
              <div className="mt-4 whitespace-pre-wrap text-base font-semibold leading-8 text-slate-300">
                {event.description || "More details are coming soon."}
              </div>
            </section>
            {event.accessibility_info ||
            event.age_restriction ||
            event.attendee_notes ? (
              <section className="mt-8 rounded-[1.75rem] border border-lime-300/15 bg-lime-300/[0.06] p-5">
                <h2 className="flex items-center gap-2 text-lg font-black">
                  <ShieldCheck className="h-5 w-5 text-lime-300" />
                  Plan your visit
                </h2>
                {event.accessibility_info ? (
                  <p className="mt-3 text-sm font-semibold text-slate-300">
                    <strong className="text-white">Accessibility:</strong>{" "}
                    {event.accessibility_info}
                  </p>
                ) : null}
                {event.age_restriction ? (
                  <p className="mt-2 text-sm font-semibold text-slate-300">
                    <strong className="text-white">Age:</strong>{" "}
                    {event.age_restriction}
                  </p>
                ) : null}
                {event.attendee_notes ? (
                  <p className="mt-2 text-sm font-semibold text-slate-300">
                    {event.attendee_notes}
                  </p>
                ) : null}
              </section>
            ) : null}
            {event.refund_policy ? (
              <section className="mt-7 border-t border-white/10 pt-6">
                <h2 className="flex items-center gap-2 text-lg font-black">
                  <Clock3 className="h-5 w-5 text-lime-300" />
                  Cancellation policy
                </h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
                  {event.refund_policy}
                </p>
              </section>
            ) : null}
          </article>
          <EventRegistrationPanel
            eventId={event.id}
            slug={event.slug}
            registrationMode={event.registration_mode}
            ticketTypes={result.ticketTypes}
            authenticated={Boolean(user)}
            initiallySaved={Boolean(saved)}
          />
        </div>
      </div>
    </main>
  );
}
