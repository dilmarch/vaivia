"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    IDEA_CATEGORIES,
    IDEA_DAYS,
    IDEA_TIME_OF_DAY_OPTIONS,
    IDEA_TIME_WINDOWS,
    type IdeaDay,
    type IdeaTimeOfDay,
    type TripIdea,
    formatIdeaDayLabel,
    formatIdeaTimeLabel,
} from "@/lib/tripIdeas";

type IdeasTabProps = {
    tripId: string;
    ideas: TripIdea[];
    createIdeaAction: (formData: FormData) => Promise<void>;
    updateIdeaAction: (formData: FormData) => Promise<void>;
    archiveIdeaAction: (formData: FormData) => Promise<void>;
    deleteIdeaAction: (formData: FormData) => Promise<void>;
};

type DayFilter =
    | ""
    | IdeaDay
    | "Today"
    | "Tomorrow"
    | "Weekdays"
    | "Weekends";

function getLocalDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getIdeaDayForDate(date: Date): IdeaDay {
    const days: IdeaDay[] = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    ];

    return days[date.getDay()];
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

function travelInputProps() {
    return {
        autoComplete: "off",
        "data-form-type": "other",
        "data-lpignore": "true",
        "data-1p-ignore": "true",
    };
}

function getCityFromPlace(place: google.maps.places.PlaceResult) {
    const components = place.address_components || [];
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

    return locality?.long_name || "";
}

function IdeaAvailabilityControls({ idea }: { idea?: TripIdea | null }) {
    const [selectedDays, setSelectedDays] = useState<string[]>(
        idea?.days_available || []
    );
    const [selectedTimes, setSelectedTimes] = useState<string[]>(
        idea?.time_of_day || []
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
                    <input key={day} type="hidden" name="days_available" value={day} />
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
                                onClick={() =>
                                    toggleValue(time, selectedTimes, setSelectedTimes)
                                }
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
                    <input key={time} type="hidden" name="time_of_day" value={time} />
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
}: {
    tripId: string;
    action: (formData: FormData) => Promise<void>;
    idea?: TripIdea | null;
    onCancel?: () => void;
}) {
    const addressInputRef = useRef<HTMLInputElement | null>(null);
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [address, setAddress] = useState(idea?.address || "");
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
    const [is24Hours, setIs24Hours] = useState(Boolean(idea?.is_24_hours));
    const [opensAt, setOpensAt] = useState(idea?.opens_at?.slice(0, 5) || "");
    const [closesAt, setClosesAt] = useState(idea?.closes_at?.slice(0, 5) || "");
    const [ticketType, setTicketType] = useState(idea?.ticket_type || "");
    const [agePolicy, setAgePolicy] = useState(idea?.age_policy || "");

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
                ],
            }
        );

        const listener = autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            const name = place.name || "";
            const nextFormattedAddress = place.formatted_address || "";
            const lat = place.geometry?.location?.lat();
            const lng = place.geometry?.location?.lng();

            setAddress(name || nextFormattedAddress || addressInputRef.current?.value || "");
            setFormattedAddress(nextFormattedAddress);
            setGooglePlaceId(place.place_id || "");
            setLocationCity(getCityFromPlace(place));
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
        <form action={action} className="space-y-5 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <Script
                src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
                strategy="afterInteractive"
                onLoad={() => setIsGoogleReady(true)}
                onReady={() => setIsGoogleReady(true)}
            />
            <input type="hidden" name="trip_id" value={tripId} />
            {idea && <input type="hidden" name="idea_id" value={idea.id} />}
            <input type="hidden" name="formatted_address" value={formattedAddress} />
            <input type="hidden" name="google_place_id" value={googlePlaceId} />
            <input type="hidden" name="location_lat" value={locationLat} />
            <input type="hidden" name="location_lng" value={locationLng} />
            <input type="hidden" name="location_city" value={locationCity} />
            <input type="hidden" name="is_24_hours" value={is24Hours ? "true" : "false"} />

            <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                <div>
                    <label
                        htmlFor={idea ? `idea-title-${idea.id}` : "idea-title"}
                        className="block text-sm font-medium text-slate-700"
                    >
                        Title
                    </label>
                    <input
                        id={idea ? `idea-title-${idea.id}` : "idea-title"}
                        name="title"
                        type="text"
                        required
                        defaultValue={idea?.title || ""}
                        {...travelInputProps()}
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    />
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

            <div>
                <label
                    htmlFor={idea ? `idea-address-${idea.id}` : "idea-address"}
                    className="block text-sm font-medium text-slate-700"
                >
                    Address / place
                </label>
                <input
                    id={idea ? `idea-address-${idea.id}` : "idea-address"}
                    ref={addressInputRef}
                    name="address"
                    type="text"
                    value={address}
                    onChange={(event) => {
                        setAddress(event.target.value);
                        setFormattedAddress("");
                        setGooglePlaceId("");
                        setLocationCity("");
                        setLocationLat("");
                        setLocationLng("");
                    }}
                    placeholder="Search Google Places"
                    {...travelInputProps()}
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                />
                {locationCity && (
                    <p className="mt-1 text-xs font-medium text-emerald-700">
                        Validated for {locationCity}
                    </p>
                )}
            </div>

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
                        htmlFor={idea ? `idea-opens-${idea.id}` : "idea-opens"}
                        className="block text-sm font-medium text-slate-700"
                    >
                        Optional opening time
                    </label>
                    <input
                        id={idea ? `idea-opens-${idea.id}` : "idea-opens"}
                        name="opens_at"
                        type="time"
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
                    <input
                        id={idea ? `idea-closes-${idea.id}` : "idea-closes"}
                        name="closes_at"
                        type="time"
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
                    {["Free", "Advance ticket", "Door ticket", "Any ticket"].map(
                        (option) => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => setTicketType(option)}
                                className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                                    ticketType === option
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-slate-300 text-slate-700 hover:bg-slate-50"
                                }`}
                            >
                                {option}
                            </button>
                        )
                    )}
                </div>
                <input type="hidden" name="ticket_type" value={ticketType} />
            </div>

            <div>
                <p className="text-sm font-medium text-slate-700">Age policy</p>
                <div className="mt-2 flex flex-wrap gap-2">
                    {["19+", "All ages"].map((option) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => setAgePolicy(option)}
                            className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                                agePolicy === option
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                            }`}
                        >
                            {option}
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

            <div className="flex flex-wrap justify-end gap-2">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="submit"
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                    {idea ? "Save idea" : "Add idea"}
                </button>
            </div>
        </form>
    );
}

