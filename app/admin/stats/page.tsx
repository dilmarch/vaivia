import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
    Activity,
    BarChart3,
    BellRing,
    Gauge,
    LineChart,
    MapPin,
    MousePointerClick,
    TrendingUp,
    UsersRound,
} from "lucide-react";
import AdminStatsRefreshButton from "@/components/admin/AdminStatsRefreshButton";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
    title: "Stats - VAIVIA Admin",
};

type AdminStatsRpc = {
    generatedAt: string | null;
    definitions: {
        timezone: string;
        dau: string;
        wau: string;
        mau: string;
        activated: string;
    };
    users: {
        total: number;
        new30d: number;
        dau: number;
        wau: number;
        mau: number;
        activated: number;
        activationRate: number;
        zeroTrips: number;
    };
    retention: {
        d1: number | null;
        d7: number | null;
        d30: number | null;
        eligible: {
            d1: number;
            d7: number;
            d30: number;
        };
    };
    monthlyMau: Array<{
        month: string;
        users: number;
    }>;
    featureActivity30d: Record<string, number>;
    push: {
        enabledUsers: number;
        adoptionRate: number;
    };
};

type LegacyAdminStats = {
    themeUsage: Array<{ themeMode: string; count: number }>;
    levelDistribution: Array<{
        level: number;
        levelName: string;
        minPoints: number;
        maxPoints: number | null;
        count: number;
    }>;
    newUsersByDay: Array<{ date: string; count: number }>;
};

type PlaceStatsTab = "cities" | "regions" | "countries";

type AdminPlaceStatsPlace = {
    placeType: string;
    placeKey: string;
    label: string;
    regionCode: string | null;
    countryCode: string | null;
    countryName: string | null;
    flagEmoji: string | null;
    userCount: number;
    tripCount: number;
    avgDaysInAdvance: number;
    firstTripStartDate: string | null;
    lastTripStartDate: string | null;
};

type AdminPlaceStats = {
    generatedAt: string | null;
    range: {
        start: string | null;
        end: string | null;
    };
    places: Record<PlaceStatsTab, AdminPlaceStatsPlace[]>;
    highlights: Record<string, AdminPlaceStatsPlace | null>;
};

type AdminStatsRpcClient = {
    rpc: (
        functionName: "admin_get_stats"
    ) => Promise<{ data: unknown; error: SupabaseRpcError | null }>;
};

type LegacyStatsRpcClient = {
    rpc: (
        functionName: "get_admin_site_stats",
        args: { range_start: string; range_end: string }
    ) => Promise<{ data: unknown; error: SupabaseRpcError | null }>;
};

type PlaceStatsRpcClient = {
    rpc: (
        functionName: "admin_get_place_stats",
        args: { range_start: string | null; range_end: string | null }
    ) => Promise<{ data: unknown; error: SupabaseRpcError | null }>;
};

type SupabaseRpcError = {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
};

const featureLabels: Record<string, string> = {
    trips: "Trips",
    itinerary_items: "Itinerary items",
    transportation: "Transportation",
    accommodations: "Accommodations",
    ideas: "Ideas",
    food: "Food",
    budgets: "Budgets",
    expenses: "Expenses",
    passport_stamps: "Passport stamps",
    accepted_friendships: "Accepted friendships",
};

const placeTabs: Array<{ key: PlaceStatsTab; label: string }> = [
    { key: "cities", label: "Cities" },
    { key: "regions", label: "Regions" },
    { key: "countries", label: "Countries" },
];

const placeHighlightLabels: Record<string, string> = {
    last_year: "Most visited last year",
    last_spring: "Most visited last spring",
    last_summer: "Most visited last summer",
    last_fall: "Most visited last fall",
    last_winter: "Most visited last winter",
    this_month: "Most visited this month",
    this_year: "Most visited this year",
};

function numberFrom(value: unknown) {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) ? numberValue : 0;
}

