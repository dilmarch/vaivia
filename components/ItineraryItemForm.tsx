"use client";

import { AlertTriangle, Lock, Plus, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TripAudienceSelector from "@/components/TripAudienceSelector";
import {
    FALLBACK_CATEGORY_LABEL,
    type UserCategory,
} from "@/lib/itineraryCategories";
import type { TripAudienceMode, TripAudienceOption } from "@/lib/tripAudience";

type InitialItem = {
    title?: string;
    item_date?: string;
    end_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    category?: string;
    category_id?: string | null;
    category_name?: string | null;
    category_color_hex?: string | null;
    category_owner_id?: string | null;
    status?: string;
    location?: string | null;
    timezone?: string | null;
    timezone_source?: string | null;
    url?: string | null;
    ticket_website?: string | null;
    location_website?: string | null;
    cover_image_url?: string | null;
    notes?: string | null;
    google_place_id?: string | null;
    location_lat?: number | null;
    location_lng?: number | null;
    formatted_address?: string | null;
    is_private?: boolean | null;
    audience_mode?: TripAudienceMode | null;
    audience_selected_options?: TripAudienceOption[];
};

type ItineraryItemFormProps = {
    tripId: string;
    itemId?: string;
    submitAction: (formData: FormData) => Promise<void>;
    initialItem?: InitialItem;
    submitLabel?: string;
    showLauncher?: boolean;
    openSignal?: number;
    defaultDate?: string;
    duplicateMode?: boolean;
    onClose?: () => void;
    categories?: UserCategory[];
    audienceOptions?: TripAudienceOption[];
    currentUserTripMemberId?: string | null;
};

type TimezoneOption = {
    value: string;
    label: string;
    offsetLabel: string;
    offsetMinutes: number;
};

type TimezoneOptionGroup = {
    offsetLabel: string;
    options: TimezoneOption[];
};

const DEFAULT_TIMEZONE = "America/St_Johns";

const FALLBACK_TIMEZONES = [
    DEFAULT_TIMEZONE,
    "America/Halifax",
    "America/Toronto",
    "America/New_York",
    "America/Winnipeg",
    "America/Edmonton",
    "America/Vancouver",
    "Europe/London",
    "Europe/Dublin",
    "Europe/Lisbon",
    "Europe/Berlin",
    "Europe/Amsterdam",
    "Europe/Paris",
    "Europe/Rome",
    "Europe/Madrid",
    "Atlantic/Canary",
    "Asia/Seoul",
    "Asia/Tokyo",
    "Asia/Taipei",
    "Asia/Ho_Chi_Minh",
    "Asia/Bangkok",
    "Asia/Singapore",
];

const LABEL_CLASS =
    "block text-sm font-bold uppercase tracking-wide text-slate-300";
const FIELD_CLASS =
    "mt-2 w-full rounded-xl border border-white/10 bg-white/[0.08] px-4 py-2 text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50 focus:bg-white/[0.12] focus:ring-2 focus:ring-lime-300/20 [color-scheme:dark]";
const HELP_TEXT_CLASS = "mt-1 text-xs text-slate-400";
const FORM_BODY_CLASS = "bg-[#080511] p-6 text-white space-y-4";
const SUBTLE_BUTTON_CLASS =
    "rounded-xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-bold text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14] hover:text-white";
const PRIMARY_BUTTON_CLASS =
    "rounded-xl bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-slate-200 disabled:shadow-none";

function addOneDay(dateString: string) {
    if (!dateString) return "";

    const date = new Date(`${dateString}T00:00:00`);
    date.setDate(date.getDate() + 1);

    return date.toISOString().split("T")[0];
}

function cleanTime(timeString?: string | null) {
    if (!timeString) return "";
    return timeString.slice(0, 5);
}

function getTimezoneDisplayName(timezone: string) {
    return timezone.split("/").at(-1)?.replace(/_/g, " ") || timezone;
}

function getTimezoneDate(dateString: string) {
    if (!dateString) return new Date();
    return new Date(`${dateString}T12:00:00Z`);
}

function formatOffsetLabel(offsetMinutes: number) {
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absoluteMinutes = Math.abs(offsetMinutes);
    const hours = Math.floor(absoluteMinutes / 60).toString().padStart(2, "0");
    const minutes = (absoluteMinutes % 60).toString().padStart(2, "0");

    return `GMT${sign}${hours}:${minutes}`;
}

function getTimezoneOffsetMinutes(timezone: string, date: Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).formatToParts(date);

    const values = Object.fromEntries(
        parts
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value])
    );

    const localizedDateAsUtc = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
        Number(values.hour),
        Number(values.minute),
        Number(values.second)
    );

    return Math.round((localizedDateAsUtc - date.getTime()) / 60000);
}

