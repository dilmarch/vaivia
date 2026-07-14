"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { FormEvent } from "react";
import {
    Check,
    Fingerprint,
    KeyRound,
    Lock,
    Plus,
    ShieldCheck,
    Trash2,
} from "lucide-react";
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

type PasskeyListItem = {
    id: string;
    friendly_name?: string;
    created_at: string;
    last_used_at?: string;
};

type PasskeyAuthClient = ReturnType<typeof createClient> & {
    auth: ReturnType<typeof createClient>["auth"] & {
        registerPasskey: () => Promise<{
            data: PasskeyListItem | null;
            error: Error | null;
        }>;
        passkey: {
            list: () => Promise<{
                data: PasskeyListItem[] | null;
                error: Error | null;
            }>;
            delete: (params: {
                passkeyId: string;
            }) => Promise<{ data: null; error: Error | null }>;
        };
    };
};

function formatPasskeyDate(value?: string | null) {
    if (!value) return "Never used";
    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(value));
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
    const [passkeys, setPasskeys] = useState<PasskeyListItem[]>([]);
    const [passkeyStatus, setPasskeyStatus] = useState<string | null>(null);
    const [passkeyError, setPasskeyError] = useState<string | null>(null);
    const [isLoadingPasskeys, setIsLoadingPasskeys] = useState(true);
    const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
    const [deletingPasskeyId, setDeletingPasskeyId] = useState<string | null>(
        null
    );
    const [isPending, startTransition] = useTransition();

    const providerSummary = useMemo(
        () =>
            authProviderLabels.length > 0
                ? authProviderLabels.join(", ")
                : "Email/password",
        [authProviderLabels]
    );
    const isBiometricUnavailable = isBiometricSupported === false;

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

    useEffect(() => {
        let isMounted = true;

        async function loadPasskeys() {
            setIsLoadingPasskeys(true);
            setPasskeyError(null);

            try {
                const supabase = createClient() as PasskeyAuthClient;
                const { data, error } = await supabase.auth.passkey.list();
                if (error) throw error;
                if (isMounted) setPasskeys(data || []);
            } catch (error) {
                if (isMounted) {
                    setPasskeyError(
                        error instanceof Error
                            ? error.message
                            : "Could not load passkeys."
                    );
                }
            } finally {
                if (isMounted) setIsLoadingPasskeys(false);
            }
        }

        if (typeof window !== "undefined" && "PublicKeyCredential" in window) {
            void loadPasskeys();
        } else {
            setIsLoadingPasskeys(false);
        }

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

    async function registerPasskey() {
        setPasskeyStatus(null);
        setPasskeyError(null);
        setIsRegisteringPasskey(true);

        try {
            const supabase = createClient() as PasskeyAuthClient;
            const { error } = await supabase.auth.registerPasskey();
            if (error) throw error;
            const { data, error: listError } = await supabase.auth.passkey.list();
            if (listError) throw listError;
            setPasskeys(data || []);
            setPasskeyStatus("Passkey added.");
        } catch (error) {
            setPasskeyError(
                error instanceof Error ? error.message : "Could not add passkey."
            );
        } finally {
            setIsRegisteringPasskey(false);
        }
    }

    async function deletePasskey(passkey: PasskeyListItem) {
        const confirmed = window.confirm(
            `Delete ${passkey.friendly_name || "this passkey"}?`
        );
        if (!confirmed) return;

        setPasskeyStatus(null);
        setPasskeyError(null);
        setDeletingPasskeyId(passkey.id);

        try {
            const supabase = createClient() as PasskeyAuthClient;
            const { error } = await supabase.auth.passkey.delete({
                passkeyId: passkey.id,
            });
            if (error) throw error;
            setPasskeys((current) =>
                current.filter((item) => item.id !== passkey.id)
            );
            setPasskeyStatus("Passkey deleted.");
        } catch (error) {
            setPasskeyError(
                error instanceof Error
                    ? error.message
                    : "Could not delete passkey."
            );
        } finally {
            setDeletingPasskeyId(null);
        }
    }

    return (
        <div className="space-y-5">
            <section
                className={`rounded-[1.5rem] border p-5 shadow-xl shadow-black/20 transition ${
                    isBiometricUnavailable
                        ? "border-white/5 bg-white/[0.035] opacity-70"
                        : "border-white/10 bg-white/[0.06]"
                }`}
            >
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-2xl">
                        <div className="flex items-center gap-3">
                            <span
                                className={`flex h-11 w-11 items-center justify-center rounded-2xl border bg-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.16)] ${
                                    isBiometricUnavailable
                                        ? "border-white/10 text-slate-500 shadow-none"
                                        : "border-lime-300/25 text-lime-200"
                                }`}
                            >
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
                        disabled={isBiometricUnavailable || isPending}
                        onClick={() =>
                            saveBiometricPreference(!isBiometricEnabled)
                        }
                        className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-black transition ${
                            isBiometricUnavailable
                                ? "border border-white/10 bg-slate-800/60 text-slate-500"
                                : isBiometricEnabled
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

                {isBiometricUnavailable ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/55 p-4 text-sm font-bold text-slate-400">
                        This device or browser does not currently support Face ID
                        for VAIVIA.
                    </div>
                ) : null}
            </section>

            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-2xl">
                        <div className="flex items-center gap-3">
                            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-lime-300/25 bg-slate-950 text-lime-200 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.16)]">
                                <KeyRound className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="text-xl font-black">Passkeys</h2>
                                <p className="mt-1 text-sm font-semibold text-slate-400">
                                    Sign in with Face ID, Touch ID, device PIN, or
                                    a security key.
                                </p>
                            </div>
                        </div>
                        <p className="mt-4 text-sm font-semibold leading-6 text-slate-300">
                            Passkeys are stored by your device or password
                            manager and verified by Supabase Auth. Registering a
                            passkey requires this account to be signed in and
                            confirmed.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={registerPasskey}
                        disabled={
                            isRegisteringPasskey ||
                            isLoadingPasskeys ||
                            isBiometricSupported === false
                        }
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950 shadow-[0_0_26px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        {isRegisteringPasskey ? "Opening..." : "Add passkey"}
                    </button>
                </div>

                {passkeyError ? (
                    <p className="mt-4 rounded-2xl border border-red-300/30 bg-red-300/10 px-4 py-3 text-sm font-bold text-red-100">
                        {passkeyError}
                    </p>
                ) : null}
                {passkeyStatus ? (
                    <p className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 text-sm font-bold text-emerald-100">
                        {passkeyStatus}
                    </p>
                ) : null}

                <div className="mt-5 space-y-3">
                    {isLoadingPasskeys ? (
                        <div className="h-16 rounded-2xl bg-white/[0.05]" />
                    ) : passkeys.length > 0 ? (
                        passkeys.map((passkey) => (
                            <div
                                key={passkey.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4"
                            >
                                <div>
                                    <p className="text-sm font-black text-white">
                                        {passkey.friendly_name || "Passkey"}
                                    </p>
                                    <p className="mt-1 text-xs font-semibold text-slate-400">
                                        Added {formatPasskeyDate(passkey.created_at)}
                                        {" · "}
                                        Last used{" "}
                                        {formatPasskeyDate(passkey.last_used_at)}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => deletePasskey(passkey)}
                                    disabled={deletingPasskeyId === passkey.id}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-red-300/30 bg-red-500/10 px-4 text-xs font-black text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    {deletingPasskeyId === passkey.id
                                        ? "Deleting..."
                                        : "Delete"}
                                </button>
                            </div>
                        ))
                    ) : (
                        <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4 text-sm font-bold text-slate-400">
                            No passkeys registered yet.
                        </div>
                    )}
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
