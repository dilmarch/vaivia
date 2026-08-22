import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import EventRegistrationPanel from "@/components/events/EventRegistrationPanel";
import { EventDetailPresentation } from "@/components/events/EventDetailPresentation";
import { getPublicEventBySlug } from "@/lib/events/data";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/appUrl";

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
  const eventUrl = `${getAppUrl()}/events/${encodeURIComponent(slug)}`;

  return {
    title: `${result.event.title} – VAIVIA Events`,
    description: result.event.short_summary || undefined,
    alternates: { canonical: eventUrl },
    openGraph: {
      title: result.event.title,
      description: result.event.short_summary || undefined,
      url: eventUrl,
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
    <EventDetailPresentation
      event={event}
      cover={
        event.coverImageUrl ? (
          <Image
            src={event.coverImageUrl}
            alt={event.cover_image_alt || ""}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        ) : undefined
      }
      registration={
        <EventRegistrationPanel
          eventId={event.id}
          slug={event.slug}
          registrationMode={event.registration_mode}
          ticketTypes={result.ticketTypes}
          authenticated={Boolean(user)}
          initiallySaved={Boolean(saved)}
        />
      }
    />
  );
}
