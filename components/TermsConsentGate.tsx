"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { renderTermsMarkdown } from "@/lib/terms/defaultTerms";

type TermsVersion = {
    id: string;
    title: string;
    content: string;
    requires_acceptance: boolean;
    published_at: string;
};

type ProfileConsentState = {
    marketing_emails_consent: boolean | null;
    marketing_emails_consent_decided_at: string | null;
    terms_declined_version_id: string | null;
    terms_decline_delete_after: string | null;
    account_deletion_requested_at: string | null;
};

type TermsConsentGateProps = {
    userId: string;
};

type GateRpcClient = {
    rpc: (
        functionName:
            | "accept_current_terms"
            | "decline_current_terms"
            | "request_account_deletion_after_terms_decline"
    ) => Promise<{ data: string | null; error: Error | null }>;
} & {
    rpc: (
        functionName: "set_marketing_email_consent",
        args: { consent: boolean }
    ) => Promise<{ data: null; error: Error | null }>;
};

type GateQueryResult = Promise<{ data: unknown[] | null; error: Error | null }>;
type GateFilterBuilder = GateQueryResult & {
    eq: (column: string, value: unknown) => GateFilterBuilder;
    maybeSingle: () => Promise<{ data: unknown | null; error: Error | null }>;
};

type GateQueryClient = {
    from: (table: string) => {
        select: (columns: string) => {
            order: (
                column: string,
                options?: { ascending?: boolean }
            ) => {
                limit: (count: number) => {
                    maybeSingle: () => Promise<{ data: unknown | null; error: Error | null }>;
                };
            };
            eq: (column: string, value: unknown) => GateFilterBuilder;
        };
    };
};

function formatDate(value?: string | null) {
    if (!value) return "30 days from today";
    return new Intl.DateTimeFormat("en", {
        month: "long",
        day: "numeric",
        year: "numeric",
    }).format(new Date(value));
}