function stringFrom(value: unknown, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

function nullablePercent(value: unknown) {
    if (value === null || value === undefined) return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}

function objectFrom(value: unknown) {
    return value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
}

function valueFrom(record: Record<string, unknown>, ...keys: string[]) {
    for (const key of keys) {
        if (key in record) return record[key];
    }
    return undefined;
}

function normalizeAdminStats(value: unknown): AdminStatsRpc {
    const record = objectFrom(value);
    const definitions = objectFrom(record.definitions);
    const users = objectFrom(record.users);
    const retention = objectFrom(record.retention);
    const eligible = objectFrom(retention.eligible);
    const push = objectFrom(record.push);
    const featureActivity = objectFrom(record.feature_activity_30d);

    return {
        generatedAt: stringFrom(record.generated_at) || null,
        definitions: {
            timezone: stringFrom(definitions.timezone, "UTC"),
            dau: stringFrom(
                definitions.dau,
                "Distinct authenticated users active today"
            ),
            wau: stringFrom(
                definitions.wau,
                "Distinct authenticated users active over the trailing 7 UTC dates"
            ),
            mau: stringFrom(
                definitions.mau,
                "Distinct authenticated users active over the trailing 30 UTC dates"
            ),
            activated: stringFrom(
                definitions.activated,
                "Created a trip and at least one trip item"
            ),
        },
        users: {
            total: numberFrom(users.total),
            new30d: numberFrom(users.new_30d),
            dau: numberFrom(users.dau),
            wau: numberFrom(users.wau),
            mau: numberFrom(users.mau),
            activated: numberFrom(users.activated),
            activationRate: numberFrom(users.activation_rate),
            zeroTrips: numberFrom(users.zero_trips),
        },
        retention: {
            d1: nullablePercent(retention.d1),
            d7: nullablePercent(retention.d7),
            d30: nullablePercent(retention.d30),
            eligible: {
                d1: numberFrom(eligible.d1),
                d7: numberFrom(eligible.d7),
                d30: numberFrom(eligible.d30),
            },
        },
        monthlyMau: Array.isArray(record.monthly_mau)
            ? record.monthly_mau.slice(-12).map((entry) => {
                  const entryRecord = objectFrom(entry);
                  return {
                      month: stringFrom(entryRecord.month),
                      users: numberFrom(entryRecord.users),
                  };
              })
            : [],
        featureActivity30d: Object.fromEntries(
            Object.keys(featureLabels).map((key) => [
                key,
                numberFrom(featureActivity[key]),
            ])
        ),
        push: {
            enabledUsers: numberFrom(push.enabled_users),
            adoptionRate: numberFrom(push.adoption_rate),
        },
    };
}

function normalizeLegacyStats(value: unknown): LegacyAdminStats {
    const record = objectFrom(value);
    const themeUsageValue = record.themeUsage ?? record.theme_usage;
    const levelDistributionValue =
        record.levelDistribution ?? record.level_distribution;
    const newUsersByDayValue = record.newUsersByDay ?? record.new_users_by_day;

    return {
        themeUsage: Array.isArray(themeUsageValue)
            ? themeUsageValue.map((theme) => {
                  const themeRecord = objectFrom(theme);
                  return {
                      themeMode: stringFrom(
                          themeRecord.themeMode ?? themeRecord.theme_mode,
                          "dark"
                      ),
                      count: numberFrom(themeRecord.count),
                  };
              })
            : [],
        levelDistribution: Array.isArray(levelDistributionValue)
            ? levelDistributionValue.map((level) => {
                  const levelRecord = objectFrom(level);
                  const maxPointsValue = valueFrom(
                      levelRecord,
                      "maxPoints",
                      "max_points"
                  );
                  return {
                      level: numberFrom(levelRecord.level),
                      levelName: stringFrom(
                          valueFrom(levelRecord, "levelName", "level_name")
                      ),
                      minPoints: numberFrom(
                          valueFrom(levelRecord, "minPoints", "min_points")
                      ),
                      maxPoints:
                          maxPointsValue === null ? null : numberFrom(maxPointsValue),
                      count: numberFrom(levelRecord.count),
                  };
              })
            : [],
        newUsersByDay: Array.isArray(newUsersByDayValue)
            ? newUsersByDayValue.map((entry) => {
                  const entryRecord = objectFrom(entry);
                  return {
                      date: stringFrom(entryRecord.date),
                      count: numberFrom(entryRecord.count),
                  };
              })
            : [],
    };
}

function normalizePlaceStatsPlace(value: unknown): AdminPlaceStatsPlace {
    const record = objectFrom(value);
    return {
        placeType: stringFrom(valueFrom(record, "placeType", "place_type")),
        placeKey: stringFrom(valueFrom(record, "placeKey", "place_key")),
        label: stringFrom(record.label, "Unknown place"),
        regionCode:
            valueFrom(record, "regionCode", "region_code") === null
                ? null
                : stringFrom(valueFrom(record, "regionCode", "region_code")) || null,
        countryCode:
            valueFrom(record, "countryCode", "country_code") === null
                ? null
                : stringFrom(valueFrom(record, "countryCode", "country_code")) || null,
        countryName:
            valueFrom(record, "countryName", "country_name") === null
                ? null
                : stringFrom(valueFrom(record, "countryName", "country_name")) || null,
        flagEmoji:
            valueFrom(record, "flagEmoji", "flag_emoji") === null
                ? null
                : stringFrom(valueFrom(record, "flagEmoji", "flag_emoji")) || null,
        userCount: numberFrom(valueFrom(record, "userCount", "user_count")),
        tripCount: numberFrom(valueFrom(record, "tripCount", "trip_count")),
        avgDaysInAdvance: numberFrom(
            valueFrom(record, "avgDaysInAdvance", "avg_days_in_advance")
        ),
        firstTripStartDate:
            valueFrom(record, "firstTripStartDate", "first_trip_start_date") === null
                ? null
                : stringFrom(
                      valueFrom(record, "firstTripStartDate", "first_trip_start_date")
                  ) || null,
        lastTripStartDate:
            valueFrom(record, "lastTripStartDate", "last_trip_start_date") === null
                ? null
                : stringFrom(
                      valueFrom(record, "lastTripStartDate", "last_trip_start_date")
                  ) || null,
    };
}

function normalizePlaceStats(value: unknown): AdminPlaceStats {
    const record = objectFrom(value);
    const range = objectFrom(record.range);
    const places = objectFrom(record.places);
    const highlights = objectFrom(record.highlights);

    const normalizePlaceList = (key: PlaceStatsTab) =>
        Array.isArray(places[key])
            ? places[key].map((entry) => normalizePlaceStatsPlace(entry))
            : [];

    return {
        generatedAt: stringFrom(record.generated_at) || null,
        range: {
            start: stringFrom(range.start) || null,
            end: stringFrom(range.end) || null,
        },
        places: {
            cities: normalizePlaceList("cities"),
            regions: normalizePlaceList("regions"),
            countries: normalizePlaceList("countries"),
        },
        highlights: Object.fromEntries(
            Object.keys(placeHighlightLabels).map((key) => [
                key,
                highlights[key] ? normalizePlaceStatsPlace(highlights[key]) : null,
            ])
        ),
    };
}

function formatNumber(value: number) {
    return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number | null) {
    if (value === null) return "Not enough data yet";
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

function formatDateTime(value: string | null) {
    if (!value) return "Just now";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function formatMonth(value: string) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "2-digit",
    }).format(date);
}

