"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Copy, RefreshCw, ShieldCheck, X } from "lucide-react";

type EmailImportAddress = {
    id: string;
    address: string;
    isActive: boolean;
    isPrimary: boolean;
    addressFormat: "legacy" | "username";
    createdAt: string;
    rotatedAt: string | null;
    retiredAt: string | null;
};

type EmailImportAddressResponse = {
    primary: EmailImportAddress | null;
    addresses: EmailImportAddress[];
    usernameRequired: boolean;
    code?: string;
    error?: string;
};

export default function SettingsEmailImportClient() {
    const [addressState, setAddressState] =
        useState<EmailImportAddressResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [isRotationOpen, setIsRotationOpen] = useState(false);
    const [deactivatePrevious, setDeactivatePrevious] = useState(false);
    const [rotationRequestKey, setRotationRequestKey] = useState("");
    const [statusMessage, setStatusMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [copiedAddressId, setCopiedAddressId] = useState<string | null>(null);

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

            setAddressState(result);
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

    async function copyAddress(address: EmailImportAddress) {
        try {
            await navigator.clipboard.writeText(address.address);
            setCopiedAddressId(address.id);
            setStatusMessage("Forwarding address copied.");
            window.setTimeout(() => setCopiedAddressId(null), 1800);
        } catch {
            setStatusMessage("Could not copy automatically. Select and copy it manually.");
        }
    }

    function openRotation() {
        setDeactivatePrevious(false);
        setRotationRequestKey(window.crypto.randomUUID());
        setStatusMessage("");
        setErrorMessage("");
        setIsRotationOpen(true);
    }

    async function regenerateAddress() {
        if (!rotationRequestKey) return;

        setIsRegenerating(true);
        setErrorMessage("");
        setStatusMessage("");

        try {
            const response = await fetch("/api/settings/email-import-address", {
                method: "POST",
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    deactivatePrevious,
                    requestKey: rotationRequestKey,
                }),
            });
            const result = (await response.json()) as EmailImportAddressResponse;

            if (!response.ok) {
                throw new Error(result.error || "Could not create a new address.");
            }

            setAddressState(result);
            setIsRotationOpen(false);
            setStatusMessage(
                deactivatePrevious
                    ? "New forwarding address created. The previous address is now inactive."
                    : "New forwarding address created. The previous address still works."
            );
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "Could not create a new address."
            );
        } finally {
            setIsRegenerating(false);
        }
    }

    useEffect(() => {
        void loadAddress();
    }, []);

    const primaryAddress = addressState?.primary || null;
    const otherAddresses =
        addressState?.addresses.filter((address) => !address.isPrimary) || [];

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
                    Forward airline, stay, and transport confirmations to this
                    private VAIVIA address and we&apos;ll prepare the details for
                    review.
                </p>
            </div>

            {addressState?.usernameRequired ? (
                <div className="mt-5 rounded-[1.25rem] border border-amber-300/25 bg-amber-300/10 p-4 text-sm font-bold text-amber-50">
                    Choose a valid username before creating a recognizable forwarding
                    address. Any address already shown below will continue working.
                    <Link
                        href="/settings?section=profile"
                        className="ml-2 underline decoration-2 underline-offset-4"
                    >
                        Set username
                    </Link>
                </div>
            ) : null}

            <div className="mt-5 rounded-[1.25rem] border border-white/10 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                        Primary forwarding address
                    </p>
                    {primaryAddress ? (
                        <span className="rounded-full bg-lime-300/15 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.14em] text-lime-100">
                            Active · Primary
                        </span>
                    ) : null}
                </div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <code className="min-h-12 flex-1 overflow-x-auto rounded-full border border-white/10 bg-black/35 px-4 py-3 text-sm font-black text-lime-100">
                        {isLoading
                            ? "Creating forwarding address..."
                            : primaryAddress?.address || "Unavailable"}
                    </code>
                    <button
                        type="button"
                        onClick={() =>
                            primaryAddress ? copyAddress(primaryAddress) : undefined
                        }
                        disabled={!primaryAddress || isLoading}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {copiedAddressId === primaryAddress?.id ? (
                            <Check className="h-4 w-4" aria-hidden="true" />
                        ) : (
                            <Copy className="h-4 w-4" aria-hidden="true" />
                        )}
                        Copy
                    </button>
                </div>
                <div className="mt-3 flex items-start gap-2 text-xs font-semibold leading-5 text-slate-500">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-lime-200" />
                    <p>
                        The recognizable username helps you identify the address. Its
                        random suffix makes unwanted guessing much harder and never
                        grants access to your VAIVIA account.
                    </p>
                </div>
            </div>

            {otherAddresses.length > 0 ? (
                <div className="mt-5">
                    <h3 className="text-sm font-black text-white">
                        Previous addresses
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-slate-400">
                        Active previous addresses can still receive forwarded emails.
                    </p>
                    <div className="mt-3 space-y-2">
                        {otherAddresses.map((address) => (
                            <div
                                key={address.id}
                                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-3 sm:flex-row sm:items-center"
                            >
                                <code className="min-w-0 flex-1 overflow-x-auto text-xs font-bold text-slate-200">
                                    {address.address}
                                </code>
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`rounded-full px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.12em] ${
                                            address.isActive
                                                ? "bg-lime-300/15 text-lime-100"
                                                : "bg-white/10 text-slate-400"
                                        }`}
                                    >
                                        {address.isActive ? "Active" : "Inactive"}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => copyAddress(address)}
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-slate-200 transition hover:bg-white/10"
                                        aria-label={`Copy ${address.isActive ? "active" : "inactive"} previous forwarding address`}
                                    >
                                        {copiedAddressId === address.id ? (
                                            <Check className="h-4 w-4" aria-hidden="true" />
                                        ) : (
                                            <Copy className="h-4 w-4" aria-hidden="true" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                    type="button"
                    onClick={openRotation}
                    disabled={
                        isLoading ||
                        isRegenerating ||
                        addressState?.usernameRequired
                    }
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 px-5 text-sm font-black text-slate-100 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Rotate address
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

            {isRotationOpen ? (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                    role="presentation"
                    onMouseDown={(event) => {
                        if (event.currentTarget === event.target && !isRegenerating) {
                            setIsRotationOpen(false);
                        }
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="rotate-forwarding-address-title"
                        className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#070914] p-6 text-white shadow-2xl"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-lime-200">
                                    Private address
                                </p>
                                <h3
                                    id="rotate-forwarding-address-title"
                                    className="mt-2 text-2xl font-black"
                                >
                                    Rotate forwarding address?
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsRotationOpen(false)}
                                disabled={isRegenerating}
                                className="rounded-full border border-white/10 p-2 text-slate-300 hover:bg-white/10"
                                aria-label="Close"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>

                        <p className="mt-4 text-sm font-semibold leading-6 text-slate-300">
                            VAIVIA will create a new primary address. Keeping the old
                            address active protects saved contacts and forwarding rules.
                        </p>

                        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                            <input
                                type="checkbox"
                                checked={deactivatePrevious}
                                onChange={(event) =>
                                    setDeactivatePrevious(event.target.checked)
                                }
                                className="mt-1 h-4 w-4 accent-lime-300"
                            />
                            <span>
                                <span className="block text-sm font-black">
                                    Deactivate the current address
                                </span>
                                <span className="mt-1 block text-xs font-semibold leading-5 text-amber-100/80">
                                    Confirming this option breaks forwarding rules and
                                    saved contacts that still use the current address.
                                    The historical record will not be deleted.
                                </span>
                            </span>
                        </label>

                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setIsRotationOpen(false)}
                                disabled={isRegenerating}
                                className="rounded-full border border-white/10 px-5 py-2.5 text-sm font-black text-slate-200 hover:bg-white/10"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={regenerateAddress}
                                disabled={isRegenerating}
                                className="inline-flex items-center justify-center gap-2 rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 hover:bg-lime-200 disabled:opacity-60"
                            >
                                <RefreshCw
                                    className={`h-4 w-4 ${
                                        isRegenerating ? "animate-spin" : ""
                                    }`}
                                    aria-hidden="true"
                                />
                                {isRegenerating
                                    ? "Creating..."
                                    : deactivatePrevious
                                      ? "Create and deactivate old"
                                      : "Create and keep old active"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}
