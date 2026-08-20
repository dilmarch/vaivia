import type { ReactNode } from "react";
import { CalendarPlus, Check, ImageIcon, Lock, Pencil } from "lucide-react";
import {
  formatIdeaAgePolicy,
  formatIdeaAvailabilityDateRange,
  formatIdeaDayLabel,
  formatIdeaTicketPolicy,
  formatIdeaTimeLabel,
  type TripIdea,
} from "@/lib/tripIdeas";
import { addVaiviaUtmAttribution } from "@/lib/outboundLinks";

type AttendedControlProps = {
  children: ReactNode;
  className: string;
  title: string;
  "aria-label": string;
  "aria-pressed": boolean;
};

export function TripIdeaPlaceCoverPlaceholder() {
  return (
    <div className="relative h-44 overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.2),transparent_52%),linear-gradient(135deg,#172033,#03030a_70%)]">
      <div className="absolute inset-0 flex items-center justify-center">
        <ImageIcon
          className="h-10 w-10 text-lime-200/35"
          aria-hidden="true"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-slate-950/10" />
    </div>
  );
}

export function TripIdeaCardPresentation({
  idea,
  cover,
  reactionBar,
  renderAttendedControl,
  onEdit,
  onAddToItinerary,
  editDisabled = false,
  addToItineraryDisabled = false,
  showAddToItinerary = true,
}: {
  idea: TripIdea;
  cover?: ReactNode;
  reactionBar?: ReactNode;
  renderAttendedControl?: (props: AttendedControlProps) => ReactNode;
  onEdit?: () => void;
  onAddToItinerary?: () => void;
  editDisabled?: boolean;
  addToItineraryDisabled?: boolean;
  showAddToItinerary?: boolean;
}) {
  const attendedClassName = `flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
    idea.attended
      ? "border-lime-300 bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.24)]"
      : "border-white/20 bg-white/[0.04] text-transparent hover:border-lime-300/60 hover:bg-white/[0.08]"
  }`;
  const attendedContent = idea.attended ? (
    <Check className="h-4 w-4" aria-hidden="true" />
  ) : null;
  const attendedProps: AttendedControlProps = {
    children: attendedContent,
    className: attendedClassName,
    "aria-pressed": idea.attended,
    "aria-label": idea.attended
      ? `Mark ${idea.title} as not attended`
      : `Mark ${idea.title} as attended`,
    title: idea.attended ? "Attended" : "Mark attended",
  };

  return (
    <article
      className={`relative overflow-hidden rounded-[1.75rem] border shadow-2xl shadow-black/20 transition duration-300 hover:-translate-y-1 ${
        idea.is_archived
          ? "border-white/10 bg-white/[0.035] opacity-70"
          : idea.attended
            ? "border-white/10 bg-[#03030a]/70 opacity-80"
            : "border-white/10 bg-[#03030a]/90"
      }`}
    >
      {cover}
      <div className="relative p-5 pr-16">
        <button
          type="button"
          onClick={onEdit}
          disabled={editDisabled || !onEdit}
          className={`absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-slate-200 shadow-xl shadow-black/20 transition hover:border-lime-300/50 hover:bg-lime-300 hover:text-slate-950 ${
            editDisabled || !onEdit ? "cursor-not-allowed opacity-55" : ""
          }`}
          aria-label={`Edit ${idea.title}`}
          title={editDisabled || !onEdit ? "Editing unavailable" : "Edit idea"}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="flex gap-4">
          {renderAttendedControl ? (
            renderAttendedControl(attendedProps)
          ) : (
            <button
              type="button"
              disabled
              {...attendedProps}
              className={`${attendedClassName} cursor-not-allowed opacity-70`}
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-lime-300">
                {idea.category}
              </p>
              {idea.attended ? (
                <span className="rounded-full border border-lime-300/30 bg-lime-300/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-lime-100">
                  Attended
                </span>
              ) : null}
              {idea.is_archived ? (
                <span className="rounded-full border border-white/10 bg-white/[0.08] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
                  Archived
                </span>
              ) : null}
              {idea.is_private ? (
                <span className="vaivia-private-tag inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  Private
                </span>
              ) : null}
            </div>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-white">
              {idea.title}
            </h3>
            {idea.description ? (
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {idea.description}
              </p>
            ) : null}
            {idea.location_city ||
            idea.location ||
            idea.address ||
            idea.formatted_address ? (
              <p className="mt-3 text-sm font-semibold text-slate-200">
                {idea.location_city ||
                  idea.location ||
                  idea.address ||
                  idea.formatted_address}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {idea.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-xs font-semibold text-slate-200"
            >
              {tag}
            </span>
          ))}
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
            <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              Days
            </dt>
            <dd className="mt-1 text-slate-100">
              {formatIdeaDayLabel(idea.days_available)}
            </dd>
          </div>
          {idea.availability_start_date || idea.availability_end_date ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
              <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Date range
              </dt>
              <dd className="mt-1 text-slate-100">
                {formatIdeaAvailabilityDateRange(idea)}
              </dd>
            </div>
          ) : null}
          <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
            <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              Time
            </dt>
            <dd className="mt-1 text-slate-100">
              {idea.is_24_hours
                ? "24 hours"
                : formatIdeaTimeLabel(idea.time_of_day)}
            </dd>
          </div>
          {idea.ticket_policy ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
              <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Tickets
              </dt>
              <dd className="mt-1 text-slate-100">
                {formatIdeaTicketPolicy(idea.ticket_policy)}
              </dd>
            </div>
          ) : null}
          {idea.age_policy ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
              <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Age
              </dt>
              <dd className="mt-1 text-slate-100">
                {formatIdeaAgePolicy(idea.age_policy)}
              </dd>
            </div>
          ) : null}
        </dl>

        {idea.dress_code || idea.other_notes ? (
          <div className="mt-4 space-y-2 text-sm text-slate-300">
            {idea.dress_code ? (
              <p>
                <span className="font-semibold text-white">Dress code:</span>{" "}
                {idea.dress_code}
              </p>
            ) : null}
            {idea.other_notes ? (
              <p>
                <span className="font-semibold text-white">Other:</span>{" "}
                {idea.other_notes}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {showAddToItinerary ? (
            <button
              type="button"
              onClick={onAddToItinerary}
              disabled={addToItineraryDisabled || !onAddToItinerary}
              className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.2)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Add to itinerary
            </button>
          ) : null}
          {idea.location_website ? (
            <a
              href={addVaiviaUtmAttribution(idea.location_website)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-slate-200 transition hover:border-lime-300/50 hover:bg-white/10 hover:text-white"
            >
              Venue
            </a>
          ) : null}
          {idea.ticket_website ? (
            <a
              href={addVaiviaUtmAttribution(idea.ticket_website)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-lime-300 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.2)] transition hover:bg-lime-200"
            >
              Tickets
            </a>
          ) : null}
        </div>
        {reactionBar}
      </div>
    </article>
  );
}
