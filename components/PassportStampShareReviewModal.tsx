"use client";

import { useEffect, useMemo, useState } from "react";
import { Stamp, X } from "lucide-react";
import AnimatedModal from "@/components/AnimatedModal";
import PassportStampCard from "@/components/PassportStamp";
import Portal from "@/components/Portal";
import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/components/AppTopActionBar";

type PassportStampShareReviewModalProps = {
    notification: AppNotification | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onHandled?: () => void;
};

type SharedStamp = {
    id: string;
    country_code: string;
    country_name: string | null;
    flag_emoji: string | null;
    first_visited_on: string | null;
    first_entry_iata_code: string | null;
    first_entry_icao_code: string | null;
    first_entry_city: string | null;
    first_entry_airport_name: string | null;
    welcome_label_snapshot: string | null;
    arrival_label_snapshot: string | null;
    stamp_display_country_name: string | null;
    stamp_display_flag: string | null;
    visit_city: string | null;
    visit_region: string | null;
    visit_month: number | null;
    visit_status: string | null;
    port_of_entry_name: string | null;
};

type ShareDetails = {
    id: string;
    status: string;
    sender?: {
        id?: string | null;
        firstName?: string | null;
        lastName?: string | null;
        username?: string | null;
        email?: string | null;
        avatarUrl?: string | null;
        displayName?: string | null;
    } | null;
    source_stamp?: SharedStamp | null;
};

const MONTH_OPTIONS = [
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
];

function getShareId(notification: AppNotification | null) {
    const value = notification?.metadata?.shareId;
    return typeof value === "string" ? value : "";
}

function getYearFromDate(value?: string | null) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return String(date.getFullYear());
}

function getCurrentYearMonth() {
    const now = new Date();
    return {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
    };
}

function getAvailableMonths(year: string) {
    const numericYear = Number(year);
    const current = getCurrentYearMonth();
    if (!Number.isInteger(numericYear) || numericYear < 1900) return MONTH_OPTIONS;
    if (numericYear > current.year) return [];
    if (numericYear === current.year) {
        return MONTH_OPTIONS.filter((month) => Number(month.value) <= current.month);
    }
    return MONTH_OPTIONS;
}

function getDateError(year: string, month: string) {
    const numericYear = Number(year);
    const current = getCurrentYearMonth();
    if (!year.trim()) return "Confirm the year you completed this travel.";
    if (!Number.isInteger(numericYear) || numericYear < 1900) {
        return "Enter a valid completed travel year.";
    }
    if (numericYear > current.year) {
        return "Passport stamps can only be added for completed travel.";
    }
    const numericMonth = Number(month || 0);
    if (
        numericYear === current.year &&
        Number.isInteger(numericMonth) &&
        numericMonth > current.month
    ) {
        return "Passport stamps can only use this month or an earlier month.";
    }
    return "";
}

function getInitials(name: string) {
    const initials = name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    return initials || "V";
}

