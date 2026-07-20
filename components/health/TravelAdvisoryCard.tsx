import {
    AlertOctagon,
    AlertTriangle,
    CheckCircle2,
    ExternalLink,
    MapPinned,
    ShieldAlert,
} from "lucide-react";

import {
    getGovernmentAdvisoryUrl,
    GOVERNMENT_ADVISORY_LEVELS,
    type GovernmentAdvisoryLevel,
    type GovernmentTravelAdvisory,
} from "@/lib/governmentTravelAdvisories";
import type { TripDestinationRecord } from "@/lib/tripDestinations";

const LEVEL_STYLES: Record<
    GovernmentAdvisoryLevel,
    {
        Icon: typeof CheckCircle2;
        badgeClassName: string;
        panelClassName: string;
    }
> = {
    0: {
        Icon: CheckCircle2,
        badgeClassName:
            "border-emerald-300/55 bg-emerald-950/70 text-emerald-100",
        panelClassName: "border-emerald-300/25",
    },
    1: {
        Icon: ShieldAlert,
        badgeClassName: "border-amber-300/55 bg-amber-950/70 text-amber-100",
        panelClassName: "border-amber-300/30",
    },
    2: {
        Icon: AlertTriangle,
        badgeClassName: "border-orange-300/60 bg-orange-950/75 text-orange-100",
        panelClassName: "border-orange-300/35",
    },
    3: {
        Icon: AlertOctagon,
        badgeClassName: "border-red-300/60 bg-red-950/75 text-red-100",
        panelClassName: "border-red-300/40",
    },
};

export function TravelAdvisoryCard({
    destination,
    advisory,
    dataRefreshedAt,
}: {
    destination: TripDestinationRecord;
    advisory: GovernmentTravelAdvisory;
    dataRefreshedAt: string;
}) {
    const level = GOVERNMENT_ADVISORY_LEVELS[advisory.advisoryLevel];
    const style = LEVEL_STYLES[advisory.advisoryLevel];
    const Icon = style.Icon;

    return (
        <article
            className={`rounded-[1.75rem] border bg-white/[0.06] p-5 shadow-2xl shadow-black/20 sm:p-7 ${style.panelClassName}`}
        >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-300">
                        {destination.label}
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-white">
                        {advisory.countryName}
                    </h2>
                </div>
                <div
                    className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-xs font-black ${style.badgeClassName}`}
                    aria-label={`Travel advisory: ${level.label}`}
                >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {level.shortLabel}
                </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.05] p-4 sm:p-5">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    Official advisory
                </p>
                <p className="mt-2 text-lg font-black leading-7 text-white">
                    {advisory.advisoryText}
                </p>
                {advisory.hasRegionalAdvisory ? (
                    <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-sky-300/35 bg-sky-950/65 px-3 py-1.5 text-xs font-black text-sky-100">
                        <MapPinned className="h-4 w-4" aria-hidden="true" />
                        Includes regional advisories
                    </p>
                ) : null}
            </div>

            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                <div>
                    <dt className="font-black uppercase tracking-[0.12em] text-slate-400">
                        Latest update
                    </dt>
                    <dd className="mt-1 font-semibold leading-6 text-slate-100">
                        {advisory.latestUpdateDescription}
                    </dd>
                    {advisory.latestUpdateType ? (
                        <dd className="mt-1 text-xs font-bold text-slate-400">
                            {advisory.latestUpdateType}
                        </dd>
                    ) : null}
                </div>
                <div>
                    <dt className="font-black uppercase tracking-[0.12em] text-slate-400">
                        Government publication date
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-100">
                        <time dateTime={advisory.publishedAt}>
                            {advisory.publishedDescription}
                        </time>
                    </dd>
                </div>
                <div>
                    <dt className="font-black uppercase tracking-[0.12em] text-slate-400">
                        Data refresh
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-100">
                        <time dateTime={dataRefreshedAt}>
                            {new Intl.DateTimeFormat("en-CA", {
                                dateStyle: "medium",
                                timeStyle: "short",
                                timeZone: "UTC",
                            }).format(new Date(dataRefreshedAt))}{" "}
                            UTC
                        </time>
                    </dd>
                </div>
            </dl>

            <a
                href={getGovernmentAdvisoryUrl(advisory)}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-lime-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-200 focus:ring-offset-2 focus:ring-offset-[#0c0115]"
            >
                Review official advisory
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
        </article>
    );
}

export function AdvisoryDestinationStatusCard({
    destination,
    status,
}: {
    destination: TripDestinationRecord;
    status: "missing_country_code" | "no_matching_record";
}) {
    return (
        <article className="rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/15 sm:p-6">
            <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-300/20 bg-slate-800/70 text-slate-100">
                    <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                    <h2 className="text-xl font-black text-white">
                        {destination.label}
                    </h2>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                        {status === "missing_country_code"
                            ? "Choose this destination again from the Google location list so VAIVIA can save its country code and match an official advisory."
                            : `No Government of Canada advisory record currently matches country code ${destination.countryCode}.`}
                    </p>
                </div>
            </div>
        </article>
    );
}
