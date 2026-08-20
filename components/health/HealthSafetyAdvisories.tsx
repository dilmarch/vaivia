import { AlertTriangle, DatabaseZap, ShieldCheck } from "lucide-react";

import {
    matchGovernmentAdvisory,
    type GovernmentTravelAdvisoryResult,
} from "@/lib/governmentTravelAdvisoryShared";
import type { TripDestinationRecord } from "@/lib/tripDestinations";
import {
    AdvisoryDestinationStatusCard,
    TravelAdvisoryCard,
} from "@/components/health/TravelAdvisoryCard";

const LICENCE_URL =
    "https://open.canada.ca/en/open-government-licence-canada";
const DATASET_URL =
    "https://open.canada.ca/data/en/dataset/bef2ebb3-ca9a-485f-aaff-5dc36eb89426";

export function HealthSafetyHeroSummaryPresentation() {
    return (
        <div className="flex h-30 w-28 flex-col items-center justify-start gap-2 rounded-[1.25rem] border border-white/10 bg-white/[0.06] px-3 py-3 shadow-xl shadow-black/20 sm:h-32 sm:w-32">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950/70 text-lime-200 ring-1 ring-lime-300/25 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.16)] sm:h-12 sm:w-12">
                <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="text-center text-xs font-black leading-tight text-slate-300">
                Official guidance
            </div>
        </div>
    );
}

export function HealthSafetyLoadingPresentation() {
    return (
        <div
            className="mx-auto w-full max-w-6xl px-4 pb-28 pt-8 sm:px-6 md:pb-12 md:pl-24 lg:px-8"
            role="status"
            aria-label="Loading Health & Safety"
        >
            <div className="h-44 animate-pulse rounded-[2rem] border border-white/10 bg-white/[0.05] motion-reduce:animate-none" />
            <div className="mt-6 space-y-5">
                {Array.from({ length: 2 }, (_, index) => (
                    <div
                        key={index}
                        className="h-80 animate-pulse rounded-[1.75rem] border border-white/10 bg-white/[0.06] motion-reduce:animate-none"
                    />
                ))}
            </div>
            <div className="mt-8 h-40 animate-pulse rounded-[1.75rem] border border-white/10 bg-white/[0.05] motion-reduce:animate-none" />
        </div>
    );
}

export default function HealthSafetyAdvisories({
    destinations,
    advisoryResult,
}: {
    destinations: TripDestinationRecord[];
    advisoryResult: GovernmentTravelAdvisoryResult;
}) {
    return (
        <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-8 sm:px-6 md:pb-12 md:pl-24 lg:px-8">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 shadow-2xl shadow-black/20 sm:p-7">
                <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-lime-300/30 bg-lime-300/10 text-lime-200">
                        <ShieldCheck className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-lime-300">
                            Government travel guidance
                        </p>
                        <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">
                            Health &amp; Safety
                        </h1>
                        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
                            Advisories can change quickly. Review the official source
                            before travelling.
                        </p>
                    </div>
                </div>
            </section>

            <div className="mt-6 space-y-5">
                {destinations.length === 0 ? (
                    <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-6 text-slate-200">
                        <p className="font-black text-white">No destinations yet</p>
                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                            Add a Google-validated destination to this trip to see its
                            official travel advisory.
                        </p>
                    </div>
                ) : !advisoryResult.ok ? (
                    <div
                        role="status"
                        className="rounded-[1.75rem] border border-amber-300/30 bg-amber-950/45 p-6"
                    >
                        <div className="flex items-start gap-3">
                            <DatabaseZap
                                className="mt-0.5 h-6 w-6 shrink-0 text-amber-200"
                                aria-hidden="true"
                            />
                            <div>
                                <p className="font-black text-amber-100">
                                    Travel advisories are temporarily unavailable
                                </p>
                                <p className="mt-2 text-sm font-semibold leading-6 text-amber-50/80">
                                    Your trip is still available. Review the official
                                    Government of Canada travel site before travelling.
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    destinations.map((destination) => {
                        if (!destination.countryCode) {
                            return (
                                <AdvisoryDestinationStatusCard
                                    key={destination.id || destination.sortOrder}
                                    destination={destination}
                                    status="missing_country_code"
                                />
                            );
                        }

                        const advisory = matchGovernmentAdvisory(
                            advisoryResult.dataset,
                            destination.countryCode
                        );
                        return advisory ? (
                            <TravelAdvisoryCard
                                key={destination.id || destination.sortOrder}
                                destination={destination}
                                advisory={advisory}
                                dataRefreshedAt={advisoryResult.dataset.fetchedAt}
                            />
                        ) : (
                            <AdvisoryDestinationStatusCard
                                key={destination.id || destination.sortOrder}
                                destination={destination}
                                status="no_matching_record"
                            />
                        );
                    })
                )}
            </div>

            <aside className="mt-8 rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-5 text-sm font-semibold leading-6 text-slate-300 sm:p-6">
                <div className="flex items-start gap-3">
                    <AlertTriangle
                        className="mt-0.5 h-5 w-5 shrink-0 text-lime-200"
                        aria-hidden="true"
                    />
                    <div className="space-y-2">
                        <p>
                            Source:{" "}
                            <a
                                href={DATASET_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="font-black text-lime-200 underline decoration-lime-300/40 underline-offset-4 hover:text-lime-100"
                            >
                                Government of Canada
                            </a>
                        </p>
                        <p>
                            Contains information licensed under the{" "}
                            <a
                                href={LICENCE_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="font-black text-lime-200 underline decoration-lime-300/40 underline-offset-4 hover:text-lime-100"
                            >
                                Open Government Licence – Canada
                            </a>
                            .
                        </p>
                        <p>
                            VAIVIA is not affiliated with or endorsed by the Government
                            of Canada.
                        </p>
                    </div>
                </div>
            </aside>
        </div>
    );
}
