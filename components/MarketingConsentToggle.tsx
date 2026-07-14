"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MarketingConsentToggleProps = {
    initialEnabled: boolean;
};

type MarketingConsentClient = {
    rpc: (
        functionName: "set_marketing_email_consent",
        args: { consent: boolean }
    ) => Promise<{ data: null; error: Error | null }>;
};

export default function MarketingConsentToggle({
    initialEnabled,
}: MarketingConsentToggleProps) {
    const [enabled, setEnabled] = useState(initialEnabled);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function updateConsent(nextEnabled: boolean) {
        setEnabled(nextEnabled);
        setIsSaving(true);
        setError(null);

        try {
            const supabase = createClient() as unknown as MarketingConsentClient;
            const { error } = await supabase.rpc("set_marketing_email_consent", {
                consent: nextEnabled,
            });
            if (error) throw error;
        } catch (error) {
            setEnabled(!nextEnabled);
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not update marketing consent."
            );
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="flex flex-col items-end gap-2">
            <button
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={isSaving}
                onClick={() => updateConsent(!enabled)}
                className={`relative inline-flex h-8 w-16 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    enabled
                        ? "border-lime-300/50 bg-lime-300 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.22)]"
                        : "border-white/10 bg-slate-950"
                }`}
            >
                <span
                    className={`absolute h-6 w-6 rounded-full bg-white shadow-xl shadow-black/30 transition ${
                        enabled ? "translate-x-8" : "translate-x-1"
                    }`}
                    aria-hidden="true"
                />
                <span className="sr-only">
                    {enabled
                        ? "Disable marketing emails"
                        : "Enable marketing emails"}
                </span>
            </button>
            <span
                className={`text-xs font-black uppercase tracking-[0.14em] ${
                    enabled ? "text-lime-100" : "text-slate-500"
                }`}
            >
                {isSaving ? "Saving..." : enabled ? "On" : "Off"}
            </span>
            {error ? (
                <p className="max-w-52 text-right text-xs font-bold text-red-200">
                    {error}
                </p>
            ) : null}
        </div>
    );
}