function IdeaCard({
    idea,
    tripId,
    updateIdeaAction,
    archiveIdeaAction,
    deleteIdeaAction,
}: {
    idea: TripIdea;
    tripId: string;
    updateIdeaAction: (formData: FormData) => Promise<void>;
    archiveIdeaAction: (formData: FormData) => Promise<void>;
    deleteIdeaAction: (formData: FormData) => Promise<void>;
}) {
    const [isEditing, setIsEditing] = useState(false);

    if (isEditing) {
        return (
            <IdeaForm
                tripId={tripId}
                idea={idea}
                action={updateIdeaAction}
                onCancel={() => setIsEditing(false)}
            />
        );
    }

    return (
        <article className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {idea.category}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950">
                        {idea.title}
                    </h3>
                    {idea.description && (
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                            {idea.description}
                        </p>
                    )}
                    {(idea.location_city || idea.address || idea.formatted_address) && (
                        <p className="mt-2 text-sm font-medium text-slate-700">
                            {idea.location_city || idea.address || idea.formatted_address}
                        </p>
                    )}
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                        Edit
                    </button>
                    <form action={archiveIdeaAction}>
                        <input type="hidden" name="trip_id" value={tripId} />
                        <input type="hidden" name="idea_id" value={idea.id} />
                        <button
                            type="submit"
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                            Archive
                        </button>
                    </form>
                    <form
                        action={deleteIdeaAction}
                        onSubmit={(event) => {
                            if (!window.confirm("Delete this idea?")) {
                                event.preventDefault();
                            }
                        }}
                    >
                        <input type="hidden" name="trip_id" value={tripId} />
                        <input type="hidden" name="idea_id" value={idea.id} />
                        <button
                            type="submit"
                            className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                        >
                            Delete
                        </button>
                    </form>
                </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                {idea.tags.map((tag) => (
                    <span
                        key={tag}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700"
                    >
                        {tag}
                    </span>
                ))}
            </div>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-md bg-slate-50 p-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Days
                    </dt>
                    <dd className="mt-1 text-slate-800">
                        {formatIdeaDayLabel(idea.days_available)}
                    </dd>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Time
                    </dt>
                    <dd className="mt-1 text-slate-800">
                        {idea.is_24_hours
                            ? "24 hours"
                            : formatIdeaTimeLabel(idea.time_of_day)}
                    </dd>
                </div>
                {idea.ticket_type && (
                    <div className="rounded-md bg-slate-50 p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Tickets
                        </dt>
                        <dd className="mt-1 text-slate-800">{idea.ticket_type}</dd>
                    </div>
                )}
                {idea.age_policy && (
                    <div className="rounded-md bg-slate-50 p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Age
                        </dt>
                        <dd className="mt-1 text-slate-800">{idea.age_policy}</dd>
                    </div>
                )}
            </dl>
            {(idea.dress_code || idea.other_notes) && (
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                    {idea.dress_code && (
                        <p>
                            <span className="font-semibold text-slate-800">
                                Dress code:
                            </span>{" "}
                            {idea.dress_code}
                        </p>
                    )}
                    {idea.other_notes && (
                        <p>
                            <span className="font-semibold text-slate-800">Other:</span>{" "}
                            {idea.other_notes}
                        </p>
                    )}
                </div>
            )}
        </article>
    );
}