function getRangeDates(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    return {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
    };
}

function formatThemeLabel(value: string) {
    return `${value.charAt(0).toUpperCase()}${value.slice(1).replaceAll("_", " ")}`;
}

function formatPointRange(minPoints: number, maxPoints: number | null) {
    if (maxPoints === null) return `${formatNumber(minPoints)}+`;
    return `${formatNumber(minPoints)}-${formatNumber(maxPoints)}`;
}

function firstQueryValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

function getPlaceStatsFilter(
    searchParams: Record<string, string | string[] | undefined>
) {
    const tabValue = firstQueryValue(searchParams.place_type);
    const yearValue = firstQueryValue(searchParams.place_year);
    const monthValue = firstQueryValue(searchParams.place_month);
    const currentYear = new Date().getFullYear();
    const selectedTab = placeTabs.some((tab) => tab.key === tabValue)
        ? (tabValue as PlaceStatsTab)
        : "cities";
    const selectedYear =
        yearValue && /^\d{4}$/.test(yearValue) ? Number(yearValue) : null;
    const selectedMonth =
        monthValue && /^(0?[1-9]|1[0-2])$/.test(monthValue)
            ? Number(monthValue)
            : null;
    let rangeStart: string | null = null;
    let rangeEnd: string | null = null;

    if (selectedYear) {
        if (selectedMonth) {
            const monthStart = new Date(Date.UTC(selectedYear, selectedMonth - 1, 1));
            const monthEnd = new Date(Date.UTC(selectedYear, selectedMonth, 0));
            rangeStart = monthStart.toISOString().slice(0, 10);
            rangeEnd = monthEnd.toISOString().slice(0, 10);
        } else {
            rangeStart = `${selectedYear}-01-01`;
            rangeEnd = `${selectedYear}-12-31`;
        }
    }

    return {
        selectedTab,
        selectedYear,
        selectedMonth,
        rangeStart,
        rangeEnd,
        yearOptions: Array.from({ length: 8 }, (_, index) => currentYear - index),
    };
}

function buildPlaceStatsHref({
    tab,
    year,
    month,
}: {
    tab: PlaceStatsTab;
    year: number | null;
    month: number | null;
}) {
    const params = new URLSearchParams();
    params.set("place_type", tab);
    if (year) params.set("place_year", String(year));
    if (month) params.set("place_month", String(month).padStart(2, "0"));
    return `/admin/stats?${params.toString()}#place-stats`;
}