function getSupportedTimezones(currentTimezone: string) {
    const supportedTimezones =
        typeof Intl.supportedValuesOf === "function"
            ? Intl.supportedValuesOf("timeZone")
            : FALLBACK_TIMEZONES;

    return Array.from(
        new Set([...supportedTimezones, DEFAULT_TIMEZONE, currentTimezone])
    ).filter(Boolean);
}

function buildTimezoneOptionGroups(dateString: string, currentTimezone: string) {
    const offsetDate = getTimezoneDate(dateString);

    const options = getSupportedTimezones(currentTimezone)
        .map((timezone) => {
            const offsetMinutes = getTimezoneOffsetMinutes(timezone, offsetDate);
            const offsetLabel = formatOffsetLabel(offsetMinutes);

            return {
                value: timezone,
                label: `${offsetLabel} - ${getTimezoneDisplayName(
                    timezone
                )} - ${timezone}`,
                offsetLabel,
                offsetMinutes,
            };
        })
        .sort(
            (a, b) =>
                a.offsetMinutes - b.offsetMinutes ||
                a.value.localeCompare(b.value)
        );

    return options.reduce<TimezoneOptionGroup[]>((groups, option) => {
        const group = groups.at(-1);

        if (group?.offsetLabel === option.offsetLabel) {
            group.options.push(option);
            return groups;
        }

        groups.push({
            offsetLabel: option.offsetLabel,
            options: [option],
        });

        return groups;
    }, []);
}