export default function IdeasTab({
    tripId,
    ideas,
    createIdeaAction,
    updateIdeaAction,
    archiveIdeaAction,
    deleteIdeaAction,
}: IdeasTabProps) {
    const [categoryFilter, setCategoryFilter] = useState("");
    const [timeFilter, setTimeFilter] = useState("");
    const [dayFilter, setDayFilter] = useState<DayFilter>("");
    const [tagFilter, setTagFilter] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [showFilters, setShowFilters] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const activeIdeas = ideas.filter((idea) => !idea.is_archived);
    const today = getIdeaDayForDate(new Date());
    const tomorrow = getIdeaDayForDate(addDays(new Date(), 1));
    const filteredIdeas = useMemo(() => {
        const requestedTags = parseTags(tagFilter.toLowerCase());
        const query = searchQuery.trim().toLowerCase();

        return activeIdeas.filter((idea) => {
            if (
                query &&
                ![
                    idea.title,
                    idea.description || "",
                    idea.category,
                    idea.address || "",
                    idea.formatted_address || "",
                    idea.location_city || "",
                    idea.ticket_type || "",
                    idea.age_policy || "",
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
                if (dayFilter === "Today" && !idea.days_available.includes(today)) {
                    return false;
                }
                if (
                    dayFilter === "Tomorrow" &&
                    !idea.days_available.includes(tomorrow)
                ) {
                    return false;
                }
                if (
                    dayFilter === "Weekdays" &&
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
                    !idea.days_available.some((day) =>
                        ["Saturday", "Sunday"].includes(day)
                    )
                ) {
                    return false;
                }
                if (
                    IDEA_DAYS.includes(dayFilter as IdeaDay) &&
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
    }, [
        activeIdeas,
        categoryFilter,
        dayFilter,
        searchQuery,
        tagFilter,
        timeFilter,
        today,
        tomorrow,
    ]);

    return (
        <section className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold text-slate-900">Ideas</h2>
                    <p className="mt-1 text-sm text-slate-500">
                        Browse loose possibilities for free time, rainy days, late
                        nights, and plans that are still taking shape.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsAddModalOpen(true)}
                    className="w-fit rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                    Add activity idea
                </button>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <label className="relative min-w-0 flex-1">
                        <span className="sr-only">Search ideas</span>
                        <Search
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                            aria-hidden="true"
                        />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search activities, tags, categories, or notes"
                            {...travelInputProps()}
                            className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-slate-900"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={() => setShowFilters((isVisible) => !isVisible)}
                        aria-expanded={showFilters}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                        Filters
                    </button>
                </div>
            </div>

            {showFilters && (
                <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="grid gap-3 md:grid-cols-4">
                    <label className="block text-sm font-medium text-slate-700">
                        Category
                        <select
                            value={categoryFilter}
                            onChange={(event) => setCategoryFilter(event.target.value)}
                            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                        >
                            <option value="">All categories</option>
                            {IDEA_CATEGORIES.map((category) => (
                                <option key={category} value={category}>
                                    {category}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                        Day
                        <select
                            value={dayFilter}
                            onChange={(event) =>
                                setDayFilter(event.target.value as DayFilter)
                            }
                            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
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
                    <label className="block text-sm font-medium text-slate-700">
                        Time
                        <select
                            value={timeFilter}
                            onChange={(event) => setTimeFilter(event.target.value)}
                            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                        >
                            <option value="">All times</option>
                            {IDEA_TIME_OF_DAY_OPTIONS.map((time) => (
                                <option key={time} value={time}>
                                    {time}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                        Tags
                        <input
                            type="text"
                            value={tagFilter}
                            onChange={(event) => setTagFilter(event.target.value)}
                            placeholder="cheap, rainy day"
                            {...travelInputProps()}
                            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                        />
                    </label>
                    </div>
                </div>
            )}

            {isAddModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6"
                    onClick={() => setIsAddModalOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="add-idea-title"
                        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md bg-white shadow-xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
                            <div>
                                <h2
                                    id="add-idea-title"
                                    className="text-xl font-semibold text-slate-900"
                                >
                                    Add activity idea
                                </h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    Capture something you might want to do later.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                className="rounded-md border border-slate-300 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                                aria-label="Close add idea modal"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                        <div className="p-5">
                            <IdeaForm
                                tripId={tripId}
                                action={createIdeaAction}
                                onCancel={() => setIsAddModalOpen(false)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {activeIdeas.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center">
                    <h3 className="text-lg font-medium text-slate-900">
                        No ideas yet
                    </h3>
                    <p className="mt-2 text-sm text-slate-500">
                        Add a restaurant, museum, park walk, bar, or anything you might
                        want to remember.
                    </p>
                </div>
            ) : filteredIdeas.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center">
                    <h3 className="text-lg font-medium text-slate-900">
                        No ideas match these filters
                    </h3>
                    <p className="mt-2 text-sm text-slate-500">
                        Try loosening the category, day, time, or tag filters.
                    </p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {filteredIdeas.map((idea) => (
                        <IdeaCard
                            key={idea.id}
                            idea={idea}
                            tripId={tripId}
                            updateIdeaAction={updateIdeaAction}
                            archiveIdeaAction={archiveIdeaAction}
                            deleteIdeaAction={deleteIdeaAction}
                        />
                    ))}
                </div>
            )}

            <p className="text-xs text-slate-500">
                Today is {today}. Filter snapshots use your computer date:{" "}
                {getLocalDateKey(new Date())}.
            </p>
        </section>
    );
}
