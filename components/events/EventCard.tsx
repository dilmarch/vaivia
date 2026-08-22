import Image from "next/image";
import Link from "next/link";
import type { EventSummary } from "@/lib/events/types";
import { EventCardPresentation } from "@/components/events/EventCardPresentation";

export function EventCard({
  event,
  priceLabel,
}: {
  event: EventSummary;
  priceLabel?: string;
}) {
  return (
    <EventCardPresentation
      event={event}
      priceLabel={priceLabel}
      image={
        event.coverImageUrl ? (
          <Image
            src={event.coverImageUrl}
            alt={event.cover_image_alt || ""}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : undefined
      }
      renderAction={(content, className) => (
        <Link href={`/events/${event.slug}`} className={className}>
          {content}
        </Link>
      )}
    />
  );
}