export default function TermsConsentGate({ userId }: TermsConsentGateProps) {
    const [terms, setTerms] = useState<TermsVersion | null>(null);
    const [hasAcceptedCurrentTerms, setHasAcceptedCurrentTerms] = useState(true);
    const [profileState, setProfileState] = useState<ProfileConsentState | null>(
        null
    );
    const [isLoaded, setIsLoaded] = useState(false);
    const [isWorking, setIsWorking] = useState(false);
    const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const supabase = createClient();

        async function loadConsentState() {
            const queryClient = supabase as unknown as GateQueryClient;
            const [{ data: termsData }, { data: profileData }] = await Promise.all([
                queryClient
                    .from("terms_versions")
                    .select("id,title,content,requires_acceptance,published_at")
                    .order("published_at", { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                queryClient
                    .from("user_profiles")
                    .select(
                        "marketing_emails_consent,marketing_emails_consent_decided_at,terms_declined_version_id,terms_decline_delete_after,account_deletion_requested_at"
                    )
                    .eq("id", userId)
                    .maybeSingle(),
            ]);

            const currentTerms = termsData as TermsVersion | null;
            let accepted = true;

            if (currentTerms?.requires_acceptance) {
                const { data: acceptanceData } = await queryClient
                    .from("user_terms_acceptances")
                    .select("id")
                    .eq("user_id", userId)
                    .eq("terms_version_id", currentTerms.id)
                    .maybeSingle();

                accepted = Boolean(acceptanceData);
            }

            if (!isMounted) return;
            setTerms(currentTerms);
            setHasAcceptedCurrentTerms(accepted);
            setProfileState(profileData as ProfileConsentState | null);
            setIsLoaded(true);
        }

        void loadConsentState();

        return () => {
            isMounted = false;
        };
    }, [userId]);

    const blocks = useMemo(
        () => renderTermsMarkdown(terms?.content || ""),
        [terms?.content]
    );
    const isDeclined =
        Boolean(terms?.id) &&
        profileState?.terms_declined_version_id === terms?.id &&
        !hasAcceptedCurrentTerms;
    const needsTermsAcceptance =
        isLoaded &&
        Boolean(terms?.requires_acceptance) &&
        !hasAcceptedCurrentTerms &&
        !isDeclined;
    const needsMarketingDecision =
        isLoaded &&
        hasAcceptedCurrentTerms &&
        profileState?.marketing_emails_consent_decided_at == null;

    async function acceptTerms() {
        setIsWorking(true);
        setError(null);

        try {
            const supabase = createClient() as unknown as GateRpcClient;
            const { error } = await supabase.rpc("accept_current_terms");
            if (error) throw error;
            setHasAcceptedCurrentTerms(true);
            setProfileState((current) =>
                current
                    ? {
                          ...current,
                          terms_declined_version_id: null,
                          terms_decline_delete_after: null,
                          account_deletion_requested_at: null,
                      }
                    : current
            );
            setShowDeclineConfirm(false);
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not accept the current terms."
            );
        } finally {
            setIsWorking(false);
        }
    }

    async function declineAndSignOut() {
        setIsWorking(true);
        setError(null);

        try {
            const supabase = createClient() as unknown as GateRpcClient &
                ReturnType<typeof createClient>;
            const { error } = await supabase.rpc("decline_current_terms");
            if (error) throw error;
            await supabase.auth.signOut();
            window.location.href = "/auth/login?terms=declined";
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not record the terms decision."
            );
        } finally {
            setIsWorking(false);
        }
    }

    async function setMarketingConsent(consent: boolean) {
        setIsWorking(true);
        setError(null);

        try {
            const supabase = createClient() as unknown as GateRpcClient;
            const { error } = await supabase.rpc("set_marketing_email_consent", {
                consent,
            });
            if (error) throw error;
            setProfileState((current) => ({
                marketing_emails_consent: consent,
                marketing_emails_consent_decided_at: new Date().toISOString(),
                terms_declined_version_id:
                    current?.terms_declined_version_id || null,
                terms_decline_delete_after:
                    current?.terms_decline_delete_after || null,
                account_deletion_requested_at:
                    current?.account_deletion_requested_at || null,
            }));
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not save marketing consent."
            );
        } finally {
            setIsWorking(false);
        }
    }

    async function exportAccountInfo() {
        setIsWorking(true);
        setError(null);

        try {
            const supabase = createClient();
            const queryClient = supabase as unknown as GateQueryClient;
            const [
                profile,
                preferences,
                trips,
                passportStamps,
                bucketList,
                points,
            ] = await Promise.all([
                queryClient.from("user_profiles").select("*").eq("id", userId),
                queryClient.from("user_preferences").select("*").eq("user_id", userId),
                queryClient.from("trips").select("*").eq("user_id", userId),
                queryClient
                    .from("user_passport_stamps")
                    .select("*")
                    .eq("user_id", userId),
                queryClient
                    .from("travel_bucket_list_items")
                    .select("*")
                    .eq("user_id", userId),
                queryClient.from("user_points").select("*").eq("user_id", userId),
            ]);
            const payload = {
                exportedAt: new Date().toISOString(),
                profile: profile.data || [],
                preferences: preferences.data || [],
                trips: trips.data || [],
                passportStamps: passportStamps.data || [],
                bucketList: bucketList.data || [],
                points: points.data || [],
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "vaivia-account-export.json";
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not export account information."
            );
        } finally {
            setIsWorking(false);
        }
    }

    async function requestAccountDeletion() {
        const confirmed = window.confirm(
            "Request account deletion? VAIVIA will mark your account for deletion after the terms grace period."
        );
        if (!confirmed) return;

        setIsWorking(true);
        setError(null);

        try {
            const supabase = createClient() as unknown as GateRpcClient;
            const { error } = await supabase.rpc(
                "request_account_deletion_after_terms_decline"
            );
            if (error) throw error;
            setProfileState((current) =>
                current
                    ? {
                          ...current,
                          account_deletion_requested_at: new Date().toISOString(),
                      }
                    : current
            );
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not request account deletion."
            );
        } finally {
            setIsWorking(false);
        }
    }

    if (!isLoaded || (!needsTermsAcceptance && !needsMarketingDecision && !isDeclined)) {
        return null;
    }

    if (isDeclined) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#05020a]/95 px-4 py-8 text-white backdrop-blur-xl">
                <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-white/10 bg-[#03030a] p-6 shadow-2xl shadow-black/50 md:p-8">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                        Terms required
                    </p>
                    <h1 className="mt-3 text-3xl font-black md:text-5xl">
                        Accept the current Terms to keep using VAIVIA.
                    </h1>
                    <p className="mt-4 text-sm font-semibold leading-7 text-slate-300">
                        You can no longer use VAIVIA&apos;s interactive features
                        without accepting the current Terms. Your account has not
                        been deleted. You can view or export your information,
                        request account deletion, or accept the current Terms
                        until {formatDate(profileState?.terms_decline_delete_after)}.
                    </p>
                    {profileState?.account_deletion_requested_at ? (
                        <p className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-bold text-amber-100">
                            Account deletion has been requested.
                        </p>
                    ) : null}
                    {error ? (
                        <p className="mt-4 rounded-2xl border border-red-300/30 bg-red-500/10 p-4 text-sm font-bold text-red-100">
                            {error}
                        </p>
                    ) : null}
                    <div className="mt-6 flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={acceptTerms}
                            disabled={isWorking}
                            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-lime-300 px-6 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:opacity-60"
                        >
                            Accept Terms
                        </button>
                        <button
                            type="button"
                            onClick={exportAccountInfo}
                            disabled={isWorking}
                            className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] px-6 text-sm font-black text-slate-100 transition hover:bg-white/[0.14] disabled:opacity-60"
                        >
                            Export info
                        </button>
                        <button
                            type="button"
                            onClick={requestAccountDeletion}
                            disabled={isWorking}
                            className="inline-flex min-h-12 items-center justify-center rounded-full border border-red-300/30 bg-red-500/10 px-6 text-sm font-black text-red-100 transition hover:bg-red-500/20 disabled:opacity-60"
                        >
                            Delete account
                        </button>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#05020a]/80 px-4 py-8 text-white backdrop-blur-xl">
            <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-white/10 bg-[#03030a] p-6 shadow-2xl shadow-black/50 md:p-8">
                {needsTermsAcceptance ? (
                    <>
                        <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                            Updated Terms
                        </p>
                        <h1 className="mt-3 text-3xl font-black">
                            {terms?.title || "VAIVIA Terms"}
                        </h1>
                        <div className="mt-5 max-h-[55vh] space-y-4 overflow-y-auto rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                            {blocks.map((block) =>
                                block.type === "h1" || block.type === "h2" ? (
                                    <h2
                                        key={block.key}
                                        className="text-lg font-black text-lime-100"
                                    >
                                        {block.text}
                                    </h2>
                                ) : (
                                    <p
                                        key={block.key}
                                        className="text-sm font-semibold leading-6 text-slate-300"
                                    >
                                        {block.text}
                                    </p>
                                )
                            )}
                        </div>
                        {error ? (
                            <p className="mt-4 text-sm font-bold text-red-200">
                                {error}
                            </p>
                        ) : null}
                        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                            <div className="flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowDeclineConfirm(true)}
                                    disabled={isWorking}
                                    className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] px-6 text-sm font-black text-slate-100 transition hover:bg-white/[0.14] disabled:opacity-60"
                                >
                                    I do not accept
                                </button>
                                <button
                                    type="button"
                                    onClick={acceptTerms}
                                    disabled={isWorking}
                                    className="inline-flex min-h-12 items-center justify-center rounded-full bg-lime-300 px-6 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:opacity-60"
                                >
                                    I accept
                                </button>
                            </div>
                        </div>
                        {showDeclineConfirm ? (
                            <div className="mt-5 rounded-[1.5rem] border border-amber-300/30 bg-amber-300/10 p-4">
                                <p className="text-sm font-bold leading-6 text-amber-100">
                                    You must accept the updated Terms to continue
                                    using your account. Proceed and sign out, or
                                    go back?
                                </p>
                                <div className="mt-4 flex flex-wrap gap-3">
                                    <button
                                        type="button"
                                        onClick={declineAndSignOut}
                                        disabled={isWorking}
                                        className="rounded-full bg-amber-300 px-5 py-2.5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:opacity-60"
                                    >
                                        Proceed
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowDeclineConfirm(false)}
                                        disabled={isWorking}
                                        className="rounded-full border border-white/10 bg-white/[0.08] px-5 py-2.5 text-sm font-black text-slate-100 transition hover:bg-white/[0.14] disabled:opacity-60"
                                    >
                                        Go back
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </>
                ) : (
                    <>
                        <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                            Communications
                        </p>
                        <h1 className="mt-3 text-3xl font-black">
                            Marketing emails
                        </h1>
                        <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">
                            Would you like to receive occasional emails about
                            VAIVIA promotions, feature updates, and app news? You
                            can change this any time in Communications settings.
                        </p>
                        {error ? (
                            <p className="mt-4 text-sm font-bold text-red-200">
                                {error}
                            </p>
                        ) : null}
                        <div className="mt-6 flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={() => setMarketingConsent(true)}
                                disabled={isWorking}
                                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-lime-300 px-6 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:opacity-60"
                            >
                                Yes, send updates
                            </button>
                            <button
                                type="button"
                                onClick={() => setMarketingConsent(false)}
                                disabled={isWorking}
                                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] px-6 text-sm font-black text-slate-100 transition hover:bg-white/[0.14] disabled:opacity-60"
                            >
                                No thanks
                            </button>
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}
