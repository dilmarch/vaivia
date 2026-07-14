"use client";

import { Download, RefreshCw, Server, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SettingsDataClientProps = {
    deletionRequestedAt?: string | null;
    supabaseUrl?: string | null;
};

type DataExportRecord = {
    id: string;
    status: "requested" | "preparing" | "ready" | "expired" | "failed";
    requested_at: string;
    processing_started_at: string | null;
    completed_at: string | null;
    expires_at: string | null;
    export_schema_version: string | null;
    failure_code: string | null;
    downloaded_at: string | null;
};

type GenericSupabaseClient = {
    from: (table: string) => {
        select: (columns: string) => {
            eq: (
                column: string,
                value: string
            ) => Promise<{ data: unknown[] | null; error: Error | null }>;
        };
    };
    rpc: (
        functionName: "request_current_user_account_deletion"
    ) => Promise<{ data: null; error: Error | null }>;
};

async function readJsonResponse<T>(response: Response): Promise<T & { error?: string; code?: string }> {
    const text = await response.text();
    if (!text.trim()) {
        return {
            error: response.ok ? undefined : "The server returned an empty response.",
        } as T & { error?: string; code?: string };
    }

    try {
        return JSON.parse(text) as T & { error?: string; code?: string };
    } catch {
        return {
            error: response.ok
                ? "The server returned an unreadable response."
                : text.slice(0, 240) || "The server returned an unreadable error.",
        } as T & { error?: string; code?: string };
    }
}

function projectLabel(supabaseUrl?: string | null) {
    if (!supabaseUrl) return "Current VAIVIA Supabase project";

    try {
        const host = new URL(supabaseUrl).host;
        return host.replace(".supabase.co", "");
    } catch {
        return "Current VAIVIA Supabase project";
    }
}

function formatDate(value?: string | null) {
    if (!value) return "";
    return new Intl.DateTimeFormat("en", {
        month: "long",
        day: "numeric",
        year: "numeric",
    }).format(new Date(value));
}

export default function SettingsDataClient({
    deletionRequestedAt,
    supabaseUrl,
}: SettingsDataClientProps) {
    const [isExporting, setIsExporting] = useState(false);
    const [isLoadingExports, setIsLoadingExports] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isExportConfirmOpen, setIsExportConfirmOpen] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [exports, setExports] = useState<DataExportRecord[]>([]);
    const [requestedAt, setRequestedAt] = useState(deletionRequestedAt || null);
    const currentProjectLabel = projectLabel(supabaseUrl);

    async function loadExports() {
        setIsLoadingExports(true);
        try {
            const response = await fetch("/api/data-exports", {
                method: "GET",
                headers: { Accept: "application/json" },
            });
            const payload = await readJsonResponse<{
                exports?: DataExportRecord[];
                error?: string;
            }>(response);
            if (!response.ok) {
                throw new Error(payload.error || "Could not load data exports.");
            }
            setExports(payload.exports || []);
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not load data exports."
            );
        } finally {
            setIsLoadingExports(false);
        }
    }

    useEffect(() => {
        void loadExports();
    }, []);

    async function requestDataExport() {
        setIsExporting(true);
        setError(null);
        setStatus(null);
        setIsExportConfirmOpen(false);

        try {
            const response = await fetch("/api/data-exports", {
                method: "POST",
                headers: { Accept: "application/json" },
            });
            const payload = await readJsonResponse<{
                error?: string;
                code?: string;
            }>(response);

            if (!response.ok) {
                throw new Error(
                    payload.code === "reauth_required"
                        ? "Please sign out and sign back in before requesting your data export."
                        : payload.error || "Could not request data export."
                );
            }

            setStatus(
                "Your VAIVIA data export is ready. Use the download button below before the link expires."
            );
            await loadExports();
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not request account data export."
            );
        } finally {
            setIsExporting(false);
        }
    }

    async function downloadExport(exportId: string) {
        setError(null);
        setStatus(null);

        try {
            const response = await fetch(`/api/data-exports/${exportId}/download`, {
                method: "POST",
                headers: { Accept: "application/json" },
            });
            const payload = await readJsonResponse<{
                url?: string;
                error?: string;
            }>(response);
            if (!response.ok || !payload.url) {
                throw new Error(payload.error || "Could not create download link.");
            }
            window.location.assign(payload.url);
            setStatus("Your secure download link has opened.");
            await loadExports();
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not download data export."
            );
        }
    }

    async function requestDeletion() {
        const confirmed = window.confirm(
            "Request account deletion? This records your request so VAIVIA can delete your account data according to applicable privacy rights and legal retention requirements."
        );
        if (!confirmed) return;

        const finalConfirm = window.confirm(
            "Are you sure? This is a serious privacy request and may remove your trips, passport stamps, friends, settings, and account data once processed."
        );
        if (!finalConfirm) return;

        setIsDeleting(true);
        setError(null);
        setStatus(null);

        try {
            const supabase = createClient() as unknown as GenericSupabaseClient;
            const { error } = await supabase.rpc(
                "request_current_user_account_deletion"
            );
            if (error) throw error;

            const now = new Date().toISOString();
            setRequestedAt(now);
            setStatus(
                "Your account deletion request has been recorded. VAIVIA will process it subject to applicable privacy law and any required legal retention."
            );
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not request account deletion."
            );
        } finally {
            setIsDeleting(false);
        }
    }

    return (
        <div className="space-y-5">
            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5">
                <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-lime-300 text-slate-950">
                        <Server className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-lime-200">
                            Data centre
                        </p>
                        <h2 className="mt-2 text-2xl font-black">
                            Data hosting location
                        </h2>
                        <p className="mt-1 text-sm font-semibold leading-6 text-slate-400">
                            VAIVIA currently stores account data in the active
                            Supabase project. More data centre options can be
                            added later if VAIVIA provisions additional regions.
                        </p>
                        <label className="mt-4 block">
                            <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/80">
                                Current option
                            </span>
                            <select
                                disabled
                                value="supabase-current"
                                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-bold text-white opacity-80"
                            >
                                <option value="supabase-current">
                                    {currentProjectLabel} (current Supabase
                                    project)
                                </option>
                            </select>
                        </label>
                    </div>
                </div>
            </section>

            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-lime-200">
                    Privacy controls
                </p>
                <h2 className="mt-2 text-2xl font-black">Your account data</h2>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-400">
                    Download a copy of the personal information associated with
                    your VAIVIA account. Your export will include structured
                    JSON and CSV files, plus eligible files you uploaded.
                </p>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">
                    Export and deletion are separate actions. Download links are
                    short-lived, stored privately, and require an authenticated
                    account session.
                </p>

                {requestedAt ? (
                    <p className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-bold text-amber-100">
                        Account deletion requested on {formatDate(requestedAt)}.
                    </p>
                ) : null}

                {status ? (
                    <p className="mt-4 rounded-2xl border border-lime-300/25 bg-lime-300/10 p-4 text-sm font-bold text-lime-100">
                        {status}
                    </p>
                ) : null}

                {error ? (
                    <p className="mt-4 rounded-2xl border border-red-300/30 bg-red-500/10 p-4 text-sm font-bold text-red-100">
                        {error}
                    </p>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={() => setIsExportConfirmOpen(true)}
                        disabled={isExporting || isDeleting}
                        className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-lime-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                    >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        {isExporting ? "Preparing..." : "Download my data"}
                    </button>
                    <button
                        type="button"
                        onClick={() => void loadExports()}
                        disabled={isExporting || isDeleting || isLoadingExports}
                        className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-6 text-sm font-black text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                    >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        Refresh status
                    </button>
                    <button
                        type="button"
                        onClick={requestDeletion}
                        disabled={isExporting || isDeleting}
                        className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border border-red-300/30 bg-red-500/10 px-6 text-sm font-black text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                    >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        {isDeleting ? "Requesting..." : "Delete account"}
                    </button>
                </div>

                <div className="mt-5 space-y-3">
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-lime-200/80">
                        Export requests
                    </h3>
                    {isLoadingExports ? (
                        <p className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm font-bold text-slate-300">
                            Loading export status...
                        </p>
                    ) : exports.length === 0 ? (
                        <p className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm font-bold text-slate-300">
                            No data exports requested yet.
                        </p>
                    ) : (
                        exports.map((dataExport) => {
                            const isReady =
                                dataExport.status === "ready" &&
                                dataExport.expires_at &&
                                new Date(dataExport.expires_at).getTime() >
                                    Date.now();

                            return (
                                <div
                                    key={dataExport.id}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4"
                                >
                                    <div>
                                        <p className="text-sm font-black text-white">
                                            {dataExport.status
                                                .replaceAll("_", " ")
                                                .toUpperCase()}
                                        </p>
                                        <p className="mt-1 text-xs font-semibold text-slate-400">
                                            Requested {formatDate(dataExport.requested_at)}
                                            {dataExport.expires_at
                                                ? ` · Expires ${formatDate(dataExport.expires_at)}`
                                                : ""}
                                        </p>
                                        {dataExport.failure_code ? (
                                            <p className="mt-1 text-xs font-semibold text-red-200">
                                                {dataExport.failure_code}
                                            </p>
                                        ) : null}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void downloadExport(dataExport.id)}
                                        disabled={!isReady}
                                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-lime-300 px-5 text-xs font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                                    >
                                        <Download className="h-4 w-4" aria-hidden="true" />
                                        Download ZIP
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            </section>

            {isExportConfirmOpen ? (
                <div
                    className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/75 px-4 pb-[calc(1rem+var(--safe-area-bottom))] pt-[calc(1rem+var(--safe-area-top))] backdrop-blur-xl sm:items-center"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="data-export-confirm-title"
                >
                    <div className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#080511] text-white shadow-2xl shadow-black/50">
                        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-[radial-gradient(circle_at_10%_0%,rgba(var(--vaivia-neon-rgb),0.18),transparent_32%),linear-gradient(135deg,rgba(124,60,255,0.16),transparent_60%)] p-6">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.26em] text-lime-200/80">
                                    Privacy export
                                </p>
                                <h3
                                    id="data-export-confirm-title"
                                    className="mt-2 text-2xl font-black"
                                >
                                    Download my data
                                </h3>
                                <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                                    VAIVIA will prepare a private ZIP with
                                    structured JSON and CSV files, plus eligible
                                    files you uploaded.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsExportConfirmOpen(false)}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-slate-100 transition hover:bg-white/[0.12]"
                                aria-label="Close data export confirmation"
                            >
                                <X className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </div>
                        <div className="space-y-4 p-6">
                            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
                                <p className="text-sm font-black text-white">
                                    Before VAIVIA starts
                                </p>
                                <ul className="mt-3 space-y-2 text-sm font-semibold leading-6 text-slate-300">
                                    <li>
                                        The download link will be authenticated,
                                        short-lived, and stored privately.
                                    </li>
                                    <li>
                                        Passwords, sessions, API keys, and push
                                        encryption secrets are never included.
                                    </li>
                                    <li>
                                        If your session is not recent, VAIVIA may
                                        ask you to sign in again first.
                                    </li>
                                </ul>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    onClick={() => void requestDataExport()}
                                    disabled={isExporting}
                                    className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-lime-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <Download className="h-4 w-4" aria-hidden="true" />
                                    {isExporting ? "Preparing..." : "Prepare ZIP"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsExportConfirmOpen(false)}
                                    className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] px-6 text-sm font-black text-slate-100 transition hover:bg-white/[0.14]"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
