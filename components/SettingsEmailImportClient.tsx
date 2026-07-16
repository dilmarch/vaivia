"use client";

import { useEffect, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";

type EmailImportAddressResponse = {
    id: string;
    address: string;
    createdAt: string;
    rotatedAt: string | null;
    error?: string;
};

export default function SettingsEmailImportClient() {
    const [address, setAddress] = useState<EmailImportAddressResponse | null>(
        null
    );
    const [isLoading, setIsLoading] = useState(true);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [didCopy, setDidCopy] = useState(false);

    async function loadAddress() {
        setIsLoading(true);
        setErrorMessage("");

        try {
            const response = await fetch("/api/settings/email-import-address", {
                method: "GET",
                credentials: "same-origin",
            });
            const result = (await response.json()) as EmailImportAddressResponse;

            if (!response.ok) {
                throw new Error(result.error || "Could not load forwarding address.");
            }

            setAddress(result);
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "Could not load forwarding address."
            );
        } finally {
            setIsLoading(false);
        }
    }

    async function copyAddress() {
        if (!address?.address) return;

        try {
            await navigator.clipboard.writeText(address.address);
            setDidCopy(true);
            setStatusMessage("Forwarding address copied.");
            window.setTimeout(() => setDidCopy(false), 1800);
        } catch {
            setStatusMessage("Could not copy automatically. Select and copy it manually.");
        }
    }

    async function regenerateAddress() {
        setIsRegenerating(true);
        setErrorMessage("");
        setStatusMessage("");

        try {
            const response = await fetch("/api/settings/email-import-address", {
                method: "POST",
                credentials: "same-origin",
            });
            const result = (await response.json()) as EmailImportAddressResponse;

            if (!response.ok) {
                throw new Error(result.error || "Could not regenerate address.");
            }

            setAddress(result);
            setStatusMessage("New forwarding address created. The old one is disabled.");
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "Could not regenerate address."
            );
        } finally {
            setIsRegenerating(false);
        }
    }

    useEffect(() => {
        void loadAddress();
    }, []);

    return (
        <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5">
            <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-lime-200">
                    Email import
                </p>
                <h2 className="mt-2 text-2xl font-black">
                    Forward travel confirmations
                </h2>
                <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
                    Forward airline confirmations and receipts to VAIVIA and we&apos;ll
                    prepare the flight details for review.
                </p>
            </div>

            <div className="mt-5 rounded-[1.25rem] border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                    Your private forwarding address
                </p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <code className="min-h-12 flex-1 overflow-x-auto rounded-full border border-white/10 bg-black/35 px-4 py-3 text-sm font-black text-lime-100">
                        {isLoading
                            ? "Creating forwarding address..."
                            : address?.address || "Unavailable"}
                    </code>
                    <button
                        type="button"
                        onClick={copyAddress}
                        disabled={!address?.address || isLoading}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {didCopy ? (
                            <Check className="h-4 w-4" aria-hidden="true" />
                        ) : (
                            <Copy className="h-4 w-4" aria-hidden="true" />
                        )}
                        Copy
                    </button>
                </div>
                <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
                    This address is private to your account. Regenerating the address
                    disables the old one, so confirmations sent to the previous address
                    will no longer import.
                </p>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                    type="button"
                    onClick={regenerateAddress}
                    disabled={isLoading || isRegenerating}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 px-5 text-sm font-black text-slate-100 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <RefreshCw
                        className={`h-4 w-4 ${isRegenerating ? "animate-spin" : ""}`}
                        aria-hidden="true"
                    />
                    {isRegenerating ? "Regenerating..." : "Regenerate address"}
                </button>
                {statusMessage ? (
                    <p className="text-sm font-bold text-lime-100">
                        {statusMessage}
                    </p>
                ) : null}
                {errorMessage ? (
                    <p className="text-sm font-bold text-red-100">
                        {errorMessage}
                    </p>
                ) : null}
            </div>
        </section>
    );
}
