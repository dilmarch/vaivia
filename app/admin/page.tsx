import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Award, ShieldCheck, UsersRound, X } from "lucide-react";
import FeatureSuggestionStatusSelect from "@/components/admin/FeatureSuggestionStatusSelect";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
    title: "Admin - VAIVIA",
};

type AdminPageProps = {
    searchParams?: Promise<{
        range?: string;
        metrics?: string;
        type?: string;
    }>;
};

type AdminStats = {
    userCount: number;
    tripCount: number;
    themeUsage: Array<{
        themeMode: string;
        count: number;
    }>;
    levelDistribution: Array<{
        level: number;
        levelName: string;
        minPoints: number;
        maxPoints: number | null;
        count: number;
    }>;
    newUsersByDay: Array<{
        date: string;
        count: number;
    }>;
    monthlyActiveUsersByDay: Array<{
        date: string;
        count: number;
    }>;
};

type FeatureSuggestion = {
    id: string;
    user_id: string;
    suggestion_type: string;
    title: string | null;
    message: string;
    current_path: string | null;
    contact_email: string | null;
    status: string;
    created_at: string;
};

const ranges = [
    { key: "week", label: "1W", days: 6, grain: "day" },
    { key: "month", label: "1M", days: 29, grain: "day" },
    { key: "year", label: "1Y", days: 364, grain: "month" },
    { key: "five-year", label: "5Y", days: 365 * 5 - 1, grain: "month" },
] as const;

const suggestionStatuses = [
    "open",
    "in_progress",
    "qa",
    "archived",
    "implemented",
] as const;

const visibleSuggestionStatuses = ["open", "in_progress", "qa"] as const;
const closedSuggestionStatuses = ["archived", "implemented"] as const;

const suggestionTypeTabs = [
    { key: "all", label: "ALL" },
    { key: "feature", label: "Feature" },
    { key: "bug", label: "Bug" },
    { key: "feedback", label: "Feedback" },
] as const;

function formatDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
}

function getRangeDates(rangeKey?: string) {
    const selectedRange =
        ranges.find((range) => range.key === rangeKey) || ranges[1];
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - selectedRange.days);

    return {
        selectedRange,
        startKey: formatDateKey(start),
        endKey: formatDateKey(end),
    };
}

function normalizeAdminStats(value: unknown): AdminStats {
    const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const themeUsage = Array.isArray(record.themeUsage)
        ? record.themeUsage
              .map((theme) => {
                  const themeRecord =
                      theme && typeof theme === "object"
                          ? (theme as Record<string, unknown>)
                          : {};
                  return {
                      themeMode:
                          typeof themeRecord.themeMode === "string"
                              ? themeRecord.themeMode
                              : "dark",
                      count:
                          typeof themeRecord.count === "number"
                              ? themeRecord.count
                              : Number(themeRecord.count || 0),
                  };
              })
              .filter((theme) => theme.count >= 0)
        : [];
    const newUsersByDay = Array.isArray(record.newUsersByDay)
        ? record.newUsersByDay
              .map((entry) => {
                  const entryRecord =
                      entry && typeof entry === "object"
                          ? (entry as Record<string, unknown>)
                          : {};
                  return {
                      date:
                          typeof entryRecord.date === "string"
                              ? entryRecord.date
                              : "",
                      count:
                          typeof entryRecord.count === "number"
                              ? entryRecord.count
                              : Number(entryRecord.count || 0),
                  };
              })
              .filter((entry) => entry.date)
        : [];
    const monthlyActiveUsersByDay = Array.isArray(record.monthlyActiveUsersByDay)
        ? record.monthlyActiveUsersByDay
              .map((entry) => {
                  const entryRecord =
                      entry && typeof entry === "object"
                          ? (entry as Record<string, unknown>)
                          : {};
                  return {
                      date:
                          typeof entryRecord.date === "string"
                              ? entryRecord.date
                              : "",
                      count:
                          typeof entryRecord.count === "number"
                              ? entryRecord.count
                              : Number(entryRecord.count || 0),
                  };
              })
              .filter((entry) => entry.date)
        : [];
    const levelDistribution = Array.isArray(record.levelDistribution)
        ? record.levelDistribution
              .map((entry) => {
                  const levelRecord =
                      entry && typeof entry === "object"
                          ? (entry as Record<string, unknown>)
                          : {};
                  return {
                      level:
                          typeof levelRecord.level === "number"
                              ? levelRecord.level
                              : Number(levelRecord.level || 0),
                      levelName:
                          typeof levelRecord.levelName === "string"
                              ? levelRecord.levelName
                              : "Still Packing",
                      minPoints:
                          typeof levelRecord.minPoints === "number"
                              ? levelRecord.minPoints
                              : Number(levelRecord.minPoints || 0),
                      maxPoints:
                          levelRecord.maxPoints === null
                              ? null
                              : typeof levelRecord.maxPoints === "number"
                                ? levelRecord.maxPoints
                                : Number(levelRecord.maxPoints || 0),
                      count:
                          typeof levelRecord.count === "number"
                              ? levelRecord.count
                              : Number(levelRecord.count || 0),
                  };
              })
              .filter((entry) => entry.level > 0)
        : [];

    return {
        userCount:
            typeof record.userCount === "number"
                ? record.userCount
                : Number(record.userCount || 0),
        tripCount:
            typeof record.tripCount === "number"
                ? record.tripCount
                : Number(record.tripCount || 0),
        themeUsage,
        levelDistribution,
        newUsersByDay,
        monthlyActiveUsersByDay,
    };
}

