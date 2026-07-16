import { FileText, Inbox, Paperclip, Plane, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Json } from "@/src/types/supabase";
import { createClient } from "@/lib/supabase/server";

type ImportPageProps = {
    params: Promise<{
        importId: string;
    }>;
};

type TravelEmailImportRow = {
    id: string;
    attachment_count: number;
    created_at: string;
    extracted_data: Json | null;
    extraction_confidence: number | null;
    extraction_error: string | null;
    extraction_model: string | null;
    import_type: string | null;
    processed_at: string | null;
    provider: string;
    recipient_email: string | null;
    requires_data_review: boolean;
    sender_email: string | null;
    status: string;
    subject: string | null;
};

type TravelEmailImportAttachmentRow = {
    id: string;
    filename: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    storage_path: string | null;
};

type TravelEmailImportItemRow = {
    id: string;
    confidence: number | null;
    extracted_data: Json;
    item_order: number;
    item_type: string;
};

function formatDate(value?: string | null) {
    if (!value) return "Not processed yet";

    return new Date(value).toLocaleString("en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function formatPercent(value?: number | null) {
    if (typeof value !== "number") return "Pending";
    return `${Math.round(value * 100)}%`;
}

function formatBytes(value?: number | null) {
    if (!value) return "Unknown size";
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function stringifyJson(value: Json) {
    if (typeof value === "string") return value;
    return JSON.stringify(value, null, 2);
}

function getUserFacingExtractionError(value?: string | null) {
    if (!value) return "";

    if (value === "resend_api_key_requires_full_access") {
        return "VAIVIA received your email, but email processing is temporarily unavailable. Please try again later.";
    }

    return "VAIVIA received your email, but could not finish processing it yet. Please try again later.";
}

function getItemTitle(item: TravelEmailImportItemRow) {
    const data = item.extracted_data;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        return item.item_type;
    }

    const title =
        data.title ||
        data.name ||
        data.flight_number ||
        data.confirmation_number ||
        data.booking_reference;

    return typeof title === "string" && title.trim() ? title : item.item_type;
}

export default async function ImportReviewPage({ params }: ImportPageProps) {
    const { importId } = await params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const [
        { data: importRow, error: importError },
        { data: attachments, error: attachmentsError },
        { data: items, error: itemsError },
    ] = await Promise.all([
        supabase
            .from("travel_email_imports")
            .select(
                "id,attachment_count,created_at,extracted_data,extraction_confidence,extraction_error,extraction_model,import_type,processed_at,provider,recipient_email,requires_data_review,sender_email,status,subject"
            )
            .eq("id", importId)
            .eq("user_id", user.id)
            .maybeSingle(),
        supabase
            .from("travel_email_import_attachments")
            .select("id,filename,mime_type,size_bytes,storage_path")
            .eq("import_id", importId)
            .order("created_at", { ascending: true }),
        supabase
            .from("travel_email_import_items")
            .select("id,confidence,extracted_data,item_order,item_type")
            .eq("import_id", importId)
            .order("item_order", { ascending: true }),
    ]);

    if (importError) {
        console.error("Could not load travel email import:", {
            message: importError.message,
            code: importError.code,
            details: importError.details,
            hint: importError.hint,
            importId,
            userId: user.id,
        });
        throw new Error("Could not load travel email import");
    }

    if (!importRow) notFound();

    if (attachmentsError || itemsError) {
        console.error("Could not load travel email import review details:", {
            attachmentsError,
            itemsError,
            importId,
            userId: user.id,
        });
        throw new Error("Could not load travel email import details");
    }

    const reviewImport = importRow as TravelEmailImportRow;
    const reviewAttachments = (attachments || []) as TravelEmailImportAttachmentRow[];
    const reviewItems = (items || []) as TravelEmailImportItemRow[];

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-10 pt-[calc(8rem+var(--safe-area-top))] text-white md:py-10 md:pl-28">
            <div className="mx-auto max-w-5xl space-y-6">
                <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#03030a]/90 shadow-2xl shadow-black/30">
                    <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.18),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent)] p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                                    Travel email import
                                </p>
                                <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
                                    {reviewImport.subject || "Imported confirmation"}
                                </h1>
                                <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-300">
                                    VAIVIA received this forwarded confirmation and prepared
                                    the details below for review.
                                </p>
                            </div>
                            <Link
                                href="/settings?section=communications"
                                className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-slate-200 transition hover:bg-white/[0.08]"
                            >
                                Email import settings
                            </Link>
                        </div>
                    </div>

                    <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                                Status
                            </p>
                            <p className="mt-2 text-lg font-black capitalize text-lime-100">
                                {reviewImport.status.replaceAll("_", " ")}
                            </p>
                        </div>
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                                Received
                            </p>
                            <p className="mt-2 text-sm font-bold text-white">
                                {formatDate(reviewImport.created_at)}
                            </p>
                        </div>
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                                Processed
                            </p>
                            <p className="mt-2 text-sm font-bold text-white">
                                {formatDate(reviewImport.processed_at)}
                            </p>
                        </div>
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                                Confidence
                            </p>
                            <p className="mt-2 text-lg font-black text-lime-100">
                                {formatPercent(reviewImport.extraction_confidence)}
                            </p>
                        </div>
                    </div>
                </section>

                {reviewImport.extraction_error ? (
                    <section className="rounded-[2rem] border border-red-300/20 bg-red-950/20 p-5 text-red-100">
                        <p className="text-xs font-black uppercase tracking-[0.22em]">
                            Extraction needs attention
                        </p>
                        <p className="mt-2 text-sm font-semibold">
                            {getUserFacingExtractionError(
                                reviewImport.extraction_error
                            )}
                        </p>
                    </section>
                ) : null}

                <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                    <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-lime-300/20 bg-slate-950 text-lime-200">
                                <Plane className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/80">
                                    Prepared items
                                </p>
                                <h2 className="text-xl font-black">
                                    {reviewItems.length
                                        ? `${reviewItems.length} item${
                                              reviewItems.length === 1 ? "" : "s"
                                          } found`
                                        : "No prepared items yet"}
                                </h2>
                            </div>
                        </div>

                        <div className="mt-5 space-y-4">
                            {reviewItems.length ? (
                                reviewItems.map((item) => (
                                    <article
                                        key={item.id}
                                        className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4"
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                                                    {item.item_type.replaceAll("_", " ")}
                                                </p>
                                                <h3 className="mt-1 text-lg font-black">
                                                    {getItemTitle(item)}
                                                </h3>
                                            </div>
                                            <span className="rounded-full border border-lime-300/20 px-3 py-1 text-xs font-black text-lime-100">
                                                {formatPercent(item.confidence)}
                                            </span>
                                        </div>
                                        <pre className="mt-4 max-h-72 overflow-auto rounded-[1rem] border border-white/10 bg-black/40 p-3 text-xs font-semibold leading-5 text-slate-200">
                                            {stringifyJson(item.extracted_data)}
                                        </pre>
                                    </article>
                                ))
                            ) : (
                                <div className="rounded-[1.5rem] border border-dashed border-white/15 bg-slate-950/50 p-5 text-sm font-semibold text-slate-400">
                                    Once processing finishes, VAIVIA will list detected
                                    flights, stays, receipts, or itinerary details here.
                                </div>
                            )}
                        </div>
                    </div>

                    <aside className="space-y-5">
                        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
                            <div className="flex items-center gap-3">
                                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-lime-300/20 bg-slate-950 text-lime-200">
                                    <Inbox className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/80">
                                        Email details
                                    </p>
                                    <h2 className="text-xl font-black">Source</h2>
                                </div>
                            </div>
                            <dl className="mt-5 space-y-3 text-sm">
                                <div>
                                    <dt className="font-black uppercase tracking-[0.16em] text-slate-500">
                                        From
                                    </dt>
                                    <dd className="mt-1 break-words font-bold text-slate-200">
                                        {reviewImport.sender_email || "Unknown sender"}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="font-black uppercase tracking-[0.16em] text-slate-500">
                                        To
                                    </dt>
                                    <dd className="mt-1 break-words font-bold text-slate-200">
                                        {reviewImport.recipient_email || "Private import address"}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="font-black uppercase tracking-[0.16em] text-slate-500">
                                        Provider
                                    </dt>
                                    <dd className="mt-1 font-bold capitalize text-slate-200">
                                        {reviewImport.provider}
                                    </dd>
                                </div>
                            </dl>
                        </section>

                        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
                            <div className="flex items-center gap-3">
                                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-lime-300/20 bg-slate-950 text-lime-200">
                                    <Paperclip className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/80">
                                        Attachments
                                    </p>
                                    <h2 className="text-xl font-black">
                                        {reviewAttachments.length || reviewImport.attachment_count}
                                    </h2>
                                </div>
                            </div>
                            <div className="mt-5 space-y-3">
                                {reviewAttachments.length ? (
                                    reviewAttachments.map((attachment) => (
                                        <div
                                            key={attachment.id}
                                            className="rounded-[1.25rem] border border-white/10 bg-slate-950/60 p-3"
                                        >
                                            <p className="break-words text-sm font-black text-white">
                                                {attachment.filename || "Attachment"}
                                            </p>
                                            <p className="mt-1 text-xs font-semibold text-slate-400">
                                                {attachment.mime_type || "Unknown type"} ·{" "}
                                                {formatBytes(attachment.size_bytes)}
                                            </p>
                                        </div>
                                    ))
                                ) : (
                                    <p className="rounded-[1.25rem] border border-dashed border-white/15 bg-slate-950/50 p-3 text-sm font-semibold text-slate-400">
                                        No stored attachments for this import.
                                    </p>
                                )}
                            </div>
                        </section>

                        <section className="rounded-[2rem] border border-lime-300/15 bg-lime-300/10 p-5">
                            <div className="flex items-start gap-3">
                                <ShieldCheck
                                    className="mt-1 h-5 w-5 shrink-0 text-lime-200"
                                    aria-hidden="true"
                                />
                                <p className="text-sm font-semibold leading-6 text-lime-50">
                                    This page only loads imports owned by your account.
                                    Private raw email and storage records remain protected
                                    by Supabase policies.
                                </p>
                            </div>
                        </section>
                    </aside>
                </section>

                {reviewImport.extracted_data ? (
                    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-lime-300/20 bg-slate-950 text-lime-200">
                                <FileText className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200/80">
                                    Raw extraction payload
                                </p>
                                <h2 className="text-xl font-black">Import summary</h2>
                            </div>
                        </div>
                        <pre className="mt-5 max-h-96 overflow-auto rounded-[1rem] border border-white/10 bg-black/40 p-4 text-xs font-semibold leading-5 text-slate-200">
                            {stringifyJson(reviewImport.extracted_data)}
                        </pre>
                    </section>
                ) : null}
            </div>
        </main>
    );
}
