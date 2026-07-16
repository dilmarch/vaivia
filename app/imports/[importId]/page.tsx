/* eslint-disable @typescript-eslint/no-explicit-any */
import { AlertTriangle, ArrowLeft, CheckCircle2, Plane, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type ImportPageProps = {
    params: Promise<{
        importId: string;
    }>;
};

type ExtractedSegment = {
    marketingAirlineName?: string | null;
    marketingAirlineIata?: string | null;
    operatingAirlineName?: string | null;
    operatingAirlineIata?: string | null;
    flightNumber?: string | null;
    departureAirportIata?: string | null;
    departureAirportName?: string | null;
    departureLocalDate?: string | null;
    departureLocalTime?: string | null;
    arrivalAirportIata?: string | null;
    arrivalAirportName?: string | null;
    arrivalLocalDate?: string | null;
    arrivalLocalTime?: string | null;
    confidence?: number | null;
    warnings?: string[] | null;
};

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function asSegment(value: unknown): ExtractedSegment {
    return asRecord(value) as ExtractedSegment;
}

function formatPercent(value?: number | null) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "Review";
    return `${Math.round(value * 100)}%`;
}

function formatRoute(segment: ExtractedSegment) {
    const from = [segment.departureAirportIata, segment.departureAirportName]
        .filter(Boolean)
        .join(" ");
    const to = [segment.arrivalAirportIata, segment.arrivalAirportName]
        .filter(Boolean)
        .join(" ");

    if (from && to) return `${from} -> ${to}`;
    return from || to || "Route needs review";
}

function formatFlight(segment: ExtractedSegment) {
    const airline = [segment.marketingAirlineIata, segment.flightNumber]
        .filter(Boolean)
        .join(" ");

    return (
        airline ||
        segment.marketingAirlineName ||
        segment.operatingAirlineName ||
        "Flight details need review"
    );
}

function formatTime(segment: ExtractedSegment) {
    const depart = [segment.departureLocalDate, segment.departureLocalTime]
        .filter(Boolean)
        .join(" ");
    const arrive = [segment.arrivalLocalDate, segment.arrivalLocalTime]
        .filter(Boolean)
        .join(" ");

    if (depart && arrive) return `${depart} -> ${arrive}`;
    return depart || arrive || "Date and time need review";
}