function formatThemeLabel(themeMode: string) {
    return themeMode
        .split(/[-_]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function formatStatusLabel(status: string) {
    if (status === "qa") return "QA";

    return status
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function getSuggestionStatusBorderClass(status: string) {
    switch (status) {
        case "open":
            return "border-l-lime-300";
        case "in_progress":
            return "border-l-yellow-300";
        case "qa":
            return "border-l-orange-400";
        case "implemented":
            return "border-l-sky-400";
        case "archived":
            return "border-l-black";
        default:
            return "border-l-white/20";
    }
}

function normalizeSuggestionType(value?: string) {
    return suggestionTypeTabs.some((tab) => tab.key === value)
        ? (value as (typeof suggestionTypeTabs)[number]["key"])
        : "all";
}

function getAdminHref({
    metrics,
    rangeKey,
    type,
}: {
    metrics?: string;
    rangeKey?: string;
    type?: string;
}) {
    const params = new URLSearchParams();
    if (rangeKey && rangeKey !== "month") params.set("range", rangeKey);
    if (type && type !== "all") params.set("type", type);
    if (metrics) params.set("metrics", metrics);
    const query = params.toString();
    return query ? `/admin?${query}` : "/admin";
}

function formatDate(value: string) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(date);
}

function formatChartDate(value: string, grain: (typeof ranges)[number]["grain"]) {
    const date = value.length === 7
        ? new Date(`${value}-01T00:00:00`)
        : new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;

    if (grain === "month") {
        return new Intl.DateTimeFormat("en-US", {
            month: "short",
            year: "numeric",
        }).format(date);
    }

    return formatDate(value);
}

function bucketNewUsersByRange(
    entries: AdminStats["newUsersByDay"],
    grain: (typeof ranges)[number]["grain"]
) {
    if (grain === "day") return entries;

    const buckets = new Map<string, number>();
    for (const entry of entries) {
        const bucketKey = entry.date.slice(0, 7);
        buckets.set(bucketKey, (buckets.get(bucketKey) || 0) + entry.count);
    }

    return Array.from(buckets.entries()).map(([date, count]) => ({
        date,
        count,
    }));
}

function bucketActiveUsersByRange(
    entries: AdminStats["monthlyActiveUsersByDay"],
    grain: (typeof ranges)[number]["grain"]
) {
    if (grain === "day") return entries;

    const buckets = new Map<string, number>();
    for (const entry of entries) {
        const bucketKey = entry.date.slice(0, 7);
        buckets.set(bucketKey, Math.max(buckets.get(bucketKey) || 0, entry.count));
    }

    return Array.from(buckets.entries()).map(([date, count]) => ({
        date,
        count,
    }));
}

function AdminBarChart({
    entries,
    maxValue,
    label,
    grain,
    emptyLabel,
}: {
    entries: Array<{ date: string; count: number }>;
    maxValue: number;
    label: string;
    grain: (typeof ranges)[number]["grain"];
    emptyLabel: string;
}) {
    const axisMax = Math.max(1, maxValue);
    const axisMid = Math.round(axisMax / 2);

    return (
        <div className="mt-6 grid min-w-0 grid-cols-[2.75rem_1fr] gap-3 pt-12">
            <div className="grid h-64 grid-rows-3 py-1 text-right text-[10px] font-black text-slate-500">
                <span>{axisMax}</span>
                <span className="self-center">{axisMid}</span>
                <span className="self-end">0</span>
            </div>
            <div
                className="grid h-64 w-full max-w-full items-end gap-0.5 overflow-visible rounded-2xl border border-white/10 bg-slate-950/45 p-4"
                style={{
                    gridTemplateColumns: `repeat(${Math.max(
                        1,
                        entries.length
                    )}, minmax(1px, 1fr))`,
                }}
            >
                {entries.length > 0 ? (
                    entries.map((entry) => (
                        <div
                            key={entry.date}
                            className="group relative flex h-full min-w-0 items-end"
                            aria-label={`${formatChartDate(entry.date, grain)}: ${entry.count} ${label}`}
                        >
                            <div
                                className="w-full rounded-t-full bg-lime-300/85 transition group-hover:bg-lime-200"
                                style={{
                                    height: `${Math.max(
                                        entry.count > 0 ? 6 : 1,
                                        (entry.count / axisMax) * 100
                                    )}%`,
                                }}
                            />
                            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden min-w-max -translate-x-1/2 rounded-xl border border-lime-300/30 bg-slate-950 px-3 py-2 text-center text-xs font-black text-lime-100 shadow-2xl shadow-black/40 group-hover:block">
                                <p>
                                    {entry.count} {label}
                                </p>
                                <p className="mt-0.5 text-[10px] text-slate-400">
                                    {formatChartDate(entry.date, grain)}
                                </p>
                            </div>
                        </div>
                    ))
                ) : (
                    <p className="col-span-full self-center text-center text-sm font-bold text-slate-400">
                        {emptyLabel}
                    </p>
                )}
            </div>
        </div>
    );
}

function formatPointRange(minPoints: number, maxPoints: number | null) {
    if (maxPoints === null) return `${minPoints.toLocaleString()}+`;
    return `${minPoints.toLocaleString()}-${maxPoints.toLocaleString()}`;
}

async function updateFeatureSuggestionStatus(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (profile?.role !== "super_admin") {
        throw new Error("Only super admins can update feature requests.");
    }

    const suggestionId = String(formData.get("suggestion_id") || "");
    const rawStatus = String(formData.get("status") || "");
    const status = suggestionStatuses.includes(
        rawStatus as (typeof suggestionStatuses)[number]
    )
        ? rawStatus
        : "open";

    const { error: existingSuggestionError } = await supabase
        .from("feature_suggestions")
        .select("id")
        .eq("id", suggestionId)
        .maybeSingle();

    if (existingSuggestionError) {
        console.error("Could not load feature suggestion before status update:", {
            message: existingSuggestionError.message,
            code: existingSuggestionError.code,
            details: existingSuggestionError.details,
            hint: existingSuggestionError.hint,
            suggestionId,
        });
        throw new Error(
            `Could not update feature request: ${existingSuggestionError.message}`
        );
    }

    const { error } = await supabase
        .from("feature_suggestions")
        .update({
            status,
            updated_at: new Date().toISOString(),
        })
        .eq("id", suggestionId);

    if (error) {
        console.error("Could not update feature suggestion status:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            suggestionId,
            status,
        });
        throw new Error(`Could not update feature request: ${error.message}`);
    }

    revalidatePath("/admin");
    revalidatePath("/admin/closed-tasks");
    revalidatePath("/notifications");
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
    const params = searchParams ? await searchParams : {};
    const { selectedRange, startKey, endKey } = getRangeDates(params.range);
    const selectedSuggestionType = normalizeSuggestionType(params.type);
    const supabase = await createClient();
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

    let suggestionsQuery = supabase
        .from("feature_suggestions")
        .select(
            "id,user_id,suggestion_type,title,message,current_path,contact_email,status,created_at"
        )
        .in("status", [...visibleSuggestionStatuses])
        .order("created_at", { ascending: false })
        .limit(100);

    if (selectedSuggestionType !== "all") {
        suggestionsQuery = suggestionsQuery.eq(
            "suggestion_type",
            selectedSuggestionType
        );
    }

    const [
        { data: statsData, error: statsError },
        { data: suggestionRows, error: suggestionsError },
        { count: closedSuggestionCount, error: closedSuggestionsError },
    ] = await Promise.all([
        supabase.rpc("get_admin_site_stats", {
            range_start: startKey,
            range_end: endKey,
        }),
        suggestionsQuery,
        supabase
            .from("feature_suggestions")
            .select("id", { count: "exact", head: true })
            .in("status", [...closedSuggestionStatuses]),
    ]);

    if (statsError) {
        console.error("Could not load admin stats:", {
            message: statsError.message,
            code: statsError.code,
            details: statsError.details,
            hint: statsError.hint,
        });
        throw new Error(`Could not load admin stats: ${statsError.message}`);
    }

    if (suggestionsError) {
        console.error("Could not load feature suggestions:", {
            message: suggestionsError.message,
            code: suggestionsError.code,
            details: suggestionsError.details,
            hint: suggestionsError.hint,
        });
        throw new Error(
            `Could not load feature requests: ${suggestionsError.message}`
        );
    }

    if (closedSuggestionsError) {
        console.error("Could not load closed feature suggestion count:", {
            message: closedSuggestionsError.message,
            code: closedSuggestionsError.code,
            details: closedSuggestionsError.details,
            hint: closedSuggestionsError.hint,
        });
    }

    const stats = normalizeAdminStats(statsData);
    const suggestions = (suggestionRows || []) as FeatureSuggestion[];
    const newUserChartEntries = bucketNewUsersByRange(
        stats.newUsersByDay,
        selectedRange.grain
    );
    const mauChartEntries = bucketActiveUsersByRange(
        stats.monthlyActiveUsersByDay,
        selectedRange.grain
    );
    const maxDailyUsers = Math.max(
        1,
        ...newUserChartEntries.map((entry) => entry.count)
    );
    const maxMonthlyActiveUsers = Math.max(
        1,
        ...mauChartEntries.map((entry) => entry.count)
    );
    const totalThemeUsers = Math.max(
        1,
        stats.themeUsage.reduce((sum, theme) => sum + theme.count, 0)
    );
    const totalLevelUsers = Math.max(
        1,
        stats.levelDistribution.reduce((sum, level) => sum + level.count, 0)
    );
    const showLevelMetrics = params.metrics === "levels";

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-[calc(6.25rem+var(--safe-area-top))] text-white md:pb-10 md:pl-28 md:pr-8 md:pt-28">
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="rounded-[2rem] border border-white/10 bg-[#03030a]/90 p-6 shadow-2xl shadow-black/35">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                                Super Admin
                            </p>
                            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">
                                VAIVIA admin
                            </h1>
                            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
                                Site-wide stats, theme adoption, new user trends, and user-submitted feature requests.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Link
                                href={getAdminHref({
                                    metrics: "levels",
                                    rangeKey: selectedRange.key,
                                    type: selectedSuggestionType,
                                })}
                                className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-lime-200"
                            >
                                <Award className="h-4 w-4" aria-hidden="true" />
                                Level metrics
                            </Link>
                            <Link
                                href="/admin/users"
                                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-100 transition hover:bg-white/[0.14]"
                            >
                                <UsersRound className="h-4 w-4" aria-hidden="true" />
                                Users
                            </Link>
                        </div>
                    </div>
                </header>

                <section className="grid min-w-0 gap-4 md:grid-cols-2">
                    <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                            Users
                        </p>
                        <p className="mt-3 text-5xl font-black">{stats.userCount}</p>
                    </div>
                    <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                            Trips added
                        </p>
                        <p className="mt-3 text-5xl font-black">{stats.tripCount}</p>
                    </div>
                </section>

                <section className="min-w-0 rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                Points
                            </p>
                            <h2 className="mt-2 text-2xl font-black">
                                User levels
                            </h2>
                        </div>
                        <Link
                            href={getAdminHref({
                                metrics: "levels",
                                rangeKey: selectedRange.key,
                                type: selectedSuggestionType,
                            })}
                            className="rounded-full border border-lime-300/35 bg-lime-300/10 px-4 py-2 text-sm font-black text-lime-100 transition hover:bg-lime-300 hover:text-slate-950"
                        >
                            Open metrics
                        </Link>
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {stats.levelDistribution
                            .filter((level) => level.count > 0)
                            .map((level) => (
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
                                            className="h-full rounded-full bg-lime-300"
                                            style={{
                                                width: `${(level.count / totalLevelUsers) * 100}%`,
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

                <section className="grid min-w-0 max-w-full gap-4 overflow-hidden lg:grid-cols-[0.8fr_1.2fr]">
                    <div className="min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                            Theme usage
                        </p>
                        <div className="mt-5 space-y-4">
                            {stats.themeUsage.length > 0 ? (
                                stats.themeUsage.map((theme) => (
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
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                    Growth
                                </p>
                                <h2 className="mt-2 text-2xl font-black">
                                    New users
                                </h2>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {ranges.map((range) => (
                                    <Link
                                        key={range.key}
                                        href={getAdminHref({
                                            rangeKey: range.key,
                                            type: selectedSuggestionType,
                                        })}
                                        scroll={false}
                                        className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                                            selectedRange.key === range.key
                                                ? "border-lime-300/45 bg-lime-300 text-slate-950"
                                                : "border-white/10 bg-slate-950/60 text-slate-200 hover:border-lime-300/30 hover:bg-white/[0.1]"
                                        }`}
                                    >
                                        {range.label}
                                    </Link>
                                ))}
                            </div>
                        </div>
                        <AdminBarChart
                            entries={newUserChartEntries}
                            maxValue={maxDailyUsers}
                            label="new users"
                            grain={selectedRange.grain}
                            emptyLabel="No new-user data for this range."
                        />
                        <div className="mt-6 border-t border-white/10 pt-5">
                            <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                MAUs
                            </p>
                            <h2 className="mt-2 text-2xl font-black">
                                Monthly active users
                            </h2>
                            <p className="mt-1 text-xs font-semibold text-slate-400">
                                Distinct users with tracked VAIVIA activity in the prior 30 days.
                            </p>
                            <AdminBarChart
                                entries={mauChartEntries}
                                maxValue={maxMonthlyActiveUsers}
                                label="active users"
                                grain={selectedRange.grain}
                                emptyLabel="No activity data for this range."
                            />
                        </div>
                        <p className="mt-3 text-xs font-semibold text-slate-400">
                            {formatDate(startKey)} to {formatDate(endKey)}
                        </p>
                    </div>
                </section>

                <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                Feature requests
                            </p>
                            <h2 className="mt-2 text-2xl font-black">
                                Submitted by users
                            </h2>
                        </div>
                        <p className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs font-black text-slate-300">
                            {suggestions.length} open
                        </p>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                        {suggestionTypeTabs.map((tab) => (
                            <Link
                                key={tab.key}
                                href={getAdminHref({
                                    rangeKey: selectedRange.key,
                                    type: tab.key,
                                })}
                                scroll={false}
                                className={`inline-flex min-h-10 items-center justify-center rounded-full border px-4 text-xs font-black uppercase tracking-[0.16em] transition ${
                                    selectedSuggestionType === tab.key
                                        ? "border-lime-300/45 bg-lime-300 text-slate-950"
                                        : "border-white/10 bg-slate-950/60 text-slate-200 hover:border-lime-300/30 hover:bg-white/[0.1]"
                                }`}
                            >
                                {tab.label}
                            </Link>
                        ))}
                    </div>

                    <div className="mt-5 space-y-3">
                        {suggestions.length > 0 ? (
                            suggestions.map((suggestion) => {
                                return (
                                    <article
                                        key={suggestion.id}
                                        className={`rounded-[1.25rem] border border-l-8 border-white/10 bg-slate-950/55 p-4 text-white transition ${getSuggestionStatusBorderClass(
                                            suggestion.status
                                        )}`}
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <p className="text-xs font-black uppercase tracking-[0.16em] text-lime-200/80">
                                                    {suggestion.suggestion_type} · {formatStatusLabel(suggestion.status)}
                                                </p>
                                                <h3 className="mt-2 text-lg font-black">
                                                    {suggestion.title || "Untitled request"}
                                                </h3>
                                                <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-300">
                                                    {suggestion.message}
                                                </p>
                                                <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-400">
                                                    <span>{formatDate(suggestion.created_at.slice(0, 10))}</span>
                                                    {suggestion.contact_email ? (
                                                        <span>{suggestion.contact_email}</span>
                                                    ) : null}
                                                    {suggestion.current_path ? (
                                                        <span>{suggestion.current_path}</span>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 flex-wrap gap-2">
                                                <FeatureSuggestionStatusSelect
                                                    action={updateFeatureSuggestionStatus}
                                                    status={suggestion.status}
                                                    suggestionId={suggestion.id}
                                                />
                                            </div>
                                        </div>
                                    </article>
                                );
                            })
                        ) : (
                            <p className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm font-bold text-slate-300">
                                No feature requests have been submitted yet.
                            </p>
                        )}
                    </div>
                    <div className="mt-6 border-t border-white/10 pt-5">
                        <Link
                            href="/admin/closed-tasks"
                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] px-5 text-sm font-black text-slate-100 transition hover:bg-white/[0.14]"
                        >
                            Show closed tasks
                            {closedSuggestionCount ? ` (${closedSuggestionCount})` : ""}
                        </Link>
                    </div>
                </section>
            </div>
            {showLevelMetrics ? (
                <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/75 px-4 py-8 backdrop-blur-xl">
                    <div className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#050712] text-white shadow-2xl shadow-black/60">
                        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.26em] text-lime-200">
                                    Points
                                </p>
                                <h2 className="mt-2 text-3xl font-black">
                                    User level metrics
                                </h2>
                                <p className="mt-2 text-sm font-semibold text-slate-400">
                                    Distribution is calculated from the VAIVIA points ledger.
                                </p>
                            </div>
                            <Link
                                href="/admin"
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 transition hover:bg-white/[0.14]"
                                aria-label="Close level metrics"
                            >
                                <X className="h-5 w-5" aria-hidden="true" />
                            </Link>
                        </div>
                        <div className="max-h-[70vh] overflow-y-auto p-6">
                            <div className="space-y-3">
                                {stats.levelDistribution.map((level) => (
                                    <div
                                        key={level.level}
                                        className="grid gap-3 rounded-[1.25rem] border border-white/10 bg-white/[0.05] p-4 sm:grid-cols-[5rem_1fr_8rem_6rem] sm:items-center"
                                    >
                                        <p className="text-sm font-black text-lime-200">
                                            Level {level.level}
                                        </p>
                                        <div className="min-w-0">
                                            <p className="font-black text-white">
                                                {level.levelName}
                                            </p>
                                            <p className="text-xs font-semibold text-slate-400">
                                                {formatPointRange(level.minPoints, level.maxPoints)} points
                                            </p>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-slate-950/70">
                                            <div
                                                className={`h-full rounded-full ${
                                                    level.count > 0
                                                        ? "bg-lime-300"
                                                        : "bg-transparent"
                                                }`}
                                                style={{
                                                    width:
                                                        level.count > 0
                                                            ? `${(level.count / totalLevelUsers) * 100}%`
                                                            : "0%",
                                                }}
                                            />
                                        </div>
                                        <p className="text-right text-sm font-black text-slate-100">
                                            {level.count} user{level.count === 1 ? "" : "s"}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </main>
    );
}
