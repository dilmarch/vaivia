"use client";

import {
    Check,
    Lock,
    Pencil,
    Search,
    SlidersHorizontal,
    Trash2,
    X,
} from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import AnimatedModal from "@/components/AnimatedModal";
import { GooglePlaceCoverPhoto } from "@/components/GooglePlaceCoverPhoto";
import IdeaReactionBar from "@/components/IdeaReactionBar";
import MoveTripItemButton from "@/components/MoveTripItemButton";
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";
import { addVaiviaUtmAttribution } from "@/lib/outboundLinks";
import {
    IDEA_CATEGORIES,
    IDEA_AGE_POLICIES,
    IDEA_DAYS,
    IDEA_TICKET_POLICIES,
    IDEA_TIME_OF_DAY_OPTIONS,
    IDEA_TIME_WINDOWS,
    formatIdeaAvailabilityDateRange,
    formatIdeaAgePolicy,
    type IdeaDay,
    type IdeaTimeOfDay,
    type TripIdea,
    formatIdeaDayLabel,
    formatIdeaTicketPolicy,
    formatIdeaTimeLabel,
    getIdeaDayForDate,
    isIdeaAvailableOnDate,
    toIdeaDayValue,
    toIdeaTimeOfDayValue,
} from "@/lib/tripIdeas";
import type { MoveTargetTrip } from "@/lib/tripMove";

type IdeasTabProps = {
    tripId: string;
    ideas: TripIdea[];
    updateIdeaAction: (formData: FormData) => Promise<void>;
    deleteIdeaAction: (formData: FormData) => Promise<void>;
    toggleReactionAction: (formData: FormData) => Promise<void>;
    toggleAttendedAction: (formData: FormData) => Promise<void>;
    moveItemAction: (formData: FormData) => Promise<void>;
    moveTargetTrips: MoveTargetTrip[];
};

type DayFilter =
    | ""
    | IdeaDay
    | "Today"
    | "Tomorrow"
    | "Weekdays"
    | "Weekends";

type IdeaLocationTab = {
    key: string;
    label: string;
    count: number;
};

const NO_IDEA_LOCATION_KEY = "no-location";

function getLocalDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
}

function parseTags(value: string) {
    return value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
}

function normalizeLocationPart(value?: string | null) {
    return value?.trim().replace(/\s+/g, " ") || "";
}

function getIdeaLocationTab(idea: TripIdea) {
    const city = normalizeLocationPart(idea.location_city);
    const region = normalizeLocationPart(idea.location_region);
    const country = normalizeLocationPart(idea.location_country);
    const countryCode = normalizeLocationPart(idea.location_country_code);

    if (city) {
        return {
            key: `city:${city.toLocaleLowerCase()}:${(
                countryCode || country
            ).toLocaleLowerCase()}`,
            label: city,
        };
    }
    if (region) {
        return {
            key: `region:${region.toLocaleLowerCase()}:${country.toLocaleLowerCase()}`,
            label: region,
        };
    }
    if (country) {
        return {
            key: `country:${country.toLocaleLowerCase()}`,
            label: country,
        };
    }

    return {
        key: NO_IDEA_LOCATION_KEY,
        label: "NO LOCATION",
    };
}

function buildIdeaLocationTabs(ideas: TripIdea[]): IdeaLocationTab[] {
    const tabsByKey = new Map<string, IdeaLocationTab>();

    ideas.forEach((idea) => {
        const location = getIdeaLocationTab(idea);
        const existingTab = tabsByKey.get(location.key);

        tabsByKey.set(location.key, {
            ...location,
            count: (existingTab?.count || 0) + 1,
        });
    });

    return Array.from(tabsByKey.values()).sort((left, right) => {
        if (left.key === NO_IDEA_LOCATION_KEY) return 1;
        if (right.key === NO_IDEA_LOCATION_KEY) return -1;
        return left.label.localeCompare(right.label);
    });
}

function travelInputProps() {
    return {
        autoComplete: "off",
        "data-form-type": "other",
        "data-lpignore": "true",
        "data-1p-ignore": "true",
    };
}

function getLocationPartsFromPlace(place: google.maps.places.PlaceResult) {
    const components = place.address_components || [];
    const findComponent = (type: string) =>
        components.find((component) => component.types.includes(type));
    const locality =
        components.find((component) => component.types.includes("locality")) ||
        components.find((component) =>
            component.types.includes("postal_town")
        ) ||
        components.find((component) =>
            component.types.includes("administrative_area_level_2")
        ) ||
        components.find((component) =>
            component.types.includes("administrative_area_level_1")
        );
    const region = findComponent("administrative_area_level_1");
    const country = findComponent("country");
    const postalCode = findComponent("postal_code");

    return {
        city: locality?.long_name || "",
        region: region?.long_name || "",
        country: country?.long_name || "",
        countryCode: country?.short_name || "",
        postalCode: postalCode?.long_name || "",
    };
}