export default function ItineraryItemForm({
    tripId,
    itemId,
    submitAction,
    initialItem,
    submitLabel = "Add itinerary item",
    showLauncher = true,
    openSignal = 0,
    defaultDate = "",
    duplicateMode = false,
    onClose,
    categories = [],
    audienceOptions = [],
    currentUserTripMemberId = null,
}: ItineraryItemFormProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const isEditMode = Boolean(initialItem) && !duplicateMode;
    const isClosableEditModal = isEditMode && Boolean(onClose);
    const formRef = useRef<HTMLFormElement | null>(null);
    const returnTo = useMemo(() => {
        const query = searchParams.toString();
        return `${pathname || ""}${query ? `?${query}` : ""}`;
    }, [pathname, searchParams]);
    const [startDate, setStartDate] = useState(
        initialItem?.item_date || defaultDate
    );
    const [startTime, setStartTime] = useState(cleanTime(initialItem?.start_time));
    const [endTime, setEndTime] = useState(cleanTime(initialItem?.end_time));
    const [endsNextDay, setEndsNextDay] = useState(Boolean(initialItem?.end_date));
    const [endDate, setEndDate] = useState(initialItem?.end_date || "");

    const [timezone, setTimezone] = useState(
        initialItem?.timezone || DEFAULT_TIMEZONE
    );
    const [timezoneSource, setTimezoneSource] = useState(
        initialItem?.timezone_source || "manual"
    );
    const [timezoneOptionGroups, setTimezoneOptionGroups] = useState<
        TimezoneOptionGroup[]
    >([]);
    const [isDetectingTimezone, setIsDetectingTimezone] = useState(false);
    const [timezoneError, setTimezoneError] = useState("");

    const [locationName, setLocationName] = useState(initialItem?.location || "");
    const [formattedAddress, setFormattedAddress] = useState(
        initialItem?.formatted_address || ""
    );
    const [googlePlaceId, setGooglePlaceId] = useState(
        initialItem?.google_place_id || ""
    );
    const [locationLat, setLocationLat] = useState(
        initialItem?.location_lat?.toString() || ""
    );
    const [locationLng, setLocationLng] = useState(
        initialItem?.location_lng?.toString() || ""
    );
    const [ticketWebsite, setTicketWebsite] = useState(
        initialItem?.ticket_website || initialItem?.url || ""
    );
    const [locationWebsite, setLocationWebsite] = useState(
        initialItem?.location_website || ""
    );
    const [coverImageUrl, setCoverImageUrl] = useState(
        initialItem?.cover_image_url || ""
    );
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(isEditMode || duplicateMode);
    const [isModalClosing, setIsModalClosing] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showCloseWarning, setShowCloseWarning] = useState(false);
    const initialCategoryId = initialItem?.category_id || "";
    const initialCategoryName =
        initialItem?.category_name || initialItem?.category || FALLBACK_CATEGORY_LABEL;
    const initialCategoryIsSelectable =
        !initialCategoryId ||
        categories.some((category) => category.id === initialCategoryId);
    const [selectedCategoryId, setSelectedCategoryId] = useState(
        initialCategoryIsSelectable
            ? initialCategoryId || categories[0]?.id || ""
            : "__shared__"
    );
    const selectedCategoryName =
        categories.find((category) => category.id === selectedCategoryId)?.name ||
        initialCategoryName ||
        FALLBACK_CATEGORY_LABEL;

    const locationInputRef = useRef<HTMLInputElement | null>(null);
    const previousOpenSignalRef = useRef(openSignal);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );

    const endTimeIsBeforeStartTime =
        startTime && endTime && endTime < startTime && !endsNextDay;

    function resetFormState() {
        formRef.current?.reset();
        setStartDate(initialItem?.item_date || defaultDate);
        setStartTime(cleanTime(initialItem?.start_time));
        setEndTime(cleanTime(initialItem?.end_time));
        setEndsNextDay(Boolean(initialItem?.end_date));
        setEndDate(initialItem?.end_date || "");
        setTimezone(initialItem?.timezone || DEFAULT_TIMEZONE);
        setTimezoneSource(initialItem?.timezone_source || "manual");
        setTimezoneError("");
        setLocationName(initialItem?.location || "");
        setFormattedAddress(initialItem?.formatted_address || "");
        setGooglePlaceId(initialItem?.google_place_id || "");
        setLocationLat(initialItem?.location_lat?.toString() || "");
        setLocationLng(initialItem?.location_lng?.toString() || "");
        setTicketWebsite(initialItem?.ticket_website || initialItem?.url || "");
        setLocationWebsite(initialItem?.location_website || "");
        setCoverImageUrl(initialItem?.cover_image_url || "");
        setHasUnsavedChanges(false);
    }

    const closeModalWithAnimation = useCallback(() => {
        if (isModalClosing) return;
        setIsModalClosing(true);
        closeTimerRef.current = setTimeout(() => {
            closeTimerRef.current = null;
            setIsModalOpen(false);
            setIsModalClosing(false);
            onClose?.();
        }, 160);
    }, [isModalClosing, onClose]);

    const requestCloseModal = useCallback(() => {
        if (hasUnsavedChanges) {
            setShowCloseWarning(true);
            return;
        }

        closeModalWithAnimation();
    }, [closeModalWithAnimation, hasUnsavedChanges]);

    function discardChangesAndClose() {
        resetFormState();
        setShowCloseWarning(false);
        closeModalWithAnimation();
    }

    function clearValidatedLocation() {
        if (locationInputRef.current) {
            locationInputRef.current.value = "";
        }

        setLocationName("");
        setFormattedAddress("");
        setGooglePlaceId("");
        setLocationLat("");
        setLocationLng("");
        setLocationWebsite("");
        setCoverImageUrl("");
        setHasUnsavedChanges(true);
    }

    const detectTimezoneFromLocation = useCallback(
        async (lat: string, lng: string) => {
            if (!lat || !lng) return;

            setIsDetectingTimezone(true);
            setTimezoneError("");

            try {
                console.log("Detecting timezone for:", { lat, lng });

                const response = await fetch("/api/timezone", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        lat: Number(lat),
                        lng: Number(lng),
                        date: startDate || undefined,
                    }),
                });

                const text = await response.text();
                console.log("Timezone raw response:", response.status, text);

                let data: {
                    timeZoneId?: string;
                    timeZoneName?: string;
                    error?: string;
                    message?: string;
                    status?: string;
                } = {};

                try {
                    data = text ? JSON.parse(text) : {};
                } catch {
                    throw new Error(`Timezone API returned non-JSON: ${text}`);
                }

                if (!response.ok) {
                    throw new Error(
                        data.message || data.error || "Could not detect timezone."
                    );
                }

                if (!data.timeZoneId) {
                    throw new Error("Timezone API response did not include timeZoneId.");
                }

                setTimezone(data.timeZoneId);
                setTimezoneSource("auto");
                setTimezoneError("");

                console.log("Timezone set to:", data.timeZoneId);
            } catch (error) {
                console.error("Timezone detection error:", error);
                setTimezoneError(
                    "VAIVIA could not auto-detect the time zone. Please choose it manually."
                );
                setTimezoneSource("manual");
            } finally {
                setIsDetectingTimezone(false);
            }
        },
        [startDate]
    );

    useEffect(() => {
        if (!isModalOpen) return;
        if (!isGoogleReady) return;
        if (!locationInputRef.current) return;
        if (!window.google?.maps?.places?.Autocomplete) return;

        const autocomplete = new window.google.maps.places.Autocomplete(
            locationInputRef.current,
            {
                fields: [
                    "place_id",
                    "name",
                    "formatted_address",
                    "geometry",
                    "website",
                    "photos",
                ],
            }
        );

        const listener = autocomplete.addListener("place_changed", async () => {
            const place = autocomplete.getPlace();

            const name = place.name || "";
            const address = place.formatted_address || "";
            const lat = place.geometry?.location?.lat();
            const lng = place.geometry?.location?.lng();
            const website = place.website || "";
            const coverPhotoUrl =
                place.photos?.[0]?.getUrl({
                    maxWidth: 1200,
                    maxHeight: 675,
                }) || "";

            const latString = typeof lat === "number" ? lat.toString() : "";
            const lngString = typeof lng === "number" ? lng.toString() : "";

            setLocationName(name || address);
            setFormattedAddress(address);
            setGooglePlaceId(place.place_id || "");
            setLocationLat(latString);
            setLocationLng(lngString);
            setHasUnsavedChanges(true);

            setLocationWebsite(website);

            if (coverPhotoUrl) {
                setCoverImageUrl(coverPhotoUrl);
            }

            if (latString && lngString) {
                await detectTimezoneFromLocation(latString, lngString);
            }
        });

        return () => {
            listener.remove();
        };
    }, [detectTimezoneFromLocation, isGoogleReady, isModalOpen]);

    useEffect(() => {
        if (endsNextDay && startDate && !endDate) {
            setEndDate(addOneDay(startDate));
        }

        if (endsNextDay && startDate && !initialItem?.end_date) {
            setEndDate(addOneDay(startDate));
        }

        if (!endsNextDay) {
            setEndDate("");
        }
    }, [endsNextDay, startDate, endDate, initialItem?.end_date]);

    useEffect(() => {
        setTimezoneOptionGroups(buildTimezoneOptionGroups(startDate, timezone));
    }, [startDate, timezone]);

    useEffect(() => {
        if (isEditMode || openSignal === 0) return;
        if (previousOpenSignalRef.current === openSignal) return;
        previousOpenSignalRef.current = openSignal;
        setStartDate(defaultDate);
        setEndDate("");
        setIsModalClosing(false);
        setIsModalOpen(true);
    }, [defaultDate, isEditMode, openSignal]);

    useEffect(() => {
        return () => {
            if (closeTimerRef.current) {
                clearTimeout(closeTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!isModalOpen || (isEditMode && !isClosableEditModal)) return;

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") requestCloseModal();
        }

        document.addEventListener("keydown", closeOnEscape);
        return () => document.removeEventListener("keydown", closeOnEscape);
    }, [isClosableEditModal, isEditMode, isModalOpen, requestCloseModal]);

    return (
        <>
            <Script
                src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
                strategy="afterInteractive"
                onLoad={() => setIsGoogleReady(true)}
                onReady={() => setIsGoogleReady(true)}
            />

            {!isEditMode && showLauncher && (
                <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-lime-300 text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-200 focus:ring-offset-2 focus:ring-offset-slate-950"
                    aria-label="Add itinerary item"
                >
                    <Plus className="h-6 w-6" aria-hidden="true" />
                </button>
            )}

            {isModalOpen && (
                <div
                    className={
                        isEditMode && !isClosableEditModal
                            ? ""
                            : "vaivia-modal-backdrop"
                    }
                    data-vaivia-modal-state={isModalClosing ? "closing" : "open"}
                    onClick={
                        isEditMode && !isClosableEditModal
                            ? undefined
                            : requestCloseModal
                    }
                >
                    <aside
                        className={
                            isEditMode
                                ? "vaivia-modal-panel max-w-2xl"
                                : "vaivia-modal-panel max-w-2xl"
                        }
                        data-vaivia-modal-state={isModalClosing ? "closing" : "open"}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div
                            className={
                                isEditMode && !isClosableEditModal
                                    ? "vaivia-modal-header"
                                    : "vaivia-modal-header flex items-center justify-between gap-4"
                            }
                        >
                            <div>
                                {!isEditMode && (
                                    <p className="vaivia-modal-eyebrow">
                                        Quick add
                                    </p>
                                )}
                                <h2 className="vaivia-modal-title">
                                    {isEditMode ? "Edit itinerary item" : submitLabel}
                                </h2>
                            </div>

                            {(!isEditMode || isClosableEditModal) && (
                                <button
                                    type="button"
                                    onClick={requestCloseModal}
                                    className="vaivia-modal-close"
                                    aria-label={
                                        isEditMode
                                            ? "Close edit itinerary item"
                                            : "Close add itinerary item"
                                    }
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                        </div>

                        <form
                            ref={formRef}
                            action={submitAction}
                            onChange={() => setHasUnsavedChanges(true)}
                            className={FORM_BODY_CLASS}
                        >
                    <input type="hidden" name="trip_id" value={tripId} />
                    {itemId ? (
                        <input type="hidden" name="item_id" value={itemId} />
                    ) : null}
                    <input type="hidden" name="return_to" value={returnTo} />
                    <input type="hidden" name="timezone_source" value={timezoneSource} />

                    <div>
                        <label
                            htmlFor="itineraryItemTitle"
                            className={LABEL_CLASS}
                        >
                            Title
                        </label>
                        <input
                            id="itineraryItemTitle"
                            name="title"
                            type="text"
                            required
                            autoComplete="off"
                            data-form-type="other"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            defaultValue={initialItem?.title || ""}
                            placeholder="Flight to Berlin"
                            className={FIELD_CLASS}
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="itineraryItemDate"
                            className={LABEL_CLASS}
                        >
                            {endsNextDay ? "Start date" : "Date"}
                        </label>
                        <input
                            id="itineraryItemDate"
                            name="item_date"
                            type="date"
                            required
                            autoComplete="off"
                            data-form-type="other"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            value={startDate}
                            onChange={(event) => setStartDate(event.target.value)}
                            className={FIELD_CLASS}
                        />
                    </div>

                    {endsNextDay && (
                        <div>
                            <label
                                htmlFor="itineraryItemEndDate"
                                className={LABEL_CLASS}
                            >
                                End date
                            </label>
                            <input
                                id="itineraryItemEndDate"
                                name="end_date"
                                type="date"
                                required
                                autoComplete="off"
                                data-form-type="other"
                                data-lpignore="true"
                                data-1p-ignore="true"
                                value={endDate}
                                onChange={(event) => setEndDate(event.target.value)}
                                className={FIELD_CLASS}
                            />
                        </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                        <div>
                            <label
                                htmlFor="start_time"
                                className={LABEL_CLASS}
                            >
                                Start time, optional
                            </label>
                            <input
                                id="start_time"
                                name="start_time"
                                type="time"
                                value={startTime}
                                onChange={(event) => setStartTime(event.target.value)}
                                className={FIELD_CLASS}
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="end_time"
                                className={LABEL_CLASS}
                            >
                                End time, optional
                            </label>
                            <input
                                id="end_time"
                                name="end_time"
                                type="time"
                                value={endTime}
                                onChange={(event) => setEndTime(event.target.value)}
                                className={FIELD_CLASS}
                            />
                        </div>
                    </div>

                    {endTimeIsBeforeStartTime && (
                        <div className="rounded-xl border border-amber-300/50 bg-amber-300/15 p-4 text-sm text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.12)]">
                            <p className="font-medium">
                                End time can&apos;t be before the start time.
                            </p>
                            <label className="mt-3 flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={endsNextDay}
                                    onChange={(event) => setEndsNextDay(event.target.checked)}
                                />
                                <span>Is this the next day?</span>
                            </label>
                        </div>
                    )}

                    {!endTimeIsBeforeStartTime &&
                        startTime &&
                        endTime &&
                        endTime < startTime && (
                            <div className="rounded-xl border border-emerald-300/40 bg-emerald-300/15 p-4 text-sm text-emerald-100">
                                This event will end on {endDate || "the next day"}.
                            </div>
                        )}

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                        <div>
                            <label
                                htmlFor="category"
                                className={LABEL_CLASS}
                            >
                                Category
                            </label>
                            <input
                                type="hidden"
                                name="category"
                                value={selectedCategoryName}
                            />
                            <select
                                id="category"
                                name="category_id"
                                value={selectedCategoryId}
                                onChange={(event) =>
                                    setSelectedCategoryId(event.target.value)
                                }
                                className={FIELD_CLASS}
                            >
                                {!initialCategoryIsSelectable && initialCategoryId ? (
                                    <option value="__shared__">
                                        {initialCategoryName} (Shared category)
                                    </option>
                                ) : null}
                                {categories.length === 0 ? (
                                    <option value="">{FALLBACK_CATEGORY_LABEL}</option>
                                ) : (
                                    categories.map((category) => (
                                        <option key={category.id} value={category.id}>
                                            {category.name}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>

                        <div>
                            <label
                                htmlFor="status"
                                className={LABEL_CLASS}
                            >
                                Status
                            </label>
                            <select
                                id="status"
                                name="status"
                                defaultValue={initialItem?.status || "tentative"}
                                className={FIELD_CLASS}
                            >
                                <option value="tentative">Tentative</option>
                                <option value="confirmed">Confirmed</option>
                            </select>
                        </div>
                    </div>

                    <TripAudienceSelector
                        options={audienceOptions}
                        currentUserTripMemberId={currentUserTripMemberId}
                        initialAudienceMode={initialItem?.audience_mode || "everyone"}
                        initialSelectedOptions={
                            initialItem?.audience_selected_options || []
                        }
                        privateSectionId="itinerary-private-section"
                    />

                    <label
                        id="itinerary-private-section"
                        className="flex scroll-mt-24 items-start gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-4 text-sm text-slate-300 shadow-inner shadow-black/10"
                    >
                        <input
                            type="checkbox"
                            name="is_private"
                            defaultChecked={Boolean(initialItem?.is_private)}
                            className="mt-1 h-4 w-4 rounded border-white/20 bg-white/10 text-lime-300 focus:ring-lime-300/40"
                        />
                        <span>
                            <span className="flex items-center gap-2 font-semibold text-white">
                                <Lock className="h-4 w-4" aria-hidden="true" />
                                Private
                            </span>
                            <span className="mt-1 block text-xs text-slate-400">
                                Mark this item as visible only to you when trip sharing is enabled.
                            </span>
                        </span>
                    </label>

                    <div>
                        <label
                            htmlFor="location_search"
                            className={LABEL_CLASS}
                        >
                            Location
                        </label>

                        <input
                            id="location_search"
                            ref={locationInputRef}
                            type="text"
                            autoComplete="off"
                            data-form-type="other"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            defaultValue={
                                initialItem?.formatted_address || initialItem?.location || ""
                            }
                            placeholder="Search for a place..."
                            className={FIELD_CLASS}
                        />

                        <input type="hidden" name="location" value={locationName} />
                        <input
                            type="hidden"
                            name="formatted_address"
                            value={formattedAddress}
                        />
                        <input
                            type="hidden"
                            name="google_place_id"
                            value={googlePlaceId}
                        />
                        <input type="hidden" name="location_lat" value={locationLat} />
                        <input type="hidden" name="location_lng" value={locationLng} />
                        <input
                            type="hidden"
                            name="cover_image_url"
                            value={coverImageUrl}
                        />

                        {(locationName || formattedAddress || googlePlaceId) && (
                            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.06] p-3 text-sm text-slate-300">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        {locationName && (
                                            <p className="font-medium">{locationName}</p>
                                        )}
                                        {formattedAddress && (
                                            <p className="mt-1 text-slate-400">
                                                {formattedAddress}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={clearValidatedLocation}
                                        className="shrink-0 rounded-md border border-white/10 bg-white/[0.08] px-3 py-1.5 text-xs font-bold text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14]"
                                    >
                                        Clear location
                                    </button>
                                </div>
                            </div>
                        )}

                        <p className={HELP_TEXT_CLASS}>
                            Start typing to search Google Places. Selecting a result will save
                            the location details.
                        </p>
                    </div>

                    <div>
                        <label
                            htmlFor="timezone"
                            className={LABEL_CLASS}
                        >
                            Time zone
                        </label>
                        <select
                            id="timezone"
                            name="timezone"
                            value={timezone}
                            onChange={(event) => {
                                setTimezone(event.target.value);
                                setTimezoneSource("manual");
                            }}
                            className={FIELD_CLASS}
                        >
                            {timezoneOptionGroups.length === 0 && (
                                <option value={timezone}>{timezone}</option>
                            )}

                            {timezoneOptionGroups.map((group) => (
                                <optgroup key={group.offsetLabel} label={group.offsetLabel}>
                                    {group.options.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>

                        <div className="mt-1 space-y-1 text-xs text-slate-400">
                            {isDetectingTimezone && <p>Detecting time zone from location...</p>}

                            {!isDetectingTimezone && timezoneSource === "auto" && (
                                <p>Time zone auto-detected from the selected location.</p>
                            )}

                            {!isDetectingTimezone && timezoneSource === "manual" && (
                                <p>You can manually override the time zone.</p>
                            )}

                            {timezoneError && <p className="text-amber-200">{timezoneError}</p>}
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                        <div>
                            <label
                                htmlFor="location_website"
                                className={LABEL_CLASS}
                            >
                                Location website
                            </label>
                            <input
                                id="location_website"
                                name="location_website"
                                type="url"
                                value={locationWebsite}
                                onChange={(event) =>
                                    setLocationWebsite(event.target.value)
                                }
                                placeholder="https://venue.com"
                                className={FIELD_CLASS}
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="ticket_website"
                                className={LABEL_CLASS}
                            >
                                Ticket website
                            </label>
                            <input
                                id="ticket_website"
                                name="ticket_website"
                                type="url"
                                value={ticketWebsite}
                                onChange={(event) => setTicketWebsite(event.target.value)}
                                placeholder="https://eventbrite.com/..."
                                className={FIELD_CLASS}
                            />
                            <input type="hidden" name="url" value={ticketWebsite} />
                        </div>
                    </div>

                    <div>
                        <label
                            htmlFor="notes"
                            className={LABEL_CLASS}
                        >
                            Notes
                        </label>
                        <textarea
                            id="notes"
                            name="notes"
                            rows={4}
                            defaultValue={initialItem?.notes || ""}
                            placeholder="Booking details, reminders, confirmation numbers..."
                            className={FIELD_CLASS}
                        />
                    </div>

                    <div
                        className={
                            isEditMode && !isClosableEditModal
                                ? "space-y-3"
                                : "flex flex-col-reverse gap-2 border-t border-white/10 pt-5 sm:flex-row sm:justify-end"
                        }
                    >
                        {(!isEditMode || isClosableEditModal) && (
                            <button
                                type="button"
                                onClick={requestCloseModal}
                                className={SUBTLE_BUTTON_CLASS}
                            >
                                Cancel
                            </button>
                        )}

                        <button
                            type="submit"
                            disabled={Boolean(endTimeIsBeforeStartTime)}
                            className={
                                isEditMode && !isClosableEditModal
                                    ? `w-full ${PRIMARY_BUTTON_CLASS}`
                                    : PRIMARY_BUTTON_CLASS
                            }
                        >
                            {isEditMode ? submitLabel : "SAVE"}
                        </button>
                    </div>
                </form>
            </aside>
        </div>
            )}

            {showCloseWarning && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0c0115]/70 px-4 py-6 backdrop-blur-sm"
                    onClick={() => setShowCloseWarning(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="unsaved-itinerary-title"
                        className="w-full max-w-md rounded-[24px] border border-white/10 bg-[#080511] p-5 text-white shadow-2xl shadow-black/60"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/15 text-amber-100">
                                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div>
                                <h2
                                    id="unsaved-itinerary-title"
                                    className="text-lg font-semibold text-white"
                                >
                                    Save changes before leaving?
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-slate-300">
                                    You have unsaved changes in this itinerary item.
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setShowCloseWarning(false)}
                                className="rounded-md border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-bold text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={discardChangesAndClose}
                                className="rounded-md border border-red-400/40 bg-red-500/15 px-4 py-2 text-sm font-bold text-red-100 transition hover:bg-red-500/25"
                            >
                                Discard
                            </button>
                            <button
                                type="button"
                                onClick={() => formRef.current?.requestSubmit()}
                                className="rounded-md bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-lime-200"
                            >
                                SAVE
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
