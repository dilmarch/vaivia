"use client";

import { AlertTriangle, Lock, Plus, X } from "lucide-react";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type InitialItem = {
    title?: string;
    item_date?: string;
    end_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    category?: string;
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
};

type ItineraryItemFormProps = {
    tripId: string;
    submitAction: (formData: FormData) => Promise<void>;
    initialItem?: InitialItem;
    submitLabel?: string;
    showLauncher?: boolean;
    openSignal?: number;
    defaultDate?: string;
    duplicateMode?: boolean;
    onClose?: () => void;
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
    submitAction,
    initialItem,
    submitLabel = "Add itinerary item",
    showLauncher = true,
    openSignal = 0,
    defaultDate = "",
    duplicateMode = false,
    onClose,
}: ItineraryItemFormProps) {
    const isEditMode = Boolean(initialItem) && !duplicateMode;
    const formRef = useRef<HTMLFormElement | null>(null);
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
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showCloseWarning, setShowCloseWarning] = useState(false);

    const locationInputRef = useRef<HTMLInputElement | null>(null);
    const previousOpenSignalRef = useRef(openSignal);

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

    function requestCloseModal() {
        if (hasUnsavedChanges) {
            setShowCloseWarning(true);
            return;
        }

        setIsModalOpen(false);
        onClose?.();
    }

    function discardChangesAndClose() {
        resetFormState();
        setShowCloseWarning(false);
        setIsModalOpen(false);
        onClose?.();
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
        setIsModalOpen(true);
    }, [defaultDate, isEditMode, openSignal]);

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
                    className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
                    aria-label="Add itinerary item"
                >
                    <Plus className="h-6 w-6" aria-hidden="true" />
                </button>
            )}

            {isModalOpen && (
                <div
                    className={
                        isEditMode
                            ? ""
                            : "vaivia-modal-backdrop"
                    }
                    onClick={isEditMode ? undefined : requestCloseModal}
                >
                    <aside
                        className={
                            isEditMode
                                ? "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                                : "vaivia-modal-panel max-w-2xl"
                        }
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div
                            className={
                                isEditMode
                                    ? ""
                                    : "vaivia-modal-header flex items-center justify-between gap-4"
                            }
                        >
                            <div>
                                {!isEditMode && (
                                    <p className="vaivia-modal-eyebrow">
                                        Quick add
                                    </p>
                                )}
                                <h2 className={isEditMode ? "text-xl font-semibold text-slate-900" : "vaivia-modal-title"}>
                                    {isEditMode ? "Edit itinerary item" : submitLabel}
                                </h2>
                            </div>

                            {!isEditMode && (
                                <button
                                    type="button"
                                    onClick={requestCloseModal}
                                    className="vaivia-modal-close"
                                    aria-label="Close add itinerary item"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                        </div>

                        <form
                            ref={formRef}
                            action={submitAction}
                            onChange={() => setHasUnsavedChanges(true)}
                            className={isEditMode ? "mt-5 space-y-4" : "vaivia-modal-body space-y-4"}
                        >
                    <input type="hidden" name="trip_id" value={tripId} />
                    <input type="hidden" name="timezone_source" value={timezoneSource} />

                    <div>
                        <label
                            htmlFor="itineraryItemTitle"
                            className="block text-sm font-medium text-slate-700"
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
                            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="itineraryItemDate"
                            className="block text-sm font-medium text-slate-700"
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
                            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                        />
                    </div>

                    {endsNextDay && (
                        <div>
                            <label
                                htmlFor="itineraryItemEndDate"
                                className="block text-sm font-medium text-slate-700"
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
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                            />
                        </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                        <div>
                            <label
                                htmlFor="start_time"
                                className="block text-sm font-medium text-slate-700"
                            >
                                Start time, optional
                            </label>
                            <input
                                id="start_time"
                                name="start_time"
                                type="time"
                                value={startTime}
                                onChange={(event) => setStartTime(event.target.value)}
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="end_time"
                                className="block text-sm font-medium text-slate-700"
                            >
                                End time, optional
                            </label>
                            <input
                                id="end_time"
                                name="end_time"
                                type="time"
                                value={endTime}
                                onChange={(event) => setEndTime(event.target.value)}
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                            />
                        </div>
                    </div>

                    {endTimeIsBeforeStartTime && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
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
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                                This event will end on {endDate || "the next day"}.
                            </div>
                        )}

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                        <div>
                            <label
                                htmlFor="category"
                                className="block text-sm font-medium text-slate-700"
                            >
                                Category
                            </label>
                            <select
                                id="category"
                                name="category"
                                defaultValue={initialItem?.category || "activity"}
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                            >
                                <option value="travel">Travel</option>
                                <option value="work">Work</option>
                                <option value="activity">Activity</option>
                                <option value="other">Other</option>
                            </select>
                        </div>

                        <div>
                            <label
                                htmlFor="status"
                                className="block text-sm font-medium text-slate-700"
                            >
                                Status
                            </label>
                            <select
                                id="status"
                                name="status"
                                defaultValue={initialItem?.status || "tentative"}
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                            >
                                <option value="tentative">Tentative</option>
                                <option value="confirmed">Confirmed</option>
                            </select>
                        </div>
                    </div>

                    <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                        <input
                            type="checkbox"
                            name="is_private"
                            defaultChecked={Boolean(initialItem?.is_private)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                        />
                        <span>
                            <span className="flex items-center gap-2 font-semibold text-slate-900">
                                <Lock className="h-4 w-4" aria-hidden="true" />
                                Private
                            </span>
                            <span className="mt-1 block text-xs text-slate-500">
                                Mark this item as visible only to you when trip sharing is enabled.
                            </span>
                        </span>
                    </label>

                    <div>
                        <label
                            htmlFor="location_search"
                            className="block text-sm font-medium text-slate-700"
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
                            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
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
                            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        {locationName && (
                                            <p className="font-medium">{locationName}</p>
                                        )}
                                        {formattedAddress && (
                                            <p className="mt-1 text-slate-500">
                                                {formattedAddress}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={clearValidatedLocation}
                                        className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                                    >
                                        Clear location
                                    </button>
                                </div>
                            </div>
                        )}

                        <p className="mt-1 text-xs text-slate-500">
                            Start typing to search Google Places. Selecting a result will save
                            the location details.
                        </p>
                    </div>

                    <div>
                        <label
                            htmlFor="timezone"
                            className="block text-sm font-medium text-slate-700"
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
                            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
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

                        <div className="mt-1 space-y-1 text-xs text-slate-500">
                            {isDetectingTimezone && <p>Detecting time zone from location...</p>}

                            {!isDetectingTimezone && timezoneSource === "auto" && (
                                <p>Time zone auto-detected from the selected location.</p>
                            )}

                            {!isDetectingTimezone && timezoneSource === "manual" && (
                                <p>You can manually override the time zone.</p>
                            )}

                            {timezoneError && <p className="text-amber-700">{timezoneError}</p>}
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                        <div>
                            <label
                                htmlFor="location_website"
                                className="block text-sm font-medium text-slate-700"
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
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="ticket_website"
                                className="block text-sm font-medium text-slate-700"
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
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                            />
                            <input type="hidden" name="url" value={ticketWebsite} />
                        </div>
                    </div>

                    <div>
                        <label
                            htmlFor="notes"
                            className="block text-sm font-medium text-slate-700"
                        >
                            Notes
                        </label>
                        <textarea
                            id="notes"
                            name="notes"
                            rows={4}
                            defaultValue={initialItem?.notes || ""}
                            placeholder="Booking details, reminders, confirmation numbers..."
                            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                        />
                    </div>

                    <div
                        className={
                            isEditMode
                                ? "space-y-3"
                                : "flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end"
                        }
                    >
                        {!isEditMode && (
                            <button
                                type="button"
                                onClick={requestCloseModal}
                                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                            >
                                Cancel
                            </button>
                        )}

                        <button
                            type="submit"
                            disabled={Boolean(endTimeIsBeforeStartTime)}
                            className={
                                isEditMode
                                    ? "w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                                    : "rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
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
                        className="vaivia-modal-confirm"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div>
                                <h2
                                    id="unsaved-itinerary-title"
                                    className="text-lg font-semibold text-slate-950"
                                >
                                    Save changes before leaving?
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    You have unsaved changes in this itinerary item.
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setShowCloseWarning(false)}
                                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={discardChangesAndClose}
                                className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                            >
                                Discard
                            </button>
                            <button
                                type="button"
                                onClick={() => formRef.current?.requestSubmit()}
                                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
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