function formatPlaceFilterRange(placeStats: AdminPlaceStats) {
    if (placeStats.range.start && placeStats.range.end) {
        return `${placeStats.range.start} to ${placeStats.range.end}`;
    }
    return "All trip dates";
}

function MetricCard({
    label,
    value,
    helper,
}: {
    label: string;
    value: string;
    helper: string;
}) {
    return (
        <section className="min-w-0 rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200">
                {label}
            </p>
            <p className="mt-3 text-4xl font-black leading-none text-white">
                {value}
            </p>
            <p className="mt-3 text-xs font-semibold leading-5 text-slate-400">
                {helper}
            </p>
        </section>
    );
}

function MonthlyMauChart({ entries }: { entries: AdminStatsRpc["monthlyMau"] }) {
    const maxValue = Math.max(1, ...entries.map((entry) => entry.users));
    const width = 720;
    const height = 240;
    const points = entries.map((entry, index) => {
        const x =
            entries.length <= 1
                ? width / 2
                : (index / (entries.length - 1)) * width;
        const y = height - (entry.users / maxValue) * (height - 28) - 14;
        return { ...entry, x, y };
    });
    const linePath = points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");
    const areaPath =
        points.length > 0
            ? `${linePath} L ${points.at(-1)?.x || 0} ${height} L ${points[0].x} ${height} Z`
            : "";

    return (
        <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-4">
            {entries.length > 0 ? (
                <div className="min-w-0">
                    <svg
                        viewBox={`0 0 ${width} ${height}`}
                        className="h-64 w-full overflow-visible"
                        role="img"
                        aria-label="Calendar-month MAU chart"
                    >
                        <defs>
                            <linearGradient id="mau-area" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="rgb(190 242 100)" stopOpacity="0.35" />
                                <stop offset="100%" stopColor="rgb(190 242 100)" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <path d={areaPath} fill="url(#mau-area)" />
                        <path
                            d={linePath}
                            fill="none"
                            stroke="rgb(190 242 100)"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="5"
                        />
                        {points.map((point) => (
                            <g key={point.month} className="group">
                                <circle
                                    cx={point.x}
                                    cy={point.y}
                                    r="7"
                                    className="fill-lime-300 transition group-hover:fill-lime-100"
                                />
                                <foreignObject
                                    x={Math.max(0, Math.min(width - 136, point.x - 68))}
                                    y={Math.max(0, point.y - 66)}
                                    width="136"
                                    height="56"
                                    className="pointer-events-none opacity-0 transition group-hover:opacity-100"
                                >
                                    <div className="rounded-xl border border-lime-300/30 bg-slate-950 px-3 py-2 text-center text-xs font-black text-lime-100 shadow-2xl shadow-black/40">
                                        <p>{formatMonth(point.month)}</p>
                                        <p>{formatNumber(point.users)} users</p>
                                    </div>
                                </foreignObject>
                            </g>
                        ))}
                    </svg>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 sm:grid-cols-6 lg:grid-cols-12">
                        {entries.map((entry) => (
                            <span key={entry.month} className="truncate text-center">
                                {formatMonth(entry.month)}
                            </span>
                        ))}
                    </div>
                </div>
            ) : (
                <p className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm font-bold text-slate-300">
                    No monthly active-user data yet.
                </p>
            )}
        </div>
    );
}