function IdeaAvailabilityControls({
    idea,
}: {
    idea?: TripIdea | null;
}) {
    const [selectedDays, setSelectedDays] = useState<string[]>(
        idea?.days_available || []
    );
    const [selectedTimes, setSelectedTimes] = useState<string[]>(
        idea?.time_of_day || []
    );
    const [availabilityStartDate, setAvailabilityStartDate] = useState(
        idea?.availability_start_date || ""
    );
    const [availabilityEndDate, setAvailabilityEndDate] = useState(
        idea?.availability_end_date || ""
    );

    function toggleValue(
        value: string,
        values: string[],
        setter: (nextValues: string[]) => void
    ) {
        setter(
            values.includes(value)
                ? values.filter((entry) => entry !== value)
                : [...values, value]
        );
    }

    function setDays(days: readonly string[]) {
        setSelectedDays([...days]);
    }

    return (
        <div className="space-y-5">
            <div>
                <p className="text-sm font-medium text-slate-700">
                    Date availability
                </p>
                <div className="mt-2 grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm text-slate-700">
                        Start date
                        <DateInput
                            name="availability_start_date"
                            value={availabilityStartDate}
                            max={availabilityEndDate || undefined}
                            onChange={(event) =>
                                setAvailabilityStartDate(event.target.value)
                            }
                            {...travelInputProps()}
                            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                        />
                    </label>
                    <label className="block text-sm text-slate-700">
                        End date
                        <DateInput
                            name="availability_end_date"
                            value={availabilityEndDate}
                            min={availabilityStartDate || undefined}
                            onChange={(event) =>
                                setAvailabilityEndDate(event.target.value)
                            }
                            {...travelInputProps()}
                            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                        />
                    </label>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                    Leave the weekdays below blank to make this available every day
                    in the date range. Select weekdays to limit it to those days.
                </p>
            </div>

            <div>
                <p className="text-sm font-medium text-slate-700">Days available</p>
                <div className="mt-2 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setDays(IDEA_DAYS)}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                        Every day
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            setDays([
                                "Monday",
                                "Tuesday",
                                "Wednesday",
                                "Thursday",
                                "Friday",
                            ])
                        }
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                        Weekdays
                    </button>
                    <button
                        type="button"
                        onClick={() => setDays(["Saturday", "Sunday"])}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                        Weekends
                    </button>
                    <button
                        type="button"
                        onClick={() => setSelectedDays([])}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                        Clear
                    </button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {IDEA_DAYS.map((day) => {
                        const isSelected = selectedDays.includes(day);

                        return (
                            <button
                                key={day}
                                type="button"
                                onClick={() =>
                                    toggleValue(day, selectedDays, setSelectedDays)
                                }
                                aria-pressed={isSelected}
                                className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                                    isSelected
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                }`}
                            >
                                {day}
                            </button>
                        );
                    })}
                </div>
                {selectedDays.map((day) => (
                    <input
                        key={day}
                        type="hidden"
                        name="days_of_week"
                        value={toIdeaDayValue(day)}
                    />
                ))}
            </div>

            <div>
                <p className="text-sm font-medium text-slate-700">
                    Time of day availability
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {IDEA_TIME_OF_DAY_OPTIONS.map((time) => {
                        const isSelected = selectedTimes.includes(time);

                        return (
                            <button
                                key={time}
                                type="button"
                                onClick={() => {
                                    toggleValue(
                                        time,
                                        selectedTimes,
                                        setSelectedTimes
                                    );
                                }}
                                aria-pressed={isSelected}
                                className={`rounded-md border px-3 py-2 text-left transition ${
                                    isSelected
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                }`}
                            >
                                <span className="block text-sm font-semibold">
                                    {time}
                                </span>
                                <span
                                    className={`mt-0.5 block text-xs ${
                                        isSelected ? "text-white/70" : "text-slate-500"
                                    }`}
                                >
                                    {IDEA_TIME_WINDOWS[time]}
                                </span>
                            </button>
                        );
                    })}
                </div>
                {selectedTimes.map((time) => (
                    <input
                        key={time}
                        type="hidden"
                        name="time_of_day"
                        value={toIdeaTimeOfDayValue(time)}
                    />
                ))}
            </div>
        </div>
    );
}

export function IdeaForm({
    tripId,
    action,
    idea,
    onCancel,
    deleteAction,
    moveItemAction,
    moveTargetTrips = [],
    modal = false,
}: {
    tripId: string;
    action: (formData: FormData) => Promise<void>;
    idea?: TripIdea | null;
    onCancel?: () => void;
    deleteAction?: (formData: FormData) => Promise<void>;
    moveItemAction?: (formData: FormData) => Promise<void>;
    moveTargetTrips?: MoveTargetTrip[];
    modal?: boolean;
}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const addressInputRef = useRef<HTMLInputElement | null>(null);
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [title, setTitle] = useState(idea?.title || "");
    const [location, setLocation] = useState(idea?.location || idea?.address || "");
    const [formattedAddress, setFormattedAddress] = useState(
        idea?.formatted_address || ""
    );
    const [googlePlaceId, setGooglePlaceId] = useState(idea?.google_place_id || "");
    const [locationLat, setLocationLat] = useState(
        idea?.location_lat?.toString() || ""
    );
    const [locationLng, setLocationLng] = useState(
        idea?.location_lng?.toString() || ""
    );
    const [locationCity, setLocationCity] = useState(idea?.location_city || "");
    const [locationRegion, setLocationRegion] = useState(
        idea?.location_region || ""
    );
    const [locationCountry, setLocationCountry] = useState(
        idea?.location_country || ""
    );
    const [locationCountryCode, setLocationCountryCode] = useState(
        idea?.location_country_code || ""
    );
    const [locationPostalCode, setLocationPostalCode] = useState(
        idea?.location_postal_code || ""
    );
    const [locationWebsite, setLocationWebsite] = useState(
        idea?.location_website || ""
    );
    const [ticketWebsite, setTicketWebsite] = useState(idea?.ticket_website || "");
    const [is24Hours, setIs24Hours] = useState(Boolean(idea?.is_24_hours));
    const [opensAt, setOpensAt] = useState(idea?.opens_at?.slice(0, 5) || "");
    const [closesAt, setClosesAt] = useState(idea?.closes_at?.slice(0, 5) || "");
    const [ticketPolicy, setTicketPolicy] = useState(idea?.ticket_policy || "any");
    const [agePolicy, setAgePolicy] = useState(idea?.age_policy || "all_ages");
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const returnTo = useMemo(() => {
        const query = searchParams.toString();
        return `${pathname || ""}${query ? `?${query}` : ""}`;
    }, [pathname, searchParams]);

    useEffect(() => {
        if (!isGoogleReady) return;
        if (!addressInputRef.current) return;
        if (!window.google?.maps?.places?.Autocomplete) return;

        const autocomplete = new window.google.maps.places.Autocomplete(
            addressInputRef.current,
            {
                fields: [
                    "place_id",
                    "name",
                    "formatted_address",
                    "geometry",
                    "address_components",
                    "website",
                ],
            }
        );

        const listener = autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            const name = place.name || "";
            const nextFormattedAddress = place.formatted_address || "";
            const website = addVaiviaUtmAttribution(place.website);
            const lat = place.geometry?.location?.lat();
            const lng = place.geometry?.location?.lng();
            const locationParts = getLocationPartsFromPlace(place);

            setLocation(
                name || nextFormattedAddress || addressInputRef.current?.value || ""
            );
            setFormattedAddress(nextFormattedAddress);
            setGooglePlaceId(place.place_id || "");
            setLocationCity(locationParts.city);
            setLocationRegion(locationParts.region);
            setLocationCountry(locationParts.country);
            setLocationCountryCode(locationParts.countryCode);
            setLocationPostalCode(locationParts.postalCode);
            setLocationWebsite(website);
            setLocationLat(typeof lat === "number" ? lat.toString() : "");
            setLocationLng(typeof lng === "number" ? lng.toString() : "");
        });

        return () => listener.remove();
    }, [isGoogleReady]);

    function select24Hours() {
        setIs24Hours(true);
        setOpensAt("00:00");
        setClosesAt("23:59");
    }

    return (
        <form
            action={action}
            className={
                modal
                    ? "space-y-5"
                    : "space-y-5 rounded-md border border-slate-200 bg-white p-4 shadow-sm"
            }
        >
            <Script
                src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
                strategy="afterInteractive"
                onLoad={() => setIsGoogleReady(true)}
                onReady={() => setIsGoogleReady(true)}
            />
            <input type="hidden" name="trip_id" value={tripId} />
            <input type="hidden" name="return_to" value={returnTo} />
            {idea && <input type="hidden" name="idea_id" value={idea.id} />}
            <input type="hidden" name="formatted_address" value={formattedAddress} />
            <input type="hidden" name="google_place_id" value={googlePlaceId} />
            <input type="hidden" name="location_lat" value={locationLat} />
            <input type="hidden" name="location_lng" value={locationLng} />
            <input type="hidden" name="location_city" value={locationCity} />
            <input type="hidden" name="location_region" value={locationRegion} />
            <input type="hidden" name="location_country" value={locationCountry} />
            <input
                type="hidden"
                name="location_country_code"
                value={locationCountryCode}
            />
            <input
                type="hidden"
                name="location_postal_code"
                value={locationPostalCode}
            />
            <input
                type="hidden"
                name="location_website"
                value={locationWebsite}
            />
            <input type="hidden" name="is_24_hours" value={is24Hours ? "true" : "false"} />

            <div>
                <label
                    htmlFor={idea ? `idea-address-${idea.id}` : "idea-address"}
                    className="block text-sm font-medium text-slate-700"
                >
                    Location
                </label>
                <input
                    id={idea ? `idea-address-${idea.id}` : "idea-address"}
                    ref={addressInputRef}
                    name="location"
                    type="text"
                    required
                    autoFocus={!idea}
                    value={location}
                    onChange={(event) => {
                        setLocation(event.target.value);
                        setFormattedAddress("");
                        setGooglePlaceId("");
                        setLocationCity("");
                        setLocationRegion("");
                        setLocationCountry("");
                        setLocationCountryCode("");
                        setLocationPostalCode("");
                        setLocationWebsite("");
                        setLocationLat("");
                        setLocationLng("");
                    }}
                    placeholder="Search for a place or address"
                    {...travelInputProps()}
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                />
                <p className="mt-1 text-xs text-slate-500">
                    Start with where the activity is. Select a Google Places result when available.
                </p>
                {locationCity && (
                    <p className="mt-1 text-xs font-medium text-emerald-700">
                        Validated for {locationCity}
                    </p>
                )}
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                <div>
                    <label
                        htmlFor={idea ? `idea-title-${idea.id}` : "idea-title"}
                        className="block text-sm font-medium text-slate-700"
                    >
                        Name <span className="font-normal text-slate-500">(optional)</span>
                    </label>
                    <input
                        id={idea ? `idea-title-${idea.id}` : "idea-title"}
                        name="title"
                        type="text"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Add a custom activity name"
                        {...travelInputProps()}
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                        Leave this blank to use the selected place name.
                    </p>
                </div>
                <div>
                    <label
                        htmlFor={idea ? `idea-category-${idea.id}` : "idea-category"}
                        className="block text-sm font-medium text-slate-700"
                    >
                        Category
                    </label>
                    <select
                        id={idea ? `idea-category-${idea.id}` : "idea-category"}
                        name="category"
                        defaultValue={idea?.category || "Other"}
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    >
                        {IDEA_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                                {category}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <input
                    type="checkbox"
                    name="is_private"
                    defaultChecked={Boolean(idea?.is_private)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                />
                <span>
                    <span className="flex items-center gap-2 font-semibold text-slate-900">
                        <Lock className="h-4 w-4" aria-hidden="true" />
                        Private
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                        Mark this idea as visible only to you when trip sharing is enabled.
                    </span>
                </span>
            </label>

            <div>
                <label
                    htmlFor={idea ? `idea-description-${idea.id}` : "idea-description"}
                    className="block text-sm font-medium text-slate-700"
                >
                    Description / notes
                </label>
                <textarea
                    id={idea ? `idea-description-${idea.id}` : "idea-description"}
                    name="description"
                    rows={3}
                    defaultValue={idea?.description || ""}
                    {...travelInputProps()}
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                />
            </div>

            <div>
                <label
                    htmlFor={idea ? `idea-tags-${idea.id}` : "idea-tags"}
                    className="block text-sm font-medium text-slate-700"
                >
                    Tags
                </label>
                <input
                    id={idea ? `idea-tags-${idea.id}` : "idea-tags"}
                    name="tags"
                    type="text"
                    placeholder="rainy day, cheap, must do"
                    defaultValue={idea?.tags.join(", ") || ""}
                    {...travelInputProps()}
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                />
            </div>

            <IdeaAvailabilityControls idea={idea} />

            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label
                        htmlFor={
                            idea
                                ? `idea-location-website-${idea.id}`
                                : "idea-location-website"
                        }
                        className="block text-sm font-medium text-slate-700"
                    >
                        Location website
                    </label>
                    <input
                        id={
                            idea
                                ? `idea-location-website-${idea.id}`
                                : "idea-location-website"
                        }
                        name="location_website_visible"
                        type="url"
                        value={locationWebsite}
                        onChange={(event) => setLocationWebsite(event.target.value)}
                        placeholder="https://venue.com"
                        {...travelInputProps()}
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </div>
                <div>
                    <label
                        htmlFor={
                            idea
                                ? `idea-ticket-website-${idea.id}`
                                : "idea-ticket-website"
                        }
                        className="block text-sm font-medium text-slate-700"
                    >
                        Ticket website
                    </label>
                    <input
                        id={
                            idea
                                ? `idea-ticket-website-${idea.id}`
                                : "idea-ticket-website"
                        }
                        name="ticket_website"
                        type="url"
                        value={ticketWebsite}
                        onChange={(event) => setTicketWebsite(event.target.value)}
                        placeholder="https://eventbrite.com/..."
                        {...travelInputProps()}
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label
                        htmlFor={idea ? `idea-opens-${idea.id}` : "idea-opens"}
                        className="block text-sm font-medium text-slate-700"
                    >
                        Optional opening time
                    </label>
                    <TimeInput
                        id={idea ? `idea-opens-${idea.id}` : "idea-opens"}
                        name="opens_at"
                        value={opensAt}
                        onChange={(event) => {
                            setOpensAt(event.target.value);
                            setIs24Hours(false);
                        }}
                        {...travelInputProps()}
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </div>
                <div>
                    <label
                        htmlFor={idea ? `idea-closes-${idea.id}` : "idea-closes"}
                        className="block text-sm font-medium text-slate-700"
                    >
                        Optional closing time
                    </label>
                    <TimeInput
                        id={idea ? `idea-closes-${idea.id}` : "idea-closes"}
                        name="closes_at"
                        value={closesAt}
                        onChange={(event) => {
                            setClosesAt(event.target.value);
                            setIs24Hours(false);
                        }}
                        {...travelInputProps()}
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
                </div>
            </div>

            <button
                type="button"
                onClick={select24Hours}
                className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                    is24Hours
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
            >
                24 hours
            </button>

            <div>
                <p className="text-sm font-medium text-slate-700">Tickets</p>
                <div className="mt-2 flex flex-wrap gap-2">
                    {IDEA_TICKET_POLICIES.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setTicketPolicy(option.value)}
                            className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                                ticketPolicy === option.value
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                            }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <input type="hidden" name="ticket_policy" value={ticketPolicy} />
            </div>

            <div>
                <p className="text-sm font-medium text-slate-700">Age policy</p>
                <div className="mt-2 flex flex-wrap gap-2">
                    {IDEA_AGE_POLICIES.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setAgePolicy(option.value)}
                            className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                                agePolicy === option.value
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                            }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <input type="hidden" name="age_policy" value={agePolicy} />
            </div>

            <div>
                <label
                    htmlFor={idea ? `idea-dress-code-${idea.id}` : "idea-dress-code"}
                    className="block text-sm font-medium text-slate-700"
                >
                    Dress code
                </label>
                <textarea
                    id={idea ? `idea-dress-code-${idea.id}` : "idea-dress-code"}
                    name="dress_code"
                    rows={3}
                    defaultValue={idea?.dress_code || ""}
                    {...travelInputProps()}
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                />
            </div>

            <div>
                <label
                    htmlFor={idea ? `idea-other-${idea.id}` : "idea-other"}
                    className="block text-sm font-medium text-slate-700"
                >
                    Other
                </label>
                <textarea
                    id={idea ? `idea-other-${idea.id}` : "idea-other"}
                    name="other_notes"
                    rows={3}
                    defaultValue={idea?.other_notes || ""}
                    {...travelInputProps()}
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                />
            </div>

            {idea && deleteAction && isConfirmingDelete ? (
                <div
                    className="rounded-xl border border-red-200 bg-red-50 p-4"
                    role="alert"
                    aria-live="polite"
                >
                    <p className="text-sm font-bold text-red-950">
                        Delete “{idea.title}” permanently?
                    </p>
                    <p className="mt-1 text-xs font-medium leading-5 text-red-800">
                        This removes the idea and its votes. This action cannot be undone.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="submit"
                            formAction={deleteAction}
                            formNoValidate
                            className={
                                modal
                                    ? "vaivia-modal-button-danger"
                                    : "inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-500"
                            }
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Yes, delete idea
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsConfirmingDelete(false)}
                            className={
                                modal
                                    ? "vaivia-modal-button-secondary"
                                    : "rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-900 transition hover:bg-red-100"
                            }
                        >
                            Keep idea
                        </button>
                    </div>
                </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    {idea && deleteAction && !isConfirmingDelete ? (
                        <button
                            type="button"
                            onClick={() => setIsConfirmingDelete(true)}
                            className={
                                modal
                                    ? "vaivia-modal-button-danger"
                                    : "inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100"
                            }
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Delete idea
                        </button>
                    ) : null}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                    {idea && moveItemAction ? (
                        <MoveTripItemButton
                            itemType="idea"
                            itemId={idea.id}
                            currentTripId={tripId}
                            targetTrips={moveTargetTrips}
                            moveAction={moveItemAction}
                            itemLabel={idea.title}
                            className={
                                modal
                                    ? "vaivia-modal-button-secondary"
                                    : "rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            }
                        />
                    ) : null}
                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className={
                                modal
                                    ? "vaivia-modal-button-secondary"
                                    : "rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            }
                        >
                            Cancel
                        </button>
                    )}
                    <button
                        type="submit"
                        className={
                            modal
                                ? "vaivia-modal-button-primary"
                                : "rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                        }
                    >
                        {idea ? "Save thing to do" : "Add thing to do"}
                    </button>
                </div>
            </div>
        </form>
    );
}

function IdeaCard({
    idea,
    tripId,
    updateIdeaAction,
    deleteIdeaAction,
    toggleReactionAction,
    toggleAttendedAction,
    moveItemAction,
    moveTargetTrips,
}: {
    idea: TripIdea;
    tripId: string;
    updateIdeaAction: (formData: FormData) => Promise<void>;
    deleteIdeaAction: (formData: FormData) => Promise<void>;
    toggleReactionAction: (formData: FormData) => Promise<void>;
    toggleAttendedAction: (formData: FormData) => Promise<void>;
    moveItemAction: (formData: FormData) => Promise<void>;
    moveTargetTrips: MoveTargetTrip[];
}) {
    const [isEditing, setIsEditing] = useState(false);

    return (
        <>
        <article
            className={`relative overflow-hidden rounded-[1.75rem] border shadow-2xl shadow-black/20 transition duration-300 hover:-translate-y-1 ${
                idea.is_archived
                    ? "border-white/10 bg-white/[0.035] opacity-70"
                    : idea.attended
                      ? "border-white/10 bg-[#03030a]/70 opacity-80"
                      : "border-white/10 bg-[#03030a]/90"
            }`}
        >
            {idea.google_place_id ? (
                <GooglePlaceCoverPhoto
                    placeId={idea.google_place_id}
                    alt={`${idea.title} from Google Maps`}
                />
            ) : null}
            <div className="relative p-5 pr-16">
            <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-slate-200 shadow-xl shadow-black/20 transition hover:border-lime-300/50 hover:bg-lime-300 hover:text-slate-950"
                aria-label={`Edit ${idea.title}`}
                title="Edit idea"
            >
                <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="flex gap-4">
                <form action={toggleAttendedAction} className="pt-1">
                    <input type="hidden" name="trip_id" value={tripId} />
                    <input type="hidden" name="idea_id" value={idea.id} />
                    <input
                        type="hidden"
                        name="attended"
                        value={idea.attended ? "false" : "true"}
                    />
                    <button
                        type="submit"
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
                            idea.attended
                                ? "border-lime-300 bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.24)]"
                                : "border-white/20 bg-white/[0.04] text-transparent hover:border-lime-300/60 hover:bg-white/[0.08]"
                        }`}
                        aria-pressed={idea.attended}
                        aria-label={
                            idea.attended
                                ? `Mark ${idea.title} as not attended`
                                : `Mark ${idea.title} as attended`
                        }
                        title={idea.attended ? "Attended" : "Mark attended"}
                    >
                        {idea.attended ? (
                            <Check className="h-4 w-4" aria-hidden="true" />
                        ) : null}
                    </button>
                </form>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-lime-300">
                            {idea.category}
                        </p>
                        {idea.attended && (
                            <span className="rounded-full border border-lime-300/30 bg-lime-300/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-lime-100">
                                Attended
                            </span>
                        )}
                        {idea.is_archived && (
                            <span className="rounded-full border border-white/10 bg-white/[0.08] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
                                Archived
                            </span>
                        )}
                        {idea.is_private && (
                            <span className="vaivia-private-tag inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                                <Lock className="h-3 w-3" aria-hidden="true" />
                                Private
                            </span>
                        )}
                    </div>
                    <h3 className="mt-2 text-2xl font-black tracking-tight text-white">
                        {idea.title}
                    </h3>
                    {idea.description && (
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                            {idea.description}
                        </p>
                    )}
                    {(idea.location_city ||
                        idea.location ||
                        idea.address ||
                        idea.formatted_address) && (
                        <p className="mt-3 text-sm font-semibold text-slate-200">
                            {idea.location_city ||
                                idea.location ||
                                idea.address ||
                                idea.formatted_address}
                        </p>
                    )}
                </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                {idea.tags.map((tag) => (
                    <span
                        key={tag}
                        className="rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-xs font-semibold text-slate-200"
                    >
                        {tag}
                    </span>
                ))}
            </div>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
                    <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                        Days
                    </dt>
                    <dd className="mt-1 text-slate-100">
                        {formatIdeaDayLabel(idea.days_available)}
                    </dd>
                </div>
                {(idea.availability_start_date || idea.availability_end_date) && (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
                        <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                            Date range
                        </dt>
                        <dd className="mt-1 text-slate-100">
                            {formatIdeaAvailabilityDateRange(idea)}
                        </dd>
                    </div>
                )}
                <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
                    <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                        Time
                    </dt>
                    <dd className="mt-1 text-slate-100">
                        {idea.is_24_hours
                            ? "24 hours"
                            : formatIdeaTimeLabel(idea.time_of_day)}
                    </dd>
                </div>
                {idea.ticket_policy && (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
                        <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                            Tickets
                        </dt>
                        <dd className="mt-1 text-slate-100">
                            {formatIdeaTicketPolicy(idea.ticket_policy)}
                        </dd>
                    </div>
                )}
                {idea.age_policy && (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
                        <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                            Age
                        </dt>
                        <dd className="mt-1 text-slate-100">
                            {formatIdeaAgePolicy(idea.age_policy)}
                        </dd>
                    </div>
                )}
            </dl>
            {(idea.dress_code || idea.other_notes) && (
                <div className="mt-4 space-y-2 text-sm text-slate-300">
                    {idea.dress_code && (
                        <p>
                            <span className="font-semibold text-white">
                                Dress code:
                            </span>{" "}
                            {idea.dress_code}
                        </p>
                    )}
                    {idea.other_notes && (
                        <p>
                            <span className="font-semibold text-white">Other:</span>{" "}
                            {idea.other_notes}
                        </p>
                    )}
                </div>
            )}
            {(idea.location_website || idea.ticket_website) && (
                <div className="mt-4 flex flex-wrap gap-2">
                    {idea.location_website && (
                        <a
                            href={addVaiviaUtmAttribution(idea.location_website)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-slate-200 transition hover:border-lime-300/50 hover:bg-white/10 hover:text-white"
                        >
                            Venue
                        </a>
                    )}
                    {idea.ticket_website && (
                        <a
                            href={addVaiviaUtmAttribution(idea.ticket_website)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full bg-lime-300 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.2)] transition hover:bg-lime-200"
                        >
                            Tickets
                        </a>
                    )}
                </div>
            )}
            <IdeaReactionBar
                tripId={tripId}
                ideaId={idea.id}
                summaries={idea.reaction_summaries}
                currentUserReaction={idea.current_user_reaction}
                toggleReactionAction={toggleReactionAction}
            />
            </div>
        </article>
        {isEditing ? (
            <AnimatedModal
                onClose={() => setIsEditing(false)}
                panelClassName="max-w-3xl"
                labelledBy={`edit-idea-title-${idea.id}`}
            >
                {({ requestClose }) => (
                    <>
                        <div className="vaivia-modal-header flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <p className="vaivia-modal-eyebrow">Trip Ideas</p>
                                <h2
                                    id={`edit-idea-title-${idea.id}`}
                                    className="vaivia-modal-title"
                                >
                                    Edit thing to do
                                </h2>
                                <p className="mt-2 truncate text-sm font-semibold text-slate-300">
                                    {idea.title}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={requestClose}
                                className="vaivia-modal-close"
                                aria-label={`Close edit ${idea.title}`}
                            >
                                <X className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </div>
                        <div className="vaivia-modal-body">
                            <IdeaForm
                                tripId={tripId}
                                idea={idea}
                                action={updateIdeaAction}
                                onCancel={requestClose}
                                deleteAction={deleteIdeaAction}
                                moveItemAction={moveItemAction}
                                moveTargetTrips={moveTargetTrips}
                                modal
                            />
                        </div>
                    </>
                )}
            </AnimatedModal>
        ) : null}
        </>
    );
}

export default function IdeasTab({
    tripId,
    ideas,
    updateIdeaAction,
    deleteIdeaAction,
    toggleReactionAction,
    toggleAttendedAction,
    moveItemAction,
    moveTargetTrips,
}: IdeasTabProps) {
    const [categoryFilter, setCategoryFilter] = useState("");
    const [timeFilter, setTimeFilter] = useState("");
    const [dayFilter, setDayFilter] = useState<DayFilter>("");
    const [tagFilter, setTagFilter] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [locationFilter, setLocationFilter] = useState("");
    const [showArchived, setShowArchived] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const visibleIdeas = showArchived
        ? ideas
        : ideas.filter((idea) => !idea.is_archived);
    const locationTabs = buildIdeaLocationTabs(visibleIdeas);
    const activeLocationFilter = locationTabs.some(
        (tab) => tab.key === locationFilter
    )
        ? locationFilter
        : "";
    const hasAnyActiveIdeas = ideas.some((idea) => !idea.is_archived);
    const todayDate = new Date();
    const tomorrowDate = addDays(todayDate, 1);
    const today = getIdeaDayForDate(todayDate);
    const filteredIdeas = (() => {
        const requestedTags = parseTags(tagFilter.toLowerCase());
        const query = searchQuery.trim().toLowerCase();

        return visibleIdeas.filter((idea) => {
            if (
                activeLocationFilter &&
                getIdeaLocationTab(idea).key !== activeLocationFilter
            ) {
                return false;
            }

            if (
                query &&
                ![
                    idea.title,
                    idea.description || "",
                    idea.category,
                    idea.location || "",
                    idea.address || "",
                    idea.formatted_address || "",
                    idea.location_city || "",
                    idea.location_website || "",
                    idea.ticket_website || "",
                    idea.ticket_policy
                        ? formatIdeaTicketPolicy(idea.ticket_policy)
                        : "",
                    idea.age_policy || "",
                    idea.age_policy ? formatIdeaAgePolicy(idea.age_policy) : "",
                    idea.dress_code || "",
                    idea.other_notes || "",
                    ...idea.tags,
                ]
                    .join(" ")
                    .toLowerCase()
                    .includes(query)
            ) {
                return false;
            }

            if (categoryFilter && idea.category !== categoryFilter) return false;
            if (timeFilter && !idea.time_of_day.includes(timeFilter as IdeaTimeOfDay)) {
                return false;
            }

            if (dayFilter) {
                if (dayFilter === "Today" && !isIdeaAvailableOnDate(idea, todayDate)) {
                    return false;
                }
                if (
                    dayFilter === "Tomorrow" &&
                    !isIdeaAvailableOnDate(idea, tomorrowDate)
                ) {
                    return false;
                }
                if (
                    dayFilter === "Weekdays" &&
                    idea.days_available.length > 0 &&
                    !idea.days_available.some((day) =>
                        ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].includes(
                            day
                        )
                    )
                ) {
                    return false;
                }
                if (
                    dayFilter === "Weekends" &&
                    idea.days_available.length > 0 &&
                    !idea.days_available.some((day) =>
                        ["Saturday", "Sunday"].includes(day)
                    )
                ) {
                    return false;
                }
                if (
                    IDEA_DAYS.includes(dayFilter as IdeaDay) &&
                    idea.days_available.length > 0 &&
                    !idea.days_available.includes(dayFilter as IdeaDay)
                ) {
                    return false;
                }
            }

            if (
                requestedTags.length > 0 &&
                !requestedTags.every((tag) =>
                    idea.tags.some((ideaTag) => ideaTag.toLowerCase().includes(tag))
                )
            ) {
                return false;
            }

            return true;
        });
    })();

    return (
        <section className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-2xl font-black tracking-tight text-white">
                        Things to Do
                    </h2>
                    <p className="mt-1 text-sm text-slate-300">
                        Browse loose possibilities for free time, rainy days, late
                        nights, and plans that are still taking shape.
                    </p>
                </div>
            </div>

            <div className="overflow-x-auto pb-1">
                <div
                    role="tablist"
                    aria-label="Filter things to do by location"
                    className="flex min-w-max gap-2 rounded-[1.35rem] border border-white/10 bg-[#03030a] p-2 shadow-2xl shadow-black/20"
                >
                    <button
                        type="button"
                        role="tab"
                        aria-label={`All locations, ${visibleIdeas.length} things to do`}
                        aria-selected={!activeLocationFilter}
                        aria-controls="things-to-do-grid"
                        onClick={() => setLocationFilter("")}
                        className={`rounded-[0.95rem] px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] transition ${
                            !activeLocationFilter
                                ? "bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.2)]"
                                : "text-slate-300 hover:bg-white/10 hover:text-white"
                        }`}
                    >
                        ALL
                        <span className="ml-2 opacity-70">{visibleIdeas.length}</span>
                    </button>
                    {locationTabs.map((tab) => {
                        const isActive = activeLocationFilter === tab.key;

                        return (
                            <button
                                key={tab.key}
                                type="button"
                                role="tab"
                                aria-label={`${tab.label}, ${tab.count} ${
                                    tab.count === 1 ? "thing" : "things"
                                } to do`}
                                aria-selected={isActive}
                                aria-controls="things-to-do-grid"
                                onClick={() => setLocationFilter(tab.key)}
                                className={`rounded-[0.95rem] px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] transition ${
                                    isActive
                                        ? "bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.2)]"
                                        : "text-slate-300 hover:bg-white/10 hover:text-white"
                                }`}
                            >
                                {tab.label}
                                <span className="ml-2 opacity-70">{tab.count}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <label className="relative min-w-0 flex-1">
                        <span className="sr-only">Search ideas</span>
                        <Search
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                            aria-hidden="true"
                        />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search activities, tags, categories, or notes"
                            {...travelInputProps()}
                            className="w-full rounded-full border border-white/10 bg-white px-4 py-2 pl-9 text-slate-900 shadow-sm"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={() => setShowFilters((isVisible) => !isVisible)}
                        aria-expanded={showFilters}
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold uppercase tracking-[0.14em] text-slate-200 transition hover:border-lime-300/50 hover:bg-white/10 hover:text-white"
                    >
                        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                        Filters
                    </button>
                </div>
            </div>

            {showFilters && (
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20">
                    <div className="grid gap-3 md:grid-cols-4">
                        <label className="block text-sm font-semibold text-slate-200">
                            Category
                            <select
                                value={categoryFilter}
                                onChange={(event) =>
                                    setCategoryFilter(event.target.value)
                                }
                                className="mt-2 w-full rounded-md border border-white/10 bg-white px-3 py-2 text-slate-900"
                            >
                                <option value="">All categories</option>
                                {IDEA_CATEGORIES.map((category) => (
                                    <option key={category} value={category}>
                                        {category}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block text-sm font-semibold text-slate-200">
                            Day
                            <select
                                value={dayFilter}
                                onChange={(event) =>
                                    setDayFilter(event.target.value as DayFilter)
                                }
                                className="mt-2 w-full rounded-md border border-white/10 bg-white px-3 py-2 text-slate-900"
                            >
                                <option value="">All days</option>
                                <option value="Today">Today</option>
                                <option value="Tomorrow">Tomorrow</option>
                                <option value="Weekdays">Weekdays</option>
                                <option value="Weekends">Weekends</option>
                                {IDEA_DAYS.map((day) => (
                                    <option key={day} value={day}>
                                        {day}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block text-sm font-semibold text-slate-200">
                            Time
                            <select
                                value={timeFilter}
                                onChange={(event) =>
                                    setTimeFilter(event.target.value)
                                }
                                className="mt-2 w-full rounded-md border border-white/10 bg-white px-3 py-2 text-slate-900"
                            >
                                <option value="">All times</option>
                                {IDEA_TIME_OF_DAY_OPTIONS.map((time) => (
                                    <option key={time} value={time}>
                                        {time}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block text-sm font-semibold text-slate-200">
                            Tags
                            <input
                                type="text"
                                value={tagFilter}
                                onChange={(event) =>
                                    setTagFilter(event.target.value)
                                }
                                placeholder="cheap, rainy day"
                                {...travelInputProps()}
                                className="mt-2 w-full rounded-md border border-white/10 bg-white px-3 py-2 text-slate-900"
                            />
                        </label>
                    </div>
                    <label className="mt-4 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-bold text-slate-200">
                        <input
                            type="checkbox"
                            checked={showArchived}
                            onChange={(event) =>
                                setShowArchived(event.target.checked)
                            }
                            className="h-4 w-4 rounded border-slate-300 text-lime-300"
                        />
                        Show archived
                    </label>
                </div>
            )}

            <div id="things-to-do-grid" role="tabpanel" aria-live="polite">
            {!hasAnyActiveIdeas && !showArchived ? (
                <div className="rounded-[1.5rem] border border-dashed border-white/15 bg-white/[0.045] p-8 text-center">
                    <h3 className="text-lg font-bold text-white">
                        No trip ideas yet
                    </h3>
                    <p className="mt-2 text-sm text-slate-300">
                        Add a restaurant, museum, park walk, bar, or anything you might
                        want to remember.
                    </p>
                </div>
            ) : filteredIdeas.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-white/15 bg-white/[0.045] p-8 text-center">
                    <h3 className="text-lg font-bold text-white">
                        No trip ideas match these filters
                    </h3>
                    <p className="mt-2 text-sm text-slate-300">
                        Try loosening the category, day, time, or tag filters.
                    </p>
                </div>
            ) : (
                <div className="grid gap-5 md:grid-cols-2">
                    {filteredIdeas.map((idea) => (
                        <IdeaCard
                            key={idea.id}
                            idea={idea}
                            tripId={tripId}
                            updateIdeaAction={updateIdeaAction}
                            deleteIdeaAction={deleteIdeaAction}
                            toggleReactionAction={toggleReactionAction}
                            toggleAttendedAction={toggleAttendedAction}
                            moveItemAction={moveItemAction}
                            moveTargetTrips={moveTargetTrips}
                        />
                    ))}
                </div>
            )}
            </div>

            <p className="text-xs text-slate-500">
                Today is {today}. Filter snapshots use your computer date:{" "}
                {getLocalDateKey(new Date())}.
            </p>
        </section>
    );
}
