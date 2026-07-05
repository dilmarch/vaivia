"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, LogOut, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Portal from "@/components/Portal";
import { createClient } from "@/lib/supabase/client";

export type UserProfile = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    email: string | null;
    avatar_url: string | null;
    join_date: string | null;
    created_at: string | null;
    updated_at: string | null;
};

export type UserPreferences = {
    user_id: string;
    clock_format: "12h" | "24h";
    default_time_zone: string | null;
    itinerary_default_view: "list" | "day" | "week";
    created_at: string | null;
    updated_at: string | null;
};

type AccountMenuProps = {
    userId: string;
    email?: string | null;
    joinedAt?: string | null;
    profile?: Partial<UserProfile> | null;
    preferences?: Partial<UserPreferences> | null;
};

function getBrowserTimezone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
        return "UTC";
    }
}

function formatJoinDate(value?: string | null) {
    if (!value) return "Not available";

    return new Date(value).toLocaleDateString("en-CA", {
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

function getInitialValue(value?: string | null) {
    return value || "";
}

function getAvatarExtension(file: File) {
    const mimeExtension = file.type.split("/")[1];
    const nameExtension = file.name.split(".").pop();
    return (mimeExtension || nameExtension || "jpg").replace("jpeg", "jpg");
}

export default function AccountMenu({
    userId,
    email,
    joinedAt,
    profile,
    preferences,
}: AccountMenuProps) {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState(() =>
        getInitialValue(profile?.avatar_url)
    );
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [firstName, setFirstName] = useState(() =>
        getInitialValue(profile?.first_name)
    );
    const [lastName, setLastName] = useState(() =>
        getInitialValue(profile?.last_name)
    );
    const [username, setUsername] = useState(() =>
        getInitialValue(profile?.username)
    );
    const [emailAddress, setEmailAddress] = useState(() =>
        getInitialValue(profile?.email || email)
    );
    const [clockFormat, setClockFormat] = useState<"12h" | "24h">(
        preferences?.clock_format === "24h" ? "24h" : "12h"
    );
    const [defaultTimezone, setDefaultTimezone] = useState(
        () => preferences?.default_time_zone || getBrowserTimezone()
    );
    const [defaultItineraryView, setDefaultItineraryView] = useState<
        "list" | "day" | "week"
    >(preferences?.itinerary_default_view || "list");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const displayName = useMemo(() => {
        const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
        return fullName || username || emailAddress || "My account";
    }, [emailAddress, firstName, lastName, username]);

    async function uploadAvatarIfNeeded() {
        if (!avatarFile) return avatarUrl.trim() || null;

        const supabase = createClient();
        const extension = getAvatarExtension(avatarFile);
        const path = `${userId}/avatar.${extension}`;
        const { error: uploadError } = await supabase.storage
            .from("avatars")
            .upload(path, avatarFile, {
                cacheControl: "3600",
                contentType: avatarFile.type || undefined,
                upsert: true,
            });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        return data.publicUrl || null;
    }

    async function handleSave(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setErrorMessage(null);
        setStatusMessage(null);

        if (newPassword || confirmPassword) {
            if (newPassword.length < 6) {
                setErrorMessage("Password must be at least 6 characters.");
                return;
            }

            if (newPassword !== confirmPassword) {
                setErrorMessage("Password confirmation does not match.");
                return;
            }
        }

        const supabase = createClient();
        setIsSaving(true);

        try {
            const nextAvatarUrl = await uploadAvatarIfNeeded();
            const nextEmail = emailAddress.trim() || null;
            const authUpdates: {
                email?: string;
                password?: string;
            } = {};

            if (nextEmail && nextEmail !== email) {
                authUpdates.email = nextEmail;
            }

            if (newPassword) {
                authUpdates.password = newPassword;
            }

            if (authUpdates.email || authUpdates.password) {
                const { error } = await supabase.auth.updateUser(authUpdates);
                if (error) throw error;
            }

            const profilePayload = {
                id: userId,
                first_name: firstName.trim() || null,
                last_name: lastName.trim() || null,
                username: username.trim() || null,
                email: nextEmail,
                avatar_url: nextAvatarUrl,
                join_date: profile?.join_date || joinedAt || new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            const { error: profileError } = await supabase
                .from("user_profiles")
                .upsert(profilePayload, { onConflict: "id" });

            if (profileError) throw profileError;

            const preferencesPayload = {
                user_id: userId,
                clock_format: clockFormat,
                default_time_zone: defaultTimezone.trim() || getBrowserTimezone(),
                itinerary_default_view: defaultItineraryView,
                updated_at: new Date().toISOString(),
            };

            const { error: preferencesError } = await supabase
                .from("user_preferences")
                .upsert(preferencesPayload, { onConflict: "user_id" });

            if (preferencesError) throw preferencesError;

            setAvatarFile(null);
            setAvatarUrl(nextAvatarUrl || "");
            setNewPassword("");
            setConfirmPassword("");
            setStatusMessage(
                authUpdates.email
                    ? "Saved. Check your email to confirm the address change."
                    : "Account preferences saved."
            );
            router.refresh();
        } catch (error) {
            setErrorMessage(
                error instanceof Error ? error.message : "Could not save account."
            );
        } finally {
            setIsSaving(false);
        }
    }

    async function handleSignOut() {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/auth/login");
        router.refresh();
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
            >
                {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={avatarUrl}
                        alt=""
                        className="h-7 w-7 rounded-full border border-slate-200 object-cover"
                    />
                ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-100">
                        <UserRound className="h-4 w-4" aria-hidden="true" />
                    </span>
                )}
                My account
            </button>

            {isOpen ? (
                <Portal>
                <div
                    className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-8"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setIsOpen(false);
                    }}
                >
                    <div
                        className="w-full max-w-3xl overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="accountPreferencesTitle"
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    VAIVIA
                                </p>
                                <h2
                                    id="accountPreferencesTitle"
                                    className="mt-1 text-2xl font-semibold text-slate-950"
                                >
                                    My account
                                </h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    {displayName}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="rounded-md border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
                                aria-label="Close account preferences"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="space-y-6 p-5">
                            <section className="grid gap-4 md:grid-cols-[180px_1fr]">
                                <div>
                                    <h3 className="font-semibold text-slate-950">
                                        Profile
                                    </h3>
                                    <p className="mt-1 text-sm text-slate-500">
                                        Your public-facing account details.
                                    </p>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <Label htmlFor="avatarFile">
                                            Profile picture
                                        </Label>
                                        <div className="mt-2 flex items-center gap-3">
                                            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-slate-500">
                                                {avatarUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={avatarUrl}
                                                        alt=""
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : (
                                                    <Camera
                                                        className="h-5 w-5"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                            </span>
                                            <Input
                                                id="avatarFile"
                                                type="file"
                                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                                onChange={(event) => {
                                                    const file =
                                                        event.target.files?.[0] || null;
                                                    setAvatarFile(file);
                                                    if (file) {
                                                        setAvatarUrl(
                                                            URL.createObjectURL(file)
                                                        );
                                                    }
                                                }}
                                            />
                                        </div>
                                        <Label
                                            htmlFor="avatarUrl"
                                            className="mt-4 block text-xs text-slate-500"
                                        >
                                            Or paste image URL
                                        </Label>
                                        <Input
                                            id="avatarUrl"
                                            className="mt-2"
                                            value={avatarFile ? "" : avatarUrl}
                                            onChange={(event) => {
                                                setAvatarFile(null);
                                                setAvatarUrl(event.target.value);
                                            }}
                                            placeholder="https://..."
                                            autoComplete="off"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="firstName">First name</Label>
                                        <Input
                                            id="firstName"
                                            className="mt-2"
                                            value={firstName}
                                            onChange={(event) =>
                                                setFirstName(event.target.value)
                                            }
                                            autoComplete="given-name"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="lastName">Last name</Label>
                                        <Input
                                            id="lastName"
                                            className="mt-2"
                                            value={lastName}
                                            onChange={(event) =>
                                                setLastName(event.target.value)
                                            }
                                            autoComplete="family-name"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="username">Username</Label>
                                        <Input
                                            id="username"
                                            className="mt-2"
                                            value={username}
                                            onChange={(event) =>
                                                setUsername(event.target.value)
                                            }
                                            autoComplete="username"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="emailAddress">Email</Label>
                                        <Input
                                            id="emailAddress"
                                            className="mt-2"
                                            type="email"
                                            value={emailAddress}
                                            onChange={(event) =>
                                                setEmailAddress(event.target.value)
                                            }
                                            autoComplete="email"
                                        />
                                    </div>
                                    <div className="sm:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                                        Joined{" "}
                                        {formatJoinDate(
                                            profile?.join_date ||
                                                profile?.created_at ||
                                                joinedAt
                                        )}
                                    </div>
                                </div>
                            </section>

                            <section className="grid gap-4 border-t border-slate-200 pt-6 md:grid-cols-[180px_1fr]">
                                <div>
                                    <h3 className="font-semibold text-slate-950">
                                        Preferences
                                    </h3>
                                    <p className="mt-1 text-sm text-slate-500">
                                        Set defaults for itinerary views and time.
                                    </p>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <Label htmlFor="clockFormat">
                                            Clock format
                                        </Label>
                                        <select
                                            id="clockFormat"
                                            value={clockFormat}
                                            onChange={(event) =>
                                                setClockFormat(
                                                    event.target.value as "12h" | "24h"
                                                )
                                            }
                                            className="mt-2 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                                        >
                                            <option value="12h">12-hour clock</option>
                                            <option value="24h">24-hour clock</option>
                                        </select>
                                    </div>
                                    <div>
                                        <Label htmlFor="defaultItineraryView">
                                            Default itinerary view
                                        </Label>
                                        <select
                                            id="defaultItineraryView"
                                            value={defaultItineraryView}
                                            onChange={(event) =>
                                                setDefaultItineraryView(
                                                    event.target.value as
                                                        | "list"
                                                        | "day"
                                                        | "week"
                                                )
                                            }
                                            className="mt-2 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                                        >
                                            <option value="list">List</option>
                                            <option value="day">Day</option>
                                            <option value="week">Week</option>
                                        </select>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <Label htmlFor="defaultTimezone">
                                            Default time zone
                                        </Label>
                                        <Input
                                            id="defaultTimezone"
                                            className="mt-2"
                                            value={defaultTimezone}
                                            onChange={(event) =>
                                                setDefaultTimezone(event.target.value)
                                            }
                                            placeholder={getBrowserTimezone()}
                                            autoComplete="off"
                                        />
                                    </div>
                                </div>
                            </section>

                            <section className="grid gap-4 border-t border-slate-200 pt-6 md:grid-cols-[180px_1fr]">
                                <div>
                                    <h3 className="font-semibold text-slate-950">
                                        Password
                                    </h3>
                                    <p className="mt-1 text-sm text-slate-500">
                                        Leave blank to keep your current password.
                                    </p>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <Label htmlFor="newPassword">
                                            New password
                                        </Label>
                                        <Input
                                            id="newPassword"
                                            className="mt-2"
                                            type="password"
                                            value={newPassword}
                                            onChange={(event) =>
                                                setNewPassword(event.target.value)
                                            }
                                            autoComplete="new-password"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="confirmPassword">
                                            Confirm password
                                        </Label>
                                        <Input
                                            id="confirmPassword"
                                            className="mt-2"
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(event) =>
                                                setConfirmPassword(event.target.value)
                                            }
                                            autoComplete="new-password"
                                        />
                                    </div>
                                </div>
                            </section>

                            {errorMessage ? (
                                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                    {errorMessage}
                                </p>
                            ) : null}
                            {statusMessage ? (
                                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                                    {statusMessage}
                                </p>
                            ) : null}

                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleSignOut}
                                    className="text-slate-700"
                                >
                                    <LogOut className="h-4 w-4" aria-hidden="true" />
                                    Sign out
                                </Button>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setIsOpen(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={isSaving}>
                                        {isSaving ? "Saving..." : "Save"}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
                </Portal>
            ) : null}
        </>
    );
}
