import type { ReactNode } from "react";
import { Inbox, MailPlus } from "lucide-react";
import {
  formatImportConfidence,
  formatImportDate,
  getTravelEmailImportStatusClasses,
  getTravelEmailImportStatusLabel,
} from "@/lib/travelEmailImports";

export type TravelImportPresentationItem = {
  id: string;
  createdAt: string;
  subject: string;
  senderEmail: string;
  status: string;
  importType: string;
  confidence: number | null;
  itemCount: number;
  firstItemLabel?: string;
  matchedTripTitle?: string | null;
};

type ActionProps = {
  className: string;
  children: ReactNode;
  "aria-label"?: string;
};

export function TravelImportsPresentation({
  imports,
  isLoading = false,
  error = "",
  renderSettingsAction,
  renderImportAction,
  renderRetryAction,
  safeAreaHandledExternally = false,
}: {
  imports: TravelImportPresentationItem[];
  isLoading?: boolean;
  error?: string;
  renderSettingsAction: (props: ActionProps) => ReactNode;
  renderImportAction: (
    item: TravelImportPresentationItem,
    props: ActionProps,
  ) => ReactNode;
  renderRetryAction?: (props: ActionProps) => ReactNode;
  safeAreaHandledExternally?: boolean;
}) {
  return (
    <main
      className={`min-h-screen bg-[#0c0115] px-4 pb-10 text-white md:py-10 md:pl-28 ${safeAreaHandledExternally ? "pt-28" : "pt-[calc(8rem+var(--safe-area-top))]"}`}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[2rem] border border-white/10 bg-[#03030a]/90 p-6 shadow-2xl shadow-black/30">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                Imports
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight">
                Travel imports
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
                Forward confirmations and receipts to VAIVIA, then review the
                prepared details before adding them to a trip.
              </p>
            </div>
            {renderSettingsAction({
              className:
                "rounded-full border border-lime-300/25 bg-lime-300/10 px-4 py-2 text-sm font-black text-lime-100 transition hover:bg-lime-300/20",
              children: "Email Import Settings",
            })}
          </div>
        </section>
        {isLoading ? (
          <section
            className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center"
            aria-busy="true"
          >
            <p className="font-black">Loading travel imports…</p>
          </section>
        ) : error ? (
          <section
            className="rounded-[2rem] border border-red-300/20 bg-red-400/10 p-8 text-center"
            role="alert"
          >
            <p className="font-black">Travel imports are unavailable.</p>
            <p className="mt-2 text-sm text-slate-300">{error}</p>
            {renderRetryAction
              ? renderRetryAction({
                  className:
                    "mt-4 rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950",
                  children: "Try again",
                })
              : null}
          </section>
        ) : imports.length ? (
          <section className="grid gap-4">
            {imports.map((item) => (
              <article
                key={item.id}
                className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20"
              >
                <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${getTravelEmailImportStatusClasses(item.status)}`}
                      >
                        {getTravelEmailImportStatusLabel(item.status)}
                      </span>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-300">
                        {item.importType || "Unknown"}
                      </span>
                    </div>
                    <h2 className="mt-3 truncate text-2xl font-black">
                      {item.subject || "Forwarded confirmation"}
                    </h2>
                    <p className="mt-1 text-sm font-semibold text-slate-400">
                      {item.senderEmail || "Unknown sender"} ·{" "}
                      {formatImportDate(item.createdAt)}
                    </p>
                    {item.matchedTripTitle ? (
                      <p className="mt-2 text-sm font-black text-lime-100">
                        Added to {item.matchedTripTitle}
                      </p>
                    ) : null}
                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                          Prepared
                        </p>
                        <p className="mt-1 font-black text-white">
                          {item.itemCount} item{item.itemCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                          Confidence
                        </p>
                        <p className="mt-1 font-black text-white">
                          {formatImportConfidence(item.confidence)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                          First item
                        </p>
                        <p className="mt-1 truncate font-black text-white">
                          {item.firstItemLabel || "Not prepared yet"}
                        </p>
                      </div>
                    </div>
                  </div>
                  {renderImportAction(item, {
                    className:
                      "inline-flex h-11 items-center justify-center rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950 transition hover:bg-lime-200",
                    children:
                      item.status === "imported"
                        ? "View trip"
                        : "Review import",
                  })}
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="rounded-[2rem] border border-dashed border-white/15 bg-white/[0.04] p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-lime-300/25 bg-lime-300/10 text-lime-200">
              <MailPlus className="h-7 w-7" aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-2xl font-black">No travel imports yet</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-6 text-slate-400">
              Forward airline confirmations and receipts to your private VAIVIA
              email address. They&apos;ll appear here when they&apos;re ready to
              review.
            </p>
          </section>
        )}
        {imports.length ? (
          <section className="rounded-[2rem] border border-lime-300/15 bg-lime-300/10 p-5">
            <div className="flex gap-3">
              <Inbox
                className="mt-1 h-5 w-5 shrink-0 text-lime-200"
                aria-hidden="true"
              />
              <p className="text-sm font-semibold leading-6 text-lime-50">
                Flight imports can be reviewed and added to trips. Other
                imported travel details remain review-only.
              </p>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