export default function PassportStampShareReviewModal({
    notification,
    open,
    onOpenChange,
    onHandled,
}: PassportStampShareReviewModalProps) {
    const [share, setShare] = useState<ShareDetails | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [year, setYear] = useState("");
    const [month, setMonth] = useState("");
    const [city, setCity] = useState("");
    const [region, setRegion] = useState("");
    const [portOfEntry, setPortOfEntry] = useState("");
    const [status, setStatus] = useState<"visited" | "lived">("visited");

    const stamp = share?.source_stamp || null;
    const monthOptions = useMemo(() => getAvailableMonths(year), [year]);

    useEffect(() => {
        if (month && !monthOptions.some((option) => option.value === month)) {
            setMonth("");
        }
    }, [month, monthOptions]);

    useEffect(() => {
        if (!open || !notification) return;
        const shareId = getShareId(notification);
        if (!shareId) return;

        async function loadShare() {
            const supabase = createClient();
            setIsLoading(true);
            setErrorMessage("");

            const { data, error } = await supabase.rpc(
                "get_passport_stamp_share_review" as any,
                { share_id: shareId }
            );

            if (error) {
                setErrorMessage("Could not load this passport stamp.");
            } else {
                const nextShare = data as ShareDetails | null;
                const nextStamp = nextShare?.source_stamp || null;
                setShare(nextShare);
                setYear(getYearFromDate(nextStamp?.first_visited_on));
                setMonth(nextStamp?.visit_month ? String(nextStamp.visit_month) : "");
                setCity(nextStamp?.visit_city || nextStamp?.first_entry_city || "");
                setRegion(nextStamp?.visit_region || "");
                setPortOfEntry(
                    nextStamp?.port_of_entry_name ||
                        nextStamp?.first_entry_airport_name ||
                        ""
                );
                setStatus(nextStamp?.visit_status === "lived" ? "lived" : "visited");
            }

            setIsLoading(false);
        }

        void loadShare();
    }, [notification, open]);

    if (!open || !notification) return null;

    async function respond(nextStatus: "accepted" | "declined") {
        const shareId = share?.id || getShareId(notification);
        const notificationId = notification?.id;
        if (!shareId) return;

        const dateError = nextStatus === "accepted" ? getDateError(year, month) : "";
        if (dateError) {
            setErrorMessage(dateError);
            return;
        }

        const supabase = createClient();
        setIsSubmitting(true);
        setErrorMessage("");

        const { error } = await supabase.rpc(
            "respond_to_passport_stamp_share" as any,
            {
                share_id: shareId,
                next_status: nextStatus,
                stamp_patch: {
                    firstVisitYear: year,
                    visitMonth: month,
                    visitCity: city,
                    visitRegion: region,
                    visitStatus: status,
                    portOfEntryName: portOfEntry,
                    airportCity: city,
                    airportName: portOfEntry,
                },
            }
        );

        if (error) {
            setErrorMessage(
                error.message || "Could not update this passport stamp request."
            );
        } else {
            if (notificationId) {
                await supabase.rpc("mark_app_alert_read", {
                    alert_id: notificationId,
                });
            }
            onHandled?.();
            onOpenChange(false);
        }

        setIsSubmitting(false);
    }

    const senderName =
        share?.sender?.displayName ||
        notification.metadata?.senderName?.toString() ||
        "A friend";
    const senderAvatarUrl =
        share?.sender?.avatarUrl ||
        (typeof notification.metadata?.senderAvatarUrl === "string"
            ? notification.metadata.senderAvatarUrl
            : "");

    return (
        <Portal>
            <AnimatedModal
                onClose={() => onOpenChange(false)}
                panelClassName="max-w-3xl"
                labelledBy="passport-stamp-share-title"
            >
                {({ requestClose }) => (
                    <>
                        <div className="vaivia-modal-header flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-lime-300/20 bg-lime-300/10 text-lime-200">
                                    <Stamp className="h-6 w-6" aria-hidden="true" />
                                </span>
                                <div>
                                    <p className="vaivia-modal-eyebrow">
                                        Passport stamp
                                    </p>
                                    <h2
                                        id="passport-stamp-share-title"
                                        className="vaivia-modal-title"
                                    >
                                        Confirm this stamp
                                    </h2>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={requestClose}
                                className="vaivia-modal-close"
                                aria-label="Close passport stamp request"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>

                        <div className="vaivia-modal-body space-y-5">
                            {isLoading ? (
                                <p className="text-sm font-semibold text-slate-300">
                                    Loading passport stamp...
                                </p>
                            ) : share?.status && share.status !== "pending" ? (
                                <p className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm font-semibold text-slate-300">
                                    This passport stamp request has already been handled.
                                </p>
                            ) : stamp ? (
                                <>
                                    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                                        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-lime-300/25 bg-slate-950 text-sm font-black uppercase text-lime-100 shadow-xl shadow-black/20">
                                            {senderAvatarUrl ? (
                                                <img
                                                    src={senderAvatarUrl}
                                                    alt=""
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                getInitials(senderName)
                                            )}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-black text-white">
                                                {senderName}
                                            </p>
                                            <p className="text-xs font-semibold text-slate-400">
                                                sent you this passport stamp to review
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-sm font-semibold leading-6 text-slate-300">
                                        Please confirm you joined this trip and this
                                        passport stamp will be added to your profile.
                                    </p>
                                    <div className="grid gap-5 md:grid-cols-[auto,1fr]">
                                        <div className="flex justify-center">
                                            <PassportStampCard
                                                countryName={
                                                    stamp.stamp_display_country_name ||
                                                    stamp.country_name ||
                                                    stamp.country_code
                                                }
                                                countryCode={stamp.country_code}
                                                flagEmoji={
                                                    stamp.stamp_display_flag ||
                                                    stamp.flag_emoji ||
                                                    ""
                                                }
                                                firstVisitYear={
                                                    Number(year) || undefined
                                                }
                                                welcomeLabel={
                                                    stamp.welcome_label_snapshot ||
                                                    stamp.arrival_label_snapshot ||
                                                    "WELCOME"
                                                }
                                                airportCode={
                                                    stamp.first_entry_iata_code ||
                                                    stamp.first_entry_icao_code ||
                                                    undefined
                                                }
                                                airportCity={city}
                                                portOfEntryLabel={portOfEntry}
                                                size="md"
                                            />
                                        </div>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <label className="block">
                                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                    Year visited
                                                </span>
                                                <input
                                                    value={year}
                                                    onChange={(event) => {
                                                        setErrorMessage("");
                                                        setYear(
                                                            event.target.value
                                                                .replace(/\D/g, "")
                                                                .slice(0, 4)
                                                        );
                                                    }}
                                                    inputMode="numeric"
                                                    className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                                />
                                            </label>
                                            <label className="block">
                                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                    Month visited
                                                </span>
                                                <select
                                                    value={month}
                                                    disabled={monthOptions.length === 0}
                                                    onChange={(event) => {
                                                        setErrorMessage("");
                                                        setMonth(event.target.value);
                                                    }}
                                                    className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition focus:border-lime-300/50"
                                                >
                                                    <option value="">No month</option>
                                                    {monthOptions.map((option) => (
                                                        <option
                                                            key={option.value}
                                                            value={option.value}
                                                        >
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label className="block">
                                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                    City
                                                </span>
                                                <input
                                                    value={city}
                                                    onChange={(event) =>
                                                        setCity(event.target.value)
                                                    }
                                                    className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                                />
                                            </label>
                                            <label className="block">
                                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                    Region
                                                </span>
                                                <input
                                                    value={region}
                                                    onChange={(event) =>
                                                        setRegion(event.target.value)
                                                    }
                                                    className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                                />
                                            </label>
                                            <label className="block sm:col-span-2">
                                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                    Port of entry
                                                </span>
                                                <input
                                                    value={portOfEntry}
                                                    onChange={(event) =>
                                                        setPortOfEntry(event.target.value)
                                                    }
                                                    className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                                />
                                            </label>
                                            <label className="block sm:col-span-2">
                                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                    Status
                                                </span>
                                                <select
                                                    value={status}
                                                    onChange={(event) =>
                                                        setStatus(
                                                            event.target.value ===
                                                                "lived"
                                                                ? "lived"
                                                                : "visited"
                                                        )
                                                    }
                                                    className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition focus:border-lime-300/50"
                                                >
                                                    <option value="visited">Visited</option>
                                                    <option value="lived">Lived</option>
                                                </select>
                                            </label>
                                        </div>
                                    </div>
                                    {errorMessage ? (
                                        <p className="rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                                            {errorMessage}
                                        </p>
                                    ) : null}
                                    <div className="vaivia-modal-actions border-t border-white/10 pt-4">
                                        <button
                                            type="button"
                                            onClick={() => respond("declined")}
                                            disabled={isSubmitting}
                                            className="vaivia-modal-button-secondary"
                                        >
                                            Decline
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => respond("accepted")}
                                            disabled={isSubmitting}
                                            className="vaivia-modal-button-primary"
                                        >
                                            {isSubmitting ? "Saving..." : "Accept stamp"}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <p className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm font-semibold text-slate-300">
                                    This passport stamp could not be found.
                                </p>
                            )}
                        </div>
                    </>
                )}
            </AnimatedModal>
        </Portal>
    );
}
