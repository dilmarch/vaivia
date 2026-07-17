import { Inbox, MailPlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
    formatImportConfidence,
    formatImportDate,
    getImportItemRouteLabel,
    getTravelEmailImportStatusClasses,
    getTravelEmailImportStatusLabel,
    isTravelImportReviewSchemaMissingError,
} from "@/lib/travelEmailImports";
import type { Json } from "@/src/types/supabase";

type ImportRow = {
    id: string;
    created_at: string;
    extraction_confidence: number | null;
    import_type: string | null;
    imported_at?: string | null;
    matched_trip_id?: string | null;
    sender_email: string | null;
    status: string;
    subject: string | null;
};

type ImportItemRow = {
    import_id: string;
    item_type: string;
    extracted_data: Json;
};

function displayImportType(value?: string | null) {
    if (!value) return "Unknown";
    return value.replaceAll("_", " ");
}

async function loadTravelImportsForInbox(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string
) {
    const richQuery = await supabase
        .from("travel_email_imports")
        .select(
            "id,created_at,extraction_confidence,import_type,imported_at,matched_trip_id,sender_email,status,subject"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

    if (
        !richQuery.error ||
        !isTravelImportReviewSchemaMissingError(richQuery.error)
    ) {
        return richQuery;
    }

    console.warn("Travel import review columns are not available yet; using inbox fallback query.", {
        userId,
        code: richQuery.error.code,
    });

    return supabase
        .from("travel_email_imports")
        .select(
            "id,created_at,extraction_confidence,import_type,sender_email,status,subject"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
}

export default async function ImportsInboxPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const { data: imports, error: importsError } = await loadTravelImportsForInbox(
        supabase,
        user.id
    );

    if (importsError) {
        console.error("Could not load travel imports:", {
            message: importsError.message,
            code: importsError.code,
            details: importsError.details,
            hint: importsError.hint,
            userId: user.id,
        });
        throw new Error("Could not load travel imports");
    }

    const importRows = (imports || []) as ImportRow[];
    const importIds = importRows.map((row) => row.id);
    const { data: items, error: itemsError } = importIds.length
        ? await supabase
              .from("travel_email_import_items")
              .select("import_id,item_type,extracted_data")
              .in("import_id", importIds)
        : { data: [], error: null };

    if (itemsError) {
        console.error("Could not load travel import item counts:", {
            message: itemsError.message,
            code: itemsError.code,
            details: itemsError.details,
            hint: itemsError.hint,
            userId: user.id,
        });
        throw new Error("Could not load travel import items");
    }

    const itemsByImportId = new Map<string, ImportItemRow[]>();
    for (const item of ((items || []) as ImportItemRow[])) {
        const current = itemsByImportId.get(item.import_id) || [];
        current.push(item);
        itemsByImportId.set(item.import_id, current);
    }
    const matchedTripIds = Array.from(
        new Set(
            importRows
                .map((row) => row.matched_trip_id)
                .filter((id): id is string => Boolean(id))
        )
    );
    const { data: matchedTrips } = matchedTripIds.length
        ? await supabase
              .from("trips")
              .select("id,slug,title,destination,start_date,end_date")
              .in("id", matchedTripIds)
        : { data: [] };
    const tripsById = new Map(
        ((matchedTrips || []) as Array<{
            id: string;
            slug: string | null;
            title: string;
            destination: string | null;
            start_date: string | null;
            end_date: string | null;
        }>).map((trip) => [trip.id, trip])
    );

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-10 pt-[calc(8rem+var(--safe-area-top))] text-white md:py-10 md:pl-28">
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
                                Forward confirmations and receipts to VAIVIA, then
                                review the prepared details before adding them to a
                                trip.
                            </p>
                        </div>
                        <Link
                            href="/settings?section=communications"
                            className="rounded-full border border-lime-300/25 bg-lime-300/10 px-4 py-2 text-sm font-black text-lime-100 transition hover:bg-lime-300/20"
                        >
                            Email Import Settings
                        </Link>
                    </div>
                </section>

                {importRows.length > 0 ? (
                    <section className="grid gap-4">
                        {importRows.map((row) => {
                            const preparedItems = itemsByImportId.get(row.id) || [];
                            const firstItem = preparedItems[0];
                            const matchedTrip = row.matched_trip_id
                                ? tripsById.get(row.matched_trip_id)
                                : null;

                            return (
                                <article
                                    key={row.id}
                                    className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20"
                                >
                                    <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span
                                                    className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${getTravelEmailImportStatusClasses(
                                                        row.status
                                                    )}`}
                                                >
                                                    {getTravelEmailImportStatusLabel(
                                                        row.status
                                                    )}
                                                </span>
                                                <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-300">
                                                    {displayImportType(row.import_type)}
                                                </span>
                                            </div>
                                            <h2 className="mt-3 truncate text-2xl font-black">
                                                {row.subject || "Forwarded confirmation"}
                                            </h2>
                                            <p className="mt-1 text-sm font-semibold text-slate-400">
                                                {row.sender_email || "Unknown sender"} ·{" "}
                                                {formatImportDate(row.created_at)}
                                            </p>
                                            {row.status === "imported" && matchedTrip ? (
                                                <p className="mt-2 text-sm font-black text-lime-100">
                                                    Added to {matchedTrip.title}
                                                </p>
                                            ) : null}
                                            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                                                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                                                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                                                        Prepared
                                                    </p>
                                                    <p className="mt-1 font-black text-white">
                                                        {preparedItems.length} item
                                                        {preparedItems.length === 1
                                                            ? ""
                                                            : "s"}
                                                    </p>
                                                </div>
                                                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                                                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                                                        Confidence
                                                    </p>
                                                    <p className="mt-1 font-black text-white">
                                                        {formatImportConfidence(
                                                            row.extraction_confidence
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                                                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                                                        First item
                                                    </p>
                                                    <p className="mt-1 truncate font-black text-white">
                                                        {firstItem
                                                            ? getImportItemRouteLabel(
                                                                  firstItem.extracted_data
                                                              )
                                                            : "Not prepared yet"}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <Link
                                            href={
                                                row.status === "imported" && matchedTrip
                                                    ? `/trips/${
                                                          matchedTrip.slug ||
                                                          matchedTrip.id
                                                      }?tab=journey`
                                                    : `/imports/${row.id}`
                                            }
                                            className="inline-flex h-11 items-center justify-center rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950 transition hover:bg-lime-200"
                                        >
                                            {row.status === "imported"
                                                ? "View trip"
                                                : "Review import"}
                                        </Link>
                                    </div>
                                </article>
                            );
                        })}
                    </section>
                ) : (
                    <section className="rounded-[2rem] border border-dashed border-white/15 bg-white/[0.04] p-8 text-center">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-lime-300/25 bg-lime-300/10 text-lime-200">
                            <MailPlus className="h-7 w-7" aria-hidden="true" />
                        </div>
                        <h2 className="mt-5 text-2xl font-black">
                            No travel imports yet
                        </h2>
                        <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-6 text-slate-400">
                            Forward airline confirmations and receipts to your
                            private VAIVIA email address. They&apos;ll appear here
                            when they&apos;re ready to review.
                        </p>
                        <Link
                            href="/settings?section=communications"
                            className="mt-5 inline-flex rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 transition hover:bg-lime-200"
                        >
                            Set up email imports
                        </Link>
                    </section>
                )}

                {importRows.length > 0 ? (
                    <section className="rounded-[2rem] border border-lime-300/15 bg-lime-300/10 p-5">
                        <div className="flex gap-3">
                            <Inbox className="mt-1 h-5 w-5 shrink-0 text-lime-200" />
                            <p className="text-sm font-semibold leading-6 text-lime-50">
                                Flight imports can now be reviewed and added to trips.
                                Other imported travel details remain review-only for now.
                            </p>
                        </div>
                    </section>
                ) : null}
            </div>
        </main>
    );
}