function CompactBarList({
    entries,
}: {
    entries: Array<{ label: string; value: number }>;
}) {
    const maxValue = Math.max(1, ...entries.map((entry) => entry.value));

    return (
        <div className="space-y-4">
            {entries.map((entry) => (
                <div key={entry.label}>
                    <div className="flex items-center justify-between gap-3 text-sm font-black">
                        <span className="min-w-0 truncate text-slate-100">
                            {entry.label}
                        </span>
                        <span className="text-lime-100">{formatNumber(entry.value)}</span>
                    </div>
                    <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-950/70">
                        <div
                            className="h-full rounded-full bg-lime-300"
                            style={{
                                width:
                                    entry.value > 0
                                        ? `${Math.max(2, (entry.value / maxValue) * 100)}%`
                                        : "0%",
                            }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

function PlaceStatsSection({
    placeStats,
    highlightStats,
    selectedTab,
    selectedYear,
    selectedMonth,
    yearOptions,
}: {
    placeStats: AdminPlaceStats;
    highlightStats: AdminPlaceStats;
    selectedTab: PlaceStatsTab;
    selectedYear: number | null;
    selectedMonth: number | null;
    yearOptions: number[];
}) {
    const places = placeStats.places[selectedTab];
    const maxUsers = Math.max(1, ...places.map((place) => place.userCount));
    const monthOptions = Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        const label = new Intl.DateTimeFormat("en-US", {
            month: "long",
        }).format(new Date(Date.UTC(2026, index, 1)));
        return { month, label };
    });

    return (
        <section
            id="place-stats"
            className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20"
        >
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                        <MapPin className="h-4 w-4" aria-hidden="true" />
                        Place demand
                    </p>
                    <h2 className="mt-2 text-2xl font-black">
                        Most visited places
                    </h2>
                    <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-slate-400">
                        Top 100 places by unique users with past or upcoming trips.
                        City entries roll up into their region and country when those
                        fields are available; region-only entries roll up into their
                        country.
                    </p>
                </div>
                <p className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs font-black text-slate-300">
                    {formatPlaceFilterRange(placeStats)}
                </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Object.entries(placeHighlightLabels).map(([key, label]) => {
                    const place = highlightStats.highlights[key];
                    return (
                        <div
                            key={key}
                            className="min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-950/50 p-4"
                        >
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-lime-200">
                                {label}
                            </p>
                            {place ? (
                                <>
                                    <p className="mt-3 truncate text-xl font-black text-white">
                                        {place.flagEmoji ? `${place.flagEmoji} ` : ""}
                                        {place.label}
                                    </p>
                                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">
                                        {formatNumber(place.userCount)} user
                                        {place.userCount === 1 ? "" : "s"} ·{" "}
                                        {formatNumber(place.tripCount)} trip
                                        {place.tripCount === 1 ? "" : "s"}
                                    </p>
                                </>
                            ) : (
                                <p className="mt-3 text-sm font-semibold leading-5 text-slate-500">
                                    No trips in this period yet.
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
                {placeTabs.map((tab) => (
                    <a
                        key={tab.key}
                        href={buildPlaceStatsHref({
                            tab: tab.key,
                            year: selectedYear,
                            month: selectedMonth,
                        })}
                        className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition ${
                            selectedTab === tab.key
                                ? "border-lime-300 bg-lime-300 text-slate-950"
                                : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-lime-300/40 hover:text-lime-100"
                        }`}
                    >
                        {tab.label}
                    </a>
                ))}
            </div>

            <form
                action="/admin/stats"
                className="mt-4 grid gap-3 rounded-[1.25rem] border border-white/10 bg-slate-950/45 p-4 sm:grid-cols-[1fr_1fr_auto_auto]"
            >
                <input type="hidden" name="place_type" value={selectedTab} />
                <label className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Year
                    </span>
                    <select
                        name="place_year"
                        defaultValue={selectedYear ?? ""}
                        className="mt-2 h-11 w-full rounded-full border border-white/10 bg-[#05030d] px-4 text-sm font-black text-white outline-none focus:border-lime-300/50"
                    >
                        <option value="">All years</option>
                        {yearOptions.map((year) => (
                            <option key={year} value={year}>
                                {year}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Month
                    </span>
                    <select
                        name="place_month"
                        defaultValue={selectedMonth ?? ""}
                        className="mt-2 h-11 w-full rounded-full border border-white/10 bg-[#05030d] px-4 text-sm font-black text-white outline-none focus:border-lime-300/50"
                    >
                        <option value="">All months</option>
                        {monthOptions.map(({ month, label }) => (
                            <option key={month} value={month}>
                                {label}
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    type="submit"
                    className="h-11 self-end rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950 transition hover:bg-lime-200"
                >
                    Filter
                </button>
                <a
                    href={buildPlaceStatsHref({
                        tab: selectedTab,
                        year: null,
                        month: null,
                    })}
                    className="flex h-11 items-center justify-center self-end rounded-full border border-white/10 bg-white/[0.06] px-5 text-sm font-black text-slate-200 transition hover:border-lime-300/40 hover:text-lime-100"
                >
                    Clear
                </a>
            </form>

            <div className="mt-5 overflow-hidden rounded-[1.25rem] border border-white/10 bg-slate-950/45">
                {places.length > 0 ? (
                    <div className="divide-y divide-white/10">
                        {places.map((place, index) => (
                            <div
                                key={`${place.placeType}-${place.placeKey}`}
                                className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]"
                            >
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                        #{index + 1}
                                    </p>
                                    <p className="mt-1 truncate text-base font-black text-white">
                                        {place.flagEmoji ? `${place.flagEmoji} ` : ""}
                                        {place.label}
                                    </p>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                        {place.countryName || place.countryCode || "Location"}
                                    </p>
                                </div>
                                <div className="min-w-0 self-center">
                                    <div className="h-3 overflow-hidden rounded-full bg-white/10">
                                        <div
                                            className="h-full rounded-full bg-lime-300"
                                            style={{
                                                width: `${Math.max(
                                                    4,
                                                    (place.userCount / maxUsers) * 100
                                                )}%`,
                                            }}
                                        />
                                    </div>
                                    <p className="mt-2 text-xs font-semibold text-slate-400">
                                        {formatNumber(place.userCount)} user
                                        {place.userCount === 1 ? "" : "s"} ·{" "}
                                        {formatNumber(place.tripCount)} trip
                                        {place.tripCount === 1 ? "" : "s"}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-lime-300/20 bg-lime-300/10 px-4 py-3 text-left sm:text-right">
                                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-lime-200">
                                        Avg. added
                                    </p>
                                    <p className="mt-1 text-lg font-black text-white">
                                        {place.avgDaysInAdvance.toLocaleString("en-US", {
                                            maximumFractionDigits: 1,
                                        })}{" "}
                                        days ahead
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="p-5 text-sm font-semibold text-slate-400">
                        No matching place data for this filter yet.
                    </p>
                )}
            </div>
        </section>
    );
}

function RetentionCard({
    label,
    value,
    eligible,
}: {
    label: string;
    value: number | null;
    eligible: number;
}) {
    return (
        <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-lime-200">
                {label}
            </p>
            <p className="mt-3 text-3xl font-black text-white">
                {eligible > 0 ? formatPercent(value) : "Not enough data yet"}
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-400">
                {formatNumber(eligible)} eligible user{eligible === 1 ? "" : "s"}
            </p>
        </div>
    );
}

export default async function AdminStatsPage({
    searchParams,
}: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const supabase = await createClient();
    const resolvedSearchParams = searchParams ? await searchParams : {};
    const placeStatsFilter = getPlaceStatsFilter(resolvedSearchParams);
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (profile?.role !== "super_admin") redirect("/");

    const legacyRange = getRangeDates(364);
    const [
        { data: statsData, error: statsError },
        legacyResult,
        placeResult,
        placeHighlightsResult,
    ] = await Promise.all([
            (supabase as unknown as AdminStatsRpcClient).rpc("admin_get_stats"),
            (supabase as unknown as LegacyStatsRpcClient).rpc(
                "get_admin_site_stats",
                {
                    range_start: legacyRange.start,
                    range_end: legacyRange.end,
                }
            ),
            (supabase as unknown as PlaceStatsRpcClient).rpc(
                "admin_get_place_stats",
                {
                    range_start: placeStatsFilter.rangeStart,
                    range_end: placeStatsFilter.rangeEnd,
                }
            ),
            (supabase as unknown as PlaceStatsRpcClient).rpc(
                "admin_get_place_stats",
                {
                    range_start: null,
                    range_end: null,
                }
            ),
        ]);

    if (statsError) {
        console.error("Could not load admin product stats:", {
            message: statsError.message,
            code: statsError.code,
            details: statsError.details,
            hint: statsError.hint,
        });
        throw new Error(statsError.message || "Could not load admin stats.");
    }

    if (legacyResult.error) {
        console.warn("Could not load legacy admin stats sections:", {
            message: legacyResult.error.message,
            code: legacyResult.error.code,
            details: legacyResult.error.details,
            hint: legacyResult.error.hint,
        });
    }

    if (placeResult.error) {
        console.warn("Could not load admin place stats:", {
            message: placeResult.error.message,
            code: placeResult.error.code,
            details: placeResult.error.details,
            hint: placeResult.error.hint,
        });
    }

    if (placeHighlightsResult.error) {
        console.warn("Could not load admin place highlight stats:", {
            message: placeHighlightsResult.error.message,
            code: placeHighlightsResult.error.code,
            details: placeHighlightsResult.error.details,
            hint: placeHighlightsResult.error.hint,
        });
    }

    const stats = normalizeAdminStats(statsData);
    const legacyStats = legacyResult.error
        ? null
        : normalizeLegacyStats(legacyResult.data);
    const placeStats = placeResult.error
        ? null
        : normalizePlaceStats(placeResult.data);
    const placeHighlightStats = placeHighlightsResult.error
        ? placeStats
        : normalizePlaceStats(placeHighlightsResult.data);
    const featureEntries = Object.entries(stats.featureActivity30d)
        .map(([key, value]) => ({
            label: featureLabels[key] || key,
            value,
        }))
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    const totalThemeUsers = Math.max(
        1,
        legacyStats?.themeUsage.reduce((sum, theme) => sum + theme.count, 0) || 0
    );
    const totalLevelUsers = Math.max(
        1,
        legacyStats?.levelDistribution.reduce(
            (sum, level) => sum + level.count,
            0
        ) || 0
    );
    const newUserTrend = legacyStats?.newUsersByDay.slice(-30) || [];
    const newUserTrendEntries = newUserTrend.map((entry) => ({
        label: entry.date.slice(5),
        value: entry.count,
    }));

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-[calc(6.25rem+var(--safe-area-top))] text-white md:pb-10 md:pl-28 md:pr-8 md:pt-28">
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="rounded-[2rem] border border-white/10 bg-[#03030a]/90 p-6 shadow-2xl shadow-black/35">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                                <BarChart3 className="h-4 w-4" aria-hidden="true" />
                                Super Admin
                            </p>
                            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">
                                Stats
                            </h1>
                            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
                                A snapshot of how VAIVIA is growing and being used.
                            </p>
                            <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                                Last updated {formatDateTime(stats.generatedAt)}
                            </p>
                        </div>
                        <AdminStatsRefreshButton />
                    </div>
                </header>

                <section className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-6">
                    <MetricCard
                        label="DAU"
                        value={formatNumber(stats.users.dau)}
                        helper={stats.definitions.dau}
                    />
                    <MetricCard
                        label="WAU"
                        value={formatNumber(stats.users.wau)}
                        helper={stats.definitions.wau}
                    />
                    <MetricCard
                        label="MAU"
                        value={formatNumber(stats.users.mau)}
                        helper={stats.definitions.mau}
                    />
                    <MetricCard
                        label="Total users"
                        value={formatNumber(stats.users.total)}
                        helper="All valid non-anonymous user accounts."
                    />
                    <MetricCard
                        label="New users"
                        value={formatNumber(stats.users.new30d)}
                        helper="Users created in the last 30 days."
                    />
                    <MetricCard
                        label="Activation"
                        value={formatPercent(stats.users.activationRate)}
                        helper={stats.definitions.activated}
                    />
                </section>

                <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                <LineChart className="h-4 w-4" aria-hidden="true" />
                                Calendar-month MAU
                            </p>
                            <h2 className="mt-2 text-2xl font-black">
                                Monthly active users
                            </h2>
                            <p className="mt-1 text-xs font-semibold text-slate-400">
                                Distinct active users within each calendar month. This is separate from the rolling 30-day MAU card.
                            </p>
                        </div>
                        <p className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs font-black text-slate-300">
                            Last 12 months
                        </p>
                    </div>
                    <MonthlyMauChart entries={stats.monthlyMau} />
                </section>

                <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                            <Gauge className="h-4 w-4" aria-hidden="true" />
                            Activation
                        </p>
                        <h2 className="mt-2 text-2xl font-black">Product funnel</h2>
                        <div className="mt-5 space-y-4">
                            <CompactBarList
                                entries={[
                                    {
                                        label: "Total users",
                                        value: stats.users.total,
                                    },
                                    {
                                        label: "Activated users",
                                        value: stats.users.activated,
                                    },
                                    {
                                        label: "Users with zero trips",
                                        value: stats.users.zeroTrips,
                                    },
                                ]}
                            />
                        </div>
                        <p className="mt-4 rounded-2xl border border-lime-300/20 bg-lime-300/10 p-4 text-sm font-black text-lime-100">
                            {formatPercent(stats.users.activationRate)} activated
                        </p>
                    </div>

                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                            <Activity className="h-4 w-4" aria-hidden="true" />
                            Retention
                        </p>
                        <h2 className="mt-2 text-2xl font-black">Return rates</h2>
                        <div className="mt-5 grid gap-3 md:grid-cols-3">
                            <RetentionCard
                                label="Day 1"
                                value={stats.retention.d1}
                                eligible={stats.retention.eligible.d1}
                            />
                            <RetentionCard
                                label="Day 7"
                                value={stats.retention.d7}
                                eligible={stats.retention.eligible.d7}
                            />
                            <RetentionCard
                                label="Day 30"
                                value={stats.retention.d30}
                                eligible={stats.retention.eligible.d30}
                            />
                        </div>
                        <p className="mt-4 text-xs font-semibold leading-5 text-slate-400">
                            Retention tracking began when daily activity tracking was introduced, so early figures are incomplete. Null values are shown as not enough data, not 0%.
                        </p>
                    </div>
                </section>

                <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                            <MousePointerClick className="h-4 w-4" aria-hidden="true" />
                            Feature activity - last 30 days
                        </p>
                        <h2 className="mt-2 text-2xl font-black">
                            What people are using
                        </h2>
                        <div className="mt-5">
                            <CompactBarList entries={featureEntries} />
                        </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                            <BellRing className="h-4 w-4" aria-hidden="true" />
                            Push enabled
                        </p>
                        <p className="mt-5 text-5xl font-black">
                            {formatNumber(stats.push.enabledUsers)}
                        </p>
                        <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">
                            Users with at least one active push subscription.
                        </p>
                        <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                                Adoption rate
                            </p>
                            <p className="mt-2 text-3xl font-black text-lime-100">
                                {formatPercent(stats.push.adoptionRate)}
                            </p>
                        </div>
                    </div>
                </section>

                {placeStats ? (
                    <PlaceStatsSection
                        placeStats={placeStats}
                        highlightStats={placeHighlightStats || placeStats}
                        selectedTab={placeStatsFilter.selectedTab}
                        selectedYear={placeStatsFilter.selectedYear}
                        selectedMonth={placeStatsFilter.selectedMonth}
                        yearOptions={placeStatsFilter.yearOptions}
                    />
                ) : (
                    <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                        <p className="text-sm font-bold text-slate-300">
                            Place stats are temporarily unavailable. Core stats are still loaded.
                        </p>
                    </section>
                )}

                {legacyStats ? (
                    <>
                        <section className="grid min-w-0 max-w-full gap-4 overflow-hidden lg:grid-cols-[0.8fr_1.2fr]">
                            <div className="min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                                <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                    Theme usage
                                </p>
                                <div className="mt-5 space-y-4">
                                    {legacyStats.themeUsage.length > 0 ? (
                                        legacyStats.themeUsage.map((theme) => (
                                            <div key={theme.themeMode}>
                                                <div className="flex items-center justify-between gap-3 text-sm font-black">
                                                    <span className="min-w-0 truncate">
                                                        {formatThemeLabel(theme.themeMode)}
                                                    </span>
                                                    <span>{theme.count}</span>
                                                </div>
                                                <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-950/70">
                                                    <div
                                                        className={`h-full rounded-full ${
                                                            theme.count > 0
                                                                ? "bg-lime-300"
                                                                : "bg-transparent"
                                                        }`}
                                                        style={{
                                                            width:
                                                                theme.count > 0
                                                                    ? `${(theme.count /
                                                                          totalThemeUsers) *
                                                                          100}%`
                                                                    : "0%",
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm font-semibold text-slate-400">
                                            No theme preferences saved yet.
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                    <TrendingUp className="h-4 w-4" aria-hidden="true" />
                                    New-user trend
                                </p>
                                <h2 className="mt-2 text-2xl font-black">
                                    Last 30 days
                                </h2>
                                <div className="mt-5">
                                    <CompactBarList entries={newUserTrendEntries} />
                                </div>
                            </div>
                        </section>

                        <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                <UsersRound className="h-4 w-4" aria-hidden="true" />
                                Travel-level distribution
                            </p>
                            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                {legacyStats.levelDistribution.map((level) => (
                                    <div
                                        key={level.level}
                                        className="rounded-[1.25rem] border border-white/10 bg-slate-950/55 p-4"
                                    >
                                        <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                            Level {level.level}
                                        </p>
                                        <p className="mt-2 text-lg font-black text-white">
                                            {level.levelName}
                                        </p>
                                        <p className="mt-1 text-xs font-semibold text-slate-400">
                                            {formatPointRange(level.minPoints, level.maxPoints)} points
                                        </p>
                                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                                            <div
                                                className={`h-full rounded-full ${
                                                    level.count > 0
                                                        ? "bg-lime-300"
                                                        : "bg-transparent"
                                                }`}
                                                style={{
                                                    width:
                                                        level.count > 0
                                                            ? `${(level.count /
                                                                  totalLevelUsers) *
                                                                  100}%`
                                                            : "0%",
                                                }}
                                            />
                                        </div>
                                        <p className="mt-2 text-sm font-black">
                                            {level.count} user{level.count === 1 ? "" : "s"}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </>
                ) : (
                    <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                        <p className="text-sm font-bold text-slate-300">
                            Core stats loaded. Legacy theme, level, and new-user trend sections are temporarily unavailable.
                        </p>
                    </section>
                )}
            </div>
        </main>
    );
}