export default async function TravelEmailImportPage({ params }: ImportPageProps) {
    const { importId } = await params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const [
        { data: importRow, error: importError },
        { data: itemRows },
        { data: attachmentRows },
    ] =
        await Promise.all([
            (supabase.from as any)("travel_email_imports")
                .select(
                    "id,subject,sender_email,status,import_type,extraction_confidence,extraction_model,requires_data_review,extraction_error,created_at,processed_at"
                )
                .eq("id", importId)
                .eq("user_id", user.id)
                .maybeSingle(),
            (supabase.from as any)("travel_email_import_items")
                .select("id,item_type,item_order,confidence,extracted_data")
                .eq("import_id", importId)
                .order("item_order", { ascending: true }),
            (supabase.from as any)("travel_email_import_attachments")
                .select("id,filename,mime_type,size_bytes")
                .eq("import_id", importId)
                .order("created_at", { ascending: true }),
        ]);

    if (importError) {
        console.error("Could not load travel email import:", {
            message: importError.message,
            code: importError.code,
            details: importError.details,
            hint: importError.hint,
            importId,
        });
        throw new Error("Could not load travel email import.");
    }

    if (!importRow) notFound();

    const segments = ((itemRows || []) as Array<{
        id: string;
        confidence?: number | null;
        extracted_data?: unknown;
    }>).map((row) => ({
        id: row.id,
        confidence: row.confidence,
        segment: asSegment(row.extracted_data),
    }));
    const status = String(importRow.status || "needs_review");
    const isReady = status === "ready";
    const isFailed = status === "failed";

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-10 pt-[calc(8rem+var(--safe-area-top))] text-white md:py-10 md:pl-28">
            <div className="mx-auto max-w-5xl space-y-6">
                <Link
                    href="/notifications"
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-black text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.12]"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to notifications
                </Link>

                <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#03030a]/90 shadow-2xl shadow-black/30">
                    <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.18),transparent_36%)] p-6">
                        <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                            Forwarded confirmation
                        </p>
                        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <h1 className="text-3xl font-black tracking-tight md:text-4xl">
                                    {importRow.subject || "Travel email import"}
                                </h1>
                                <p className="mt-2 text-sm font-semibold text-slate-400">
                                    From {importRow.sender_email || "unknown sender"}
                                </p>
                            </div>
                            <span
                                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.14em] ${
                                    isReady
                                        ? "bg-lime-300 text-slate-950"
                                        : isFailed
                                          ? "border border-red-300/30 bg-red-400/10 text-red-100"
                                          : "border border-amber-300/30 bg-amber-300/10 text-amber-100"
                                }`}
                            >
                                {isReady ? (
                                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                ) : (
                                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                                )}
                                {status.replace(/_/g, " ")}
                            </span>
                        </div>
                    </div>

                    <div className="grid gap-4 p-6 sm:grid-cols-3">
                        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                                Confidence
                            </p>
                            <p className="mt-2 text-2xl font-black text-lime-100">
                                {formatPercent(importRow.extraction_confidence)}
                            </p>
                        </div>
                        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                                Type
                            </p>
                            <p className="mt-2 text-lg font-black capitalize text-white">
                                {String(importRow.import_type || "unknown").replace(/_/g, " ")}
                            </p>
                        </div>
                        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                                Model
                            </p>
                            <p className="mt-2 text-sm font-black text-white">
                                {importRow.extraction_model || "Pending"}
                            </p>
                        </div>
                    </div>

                    {importRow.extraction_error ? (
                        <div className="mx-6 rounded-[1.5rem] border border-amber-300/20 bg-amber-300/10 p-4 text-sm font-semibold leading-6 text-amber-100">
                            {importRow.extraction_error}
                        </div>
                    ) : null}

                    <div className="space-y-4 p-6">
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-lime-300/25 bg-lime-300/10 text-lime-100">
                                <Sparkles className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="text-xl font-black">
                                    Extracted travel details
                                </h2>
                                <p className="text-sm font-semibold text-slate-400">
                                    Review before adding anything to a trip.
                                </p>
                            </div>
                        </div>

                        {segments.length > 0 ? (
                            <div className="grid gap-3">
                                {segments.map(({ id, confidence, segment }, index) => (
                                    <article
                                        key={id}
                                        className="rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-4"
                                    >
                                        <div className="flex items-start gap-3">
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-lime-300/20 bg-slate-950/80 text-lime-200">
                                                <Plane className="h-5 w-5" aria-hidden="true" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <h3 className="text-lg font-black">
                                                        Segment {index + 1}
                                                    </h3>
                                                    <span className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-xs font-black text-slate-300">
                                                        {formatPercent(confidence)}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-base font-black text-lime-100">
                                                    {formatRoute(segment)}
                                                </p>
                                                <p className="mt-1 text-sm font-semibold text-slate-300">
                                                    {formatFlight(segment)}
                                                </p>
                                                <p className="mt-1 text-sm font-semibold text-slate-400">
                                                    {formatTime(segment)}
                                                </p>
                                                {segment.warnings?.length ? (
                                                    <p className="mt-2 text-xs font-semibold text-amber-100">
                                                        {segment.warnings.join("; ")}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5 text-sm font-semibold text-slate-400">
                                No travel segments were extracted yet.
                            </div>
                        )}

                        {attachmentRows?.length ? (
                            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4">
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                                    Stored attachments
                                </p>
                                <div className="mt-3 grid gap-2">
                                    {(attachmentRows as Array<{
                                        id: string;
                                        filename?: string | null;
                                        mime_type?: string | null;
                                        size_bytes?: number | null;
                                    }>).map((attachment) => (
                                        <div
                                            key={attachment.id}
                                            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2"
                                        >
                                            <span className="text-sm font-black text-white">
                                                {attachment.filename || "Attachment"}
                                            </span>
                                            <span className="text-xs font-semibold text-slate-400">
                                                {attachment.mime_type || "unknown"} ·{" "}
                                                {Math.round(
                                                    Number(attachment.size_bytes || 0) /
                                                        1024
                                                )}{" "}
                                                KB
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </section>
            </div>
        </main>
    );
}
