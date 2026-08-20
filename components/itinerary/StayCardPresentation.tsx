import type { ReactNode } from "react";

export function StayCardPresentation({
  kind,
  title,
  timeLabel,
  location,
  compact = false,
  fillHeight = false,
  actionRow,
}: {
  kind: "check_in" | "check_out";
  title: string;
  timeLabel: string;
  location?: string | null;
  compact?: boolean;
  fillHeight?: boolean;
  actionRow?: ReactNode;
}) {
  return (
    <div
      data-accommodation-hold={kind}
      className={`relative w-full overflow-hidden rounded-[1.25rem] border border-lime-300/25 border-l-[16px] border-l-lime-300 bg-lime-300/10 text-left text-white shadow-[0_18px_45px_rgba(0,0,0,0.22)] ${
        fillHeight ? "flex h-full flex-col justify-start" : ""
      }`}
    >
      <div
        className={`flex min-h-0 gap-3 ${compact ? "p-3" : "p-4"} ${
          fillHeight ? "flex-1" : ""
        }`}
      >
        <span
          className={`flex shrink-0 items-center justify-center rounded-md border border-lime-200/25 bg-lime-300/10 ${
            compact ? "h-8 w-8 text-base" : "h-10 w-10 text-xl"
          }`}
          aria-hidden="true"
        >
          🏨
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-lime-200">
            {timeLabel}
          </p>
          <h3
            className={`mt-1 font-semibold text-white ${compact ? "text-sm" : "text-base"}`}
          >
            {title}
          </h3>
          {!compact && location ? (
            <p className="mt-1 text-xs text-slate-300">{location}</p>
          ) : null}
          {!compact ? (
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-lime-200/75">
              Synced from stay details
            </p>
          ) : null}
          {actionRow ? (
            <div className={`${compact ? "mt-2" : "mt-3"} flex flex-wrap gap-2`}>
              {actionRow}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
