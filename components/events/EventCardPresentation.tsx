import type { ReactNode } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import { eventLocationLabel, formatEventDateTime } from "@/lib/events/format";
import type { EventSummary } from "@/lib/events/types";

export function EventCardPresentation({
  event,
  priceLabel,
  image,
  renderAction,
}: {
  event: EventSummary;
  priceLabel?: string;
  image?: ReactNode;
  renderAction: (content: ReactNode, className: string) => ReactNode;
}) {
  const content = (
    <>
      <div className="relative aspect-[16/9] overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.3),transparent_50%),linear-gradient(135deg,#29103d,#05030a)]">
        {image || (
          <div className="flex h-full items-center justify-center text-5xl font-black text-lime-300/70">
            V
          </div>
        )}
        {event.category ? (
          <span className="absolute left-4 top-4 rounded-full border border-white/15 bg-slate-950/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-lime-200 backdrop-blur">
            {event.category}
          </span>
        ) : null}
      </div>
      <div className="p-5">
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-lime-200">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          {formatEventDateTime(event.starts_at, event.timezone)}
        </p>
        <h2 className="mt-3 text-2xl font-black leading-tight text-white">
          {event.title}
        </h2>
        {event.short_summary ? (
          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-400">
            {event.short_summary}
          </p>
        ) : null}
        <div className="mt-5 flex items-end justify-between gap-3 border-t border-white/10 pt-4">
          <p className="flex min-w-0 items-center gap-2 truncate text-sm font-bold text-slate-300">
            <MapPin className="h-4 w-4 shrink-0 text-lime-300" aria-hidden="true" />
            {eventLocationLabel(event)}
          </p>
          <span className="shrink-0 text-sm font-black text-white">
            {priceLabel ||
              (event.registration_mode === "rsvp" ? "RSVP" : "Tickets")}
          </span>
        </div>
      </div>
    </>
  );
  return (
    <article className="group overflow-hidden rounded-[2rem] border border-white/10 bg-[#080511]/90 shadow-2xl shadow-black/30 transition hover:-translate-y-1 hover:border-lime-300/35">
      {renderAction(
        content,
        "block focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-300",
      )}
    </article>
  );
}
