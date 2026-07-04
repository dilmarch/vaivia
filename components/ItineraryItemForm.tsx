"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

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
    notes?: string | null;
    google_place_id?: string | null;
    location_lat?: number | null;
    location_lng?: number | null;
    formatted_address?: string | null;
};

type ItineraryItemFormProps = {
    tripId: string;
    submitAction: (formData: FormData) => Promise<void>;
    initialItem?: InitialItem;
    submitLabel?: string;
};

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

export default function ItineraryItemForm({
    tripId,
    submitAction,
    initialItem,
    submitLabel = "Add itinerary item",
}: ItineraryItemFormProps) {
    const [startDate, setStartDate] = useState(initialItem?.item_date || "");
    const [startTime, setStartTime] = useState(cleanTime(initialItem?.start_time));
    const [endTime, setEndTime] = useState(cleanTime(initialItem?.end_time));
    const [endsNextDay, setEndsNextDay] = useState(Boolean(initialItem?.end_date));
    const [endDate, setEndDate] = useState(initialItem?.end_date || "");

    const [timezone, setTimezone] = useState(
        initialItem?.timezone || "America/St_Johns"
    );
    const [timezoneSource, setTimezoneSource] = useState(
        initialItem?.timezone_source || "manual"
    );
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

    const locationInputRef = useRef<HTMLInputElement | null>(null);

    const endTimeIsBeforeStartTime =
        startTime && endTime && endTime < startTime && !endsNextDay;

    async function detectTimezoneFromLocation(lat: string, lng: string) {
        if (!lat || !lng) return;

        setIsDetectingTimezone(true);
        setTimezoneError("");

        try {
            const response = await fetch("/api/timezone", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    lat,
                    lng,
                    date: startDate || undefined,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Could not detect timezone.");
            }

            if (data.timeZoneId) {
                setTimezone(data.timeZoneId);
                setTimezoneSource("auto");
            }
        } catch (error) {
            console.error("Timezone detection error:", error);
            setTimezoneError(
                "VAIVIA could not auto-detect the time zone. Please choose it manually."
            );
            setTimezoneSource("manual");
        } finally {
            setIsDetectingTimezone(false);
        }
    }

    useEffect(() => {
        if (!locationInputRef.current) return;
        if (!window.google?.maps?.places?.Autocomplete) return;

        const autocomplete = new window.google.maps.places.Autocomplete(
            locationInputRef.current,
            {
                fields: ["place_id", "name", "formatted_address", "geometry"],
            }
        );

        const listener = autocomplete.addListener("place_changed", async () => {
            const place = autocomplete.getPlace();

            const name = place.name || "";
            const address = place.formatted_address || "";
            const lat = place.geometry?.location?.lat();
            const lng = place.geometry?.location?.lng();

            const latString = typeof lat === "number" ? lat.toString() : "";
            const lngString = typeof lng === "number" ? lng.toString() : "";

            setLocationName(name || address);
            setFormattedAddress(address);
            setGooglePlaceId(place.place_id || "");
            setLocationLat(latString);
            setLocationLng(lngString);

            if (latString && lngString) {
                await detectTimezoneFromLocation(latString, lngString);
            }
        });

        return () => {
            listener.remove();
        };
    }, [startDate]);

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

    return (
        <>
            <Script
                src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
                strategy="beforeInteractive"
            />

            <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">
                    {initialItem ? "Edit itinerary item" : "Add itinerary item"}
                </h2>

                <form action={submitAction} className="mt-5 space-y-4">
                    <input type="hidden" name="trip_id" value={tripId} />
                    <input type="hidden" name="timezone_source" value={timezoneSource} />

                    <div>
                        <label
                            htmlFor="title"
                            className="block text-sm font-medium text-slate-700"
                        >
                            Title
                        </label>
                        <input
                            id="title"
                            name="title"
                            type="text"
                            required
                            defaultValue={initialItem?.title || ""}
                            placeholder="Flight to Berlin"
                            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="item_date"
                            className="block text-sm font-medium text-slate-700"
                        >
                            {endsNextDay ? "Start date" : "Date"}
                        </label>
                        <input
                            id="item_date"
                            name="item_date"
                            type="date"
                            required
                            value={startDate}
                            onChange={(event) => setStartDate(event.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                        />
                    </div>

                    {endsNextDay && (
                        <div>
                            <label
                                htmlFor="end_date"
                                className="block text-sm font-medium text-slate-700"
                            >
                                End date
                            </label>
                            <input
                                id="end_date"
                                name="end_date"
                                type="date"
                                required
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

                        {locationName && (
                            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                                <p className="font-medium">{locationName}</p>
                                {formattedAddress && (
                                    <p className="mt-1 text-slate-500">{formattedAddress}</p>
                                )}
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
                            <option value="America/St_Johns">
                                Newfoundland — America/St_Johns
                            </option>
                            <option value="America/Halifax">Atlantic — America/Halifax</option>
                            <option value="America/Toronto">Eastern — America/Toronto</option>
                            <option value="America/New_York">
                                New York — America/New_York
                            </option>
                            <option value="America/Winnipeg">
                                Central — America/Winnipeg
                            </option>
                            <option value="America/Edmonton">
                                Mountain — America/Edmonton
                            </option>
                            <option value="America/Vancouver">
                                Vancouver — America/Vancouver
                            </option>

                            <option value="Europe/London">London — Europe/London</option>
                            <option value="Europe/Dublin">Dublin — Europe/Dublin</option>
                            <option value="Europe/Lisbon">Lisbon — Europe/Lisbon</option>
                            <option value="Europe/Berlin">Berlin — Europe/Berlin</option>
                            <option value="Europe/Amsterdam">
                                Amsterdam — Europe/Amsterdam
                            </option>
                            <option value="Europe/Paris">Paris — Europe/Paris</option>
                            <option value="Europe/Rome">Rome — Europe/Rome</option>
                            <option value="Europe/Madrid">Madrid — Europe/Madrid</option>
                            <option value="Atlantic/Canary">
                                Canary Islands — Atlantic/Canary
                            </option>

                            <option value="Asia/Seoul">Seoul — Asia/Seoul</option>
                            <option value="Asia/Tokyo">Tokyo — Asia/Tokyo</option>
                            <option value="Asia/Taipei">Taipei — Asia/Taipei</option>
                            <option value="Asia/Ho_Chi_Minh">
                                Vietnam — Asia/Ho_Chi_Minh
                            </option>
                            <option value="Asia/Bangkok">Bangkok — Asia/Bangkok</option>
                            <option value="Asia/Singapore">Singapore — Asia/Singapore</option>
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

                    <div>
                        <label
                            htmlFor="url"
                            className="block text-sm font-medium text-slate-700"
                        >
                            URL / more info
                        </label>
                        <input
                            id="url"
                            name="url"
                            type="url"
                            defaultValue={initialItem?.url || ""}
                            placeholder="https://eventbrite.com/..."
                            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                        />
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

                    <button
                        type="submit"
                        disabled={Boolean(endTimeIsBeforeStartTime)}
                        className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                        {submitLabel}
                    </button>
                </form>
            </aside>
        </>
    );
}