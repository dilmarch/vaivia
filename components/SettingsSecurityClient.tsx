"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { Check, Fingerprint, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type SettingsSecurityClientProps = {
    canChangePassword: boolean;
    authProviderLabels: string[];
    biometricEnabled: boolean;
    updateBiometricAction: (formData: FormData) => void | Promise<void>;
};

function getPasswordUnavailableMessage(authProviderLabels: string[]) {
    if (authProviderLabels.length === 0) {
        return "Password changes are available only for email/password accounts.";
    }

    return `Password changes are unavailable because this account signs in with ${authProviderLabels.join(
        " and "
    )}.`;
}

export default function SettingsSecurityClient({
    canChangePassword,
    authProviderLabels,
    biometricEnabled,
    updateBiometricAction,
}: SettingsSecurityClientProps) {
    const [isBiometricEnabled, setIsBiometricEnabled] =
        useState(biometricEnabled);
    const [isBiometricSupported, setIsBiometricSupported] = useState<
        boolean | null
    >(null);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [isSavingPassword, setIsSavingPassword] = useState(false);
    const [isPending, startTransition] = useTransition();

    const providerSummary = useMemo(
        () =>
            authProviderLabels.length > 0
                ? authProviderLabels.join(", ")
                : "Email/password",
        [authProviderLabels]
    );

    useEffect(() => {
        let isMounted = true;

        async function detectBiometricSupport() {
            if (
                typeof window === "undefined" ||
                !("PublicKeyCredential" in window)
            ) {
                if (isMounted) setIsBiometricSupported(false);
                return;
            }

            try {
                const isAvailable =
                    await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
                if (isMounted) setIsBiometricSupported(isAvailable);
            } catch {
                if (isMounted) setIsBiometricSupported(false);
            }
        }

        void detectBiometricSupport();

        return () => {
            isMounted = false;
        };
    }, []);

    function saveBiometricPreference(nextValue: boolean) {
        setIsBiometricEnabled(nextValue);

        const formData = new FormData();
        formData.set("biometric_login_enabled", nextValue ? "true" : "false");

        startTransition(() => {
            void updateBiometricAction(formData);
        });
    }

    async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPasswordStatus(null);
        setPasswordError(null);

        if (!canChangePassword) return;

        if (newPassword.length < 6) {
            setPasswordError("Password must be at least 6 characters.");
            return;
        }

        if (newPassword !== confirmPassword) {
            setPasswordError("Passwords do not match.");
            return;
        }

        setIsSavingPassword(true);

        try {
            const supabase = createClient();
            const { error } = await supabase.auth.updateUser({
                password: newPassword,
            });

            if (error) throw error;

            setNewPassword("");
            setConfirmPassword("");
            setPasswordStatus("Password updated.");
        } catch (error) {
            setPasswordError(
                error instanceof Error
                    ? error.message
                    : "Could not update password."
            );
        } finally {
            setIsSavingPassword(false);
        }
    }

    return (
        <div className="space-y-5">
            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-2xl">
                        <div className="flex items-center gap-3">
                            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-lime-300/25 bg-slate-950 text-lime-200 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.16)]">
                                <Fingerprint className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="text-xl font-black">Face ID</h2>
                                <p className="mt-1 text-sm font-semibold text-slate-400">
                                    Use device biometrics on supported PWA devices.
                                </p>
                            </div>
                        </div>
                        <p className="mt-4 text-sm font-semibold leading-6 text-slate-300">
                            VAIVIA will remember this preference for your account.
                            Face ID availability depends on the device, browser, and
                            installed PWA support.
                        </p>
                    </div>

                    <button
                        type="button"
                        disabled={isBiometricSupported === false || isPending}
                        onClick={() =>
                            saveBiometricPreference(!isBiometricEnabled)
                        }
                        className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-black transition ${
                            isBiometricEnabled
                                ? "bg-lime-300 text-slate-950 shadow-[0_0_26px_rgba(var(--vaivia-neon-rgb),0.24)] hover:bg-lime-200"
                                : "border border-white/10 bg-white/[0.08] text-white hover:bg-white/[0.14]"
                        } disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                        {isBiometricEnabled ? (
                            <Check className="h-4 w-4" aria-hidden="true" />
                        ) : (
                            <Fingerprint className="h-4 w-4" aria-hidden="true" />
                        )}
                        {isBiometricEnabled ? "Enabled" : "Enable Face ID"}
                    </button>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/55 p-4 text-sm font-bold text-slate-300">
                    {isBiometricSupported === null
                        ? "Checking this device..."
                        : isBiometricSupported
                          ? "This device reports biometric/passkey support."
                          : "This device or browser does not currently report Face ID/passkey support."}
                </div>
            </section>

            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-lime-300/25 bg-slate-950 text-lime-200 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.16)]">
                        <KeyRound className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                        <h2 className="text-xl font-black">Password</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-400">
                            Sign-in method: {providerSummary}
                        </p>
                    </div>
                </div>

                {canChangePassword ? (
                    <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                    New password
                                </span>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(event) =>
                                        setNewPassword(event.target.value)
                                    }
                                    autoComplete="new-password"
                                    className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-bold text-white outline-none focus:border-lime-300/55"
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                    Confirm password
                                </span>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(event) =>
                                        setConfirmPassword(event.target.value)
                                    }
                                    autoComplete="new-password"
                                    className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-bold text-white outline-none focus:border-lime-300/55"
                                />
                            </label>
                        </div>

                        {passwordError ? (
                            <p className="rounded-2xl border border-red-300/30 bg-red-300/10 px-4 py-3 text-sm font-bold text-red-100">
                                {passwordError}
                            </p>
                        ) : null}
                        {passwordStatus ? (
                            <p className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 text-sm font-bold text-emerald-100">
                                {passwordStatus}
                            </p>
                        ) : null}

                        <button
                            type="submit"
                            disabled={isSavingPassword}
                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Lock className="h-4 w-4" aria-hidden="true" />
                            {isSavingPassword ? "Saving..." : "Change password"}
                        </button>
                    </form>
                ) : (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                        <div className="flex items-start gap-3">
                            <ShieldCheck
                                className="mt-0.5 h-5 w-5 shrink-0 text-lime-200"
                                aria-hidden="true"
                            />
                            <p className="text-sm font-bold leading-6 text-slate-300">
                                {getPasswordUnavailableMessage(authProviderLabels)}
                            </p>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
