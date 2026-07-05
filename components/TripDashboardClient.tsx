"use client";

import Link from "next/link";
import Script from "next/script";
import {
    AlertTriangle,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Columns3,
    List,
    Minus,
    Pencil,
    Plus,
    Trash2,
    X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import TripDestinationPicker from "@/components/TripDestinationPicker";
import TripCoverImage from "@/components/TripCoverImage";

export type DashboardTrip = {
    id: string;
    title: string;
    destination?: string | null;
    cover_image_url?: string | null;
    trip_cover_image_url?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    notes?: string | null;
};

type TripDashboardClientProps = {
    trips: DashboardTrip[];
    updateTripAction: (formData: FormData) => Promise<void>;
    deleteTripAction: (formData: FormData) => Promise<void>;
};

type DashboardView = "trips" | "calendar";
type CalendarView = "day" | "week" | "month";

function travelInputProps() {
    return {
        autoComplete: "off",
        "data-form-type": "other",
        "data-lpignore": "true",
        "data-1p-ignore": "true",
    };
}

function parseDestinationList(destination?: string | null) {
    if (!destination) return [];

    return destination
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

function getFlagEmoji(countryCode: string) {
    if (!/^[A-Z]{2}$/.test(countryCode)) return "";

    return countryCode
        .split("")
        .map((letter) => String.fromCodePoint(letter.charCodeAt(0) + 127397))
        .join("");
}

function destinationStartsWithFlag(destination: string) {
    return /^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u.test(destination);
}

function stripDestinationFlag(destination: string) {
    return destination.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "");
}

function getCountryFlagFromGeocoderResult(result: google.maps.GeocoderResult) {
    const country = result.address_components.find((component) =>
        component.types.includes("country")
    );

    return country?.short_name ? getFlagEmoji(country.short_name) : "";
}

function geocodeDestinationFlag(
    geocoder: google.maps.Geocoder,
    destination: string
) {
    return new Promise<string>((resolve) => {
        geocoder.geocode(
            { address: stripDestinationFlag(destination) },
            (results, status) => {
                if (status !== "OK" || !results?.[0]) {
                    resolve("");
                    return;
                }

                resolve(getCountryFlagFromGeocoderResult(results[0]));
            }
        );
    });
}

function DestinationListLine({
    destination,
    isGoogleReady,
}: {
    destination?: string | null;
    isGoogleReady: boolean;
}) {
    const destinations = useMemo(() => parseDestinationList(destination), [destination]);
    const [displayDestinations, setDisplayDestinations] = useState(destinations);

    useEffect(() => {
        setDisplayDestinations(destinations);
    }, [destinations]);

    useEffect(() => {
        if (!isGoogleReady || destinations.length === 0) return;
        if (!window.google?.maps?.Geocoder) return;
        if (destinations.every(destinationStartsWithFlag)) return;

        let isCancelled = false;
        const geocoder = new window.google.maps.Geocoder();

        async function resolveDestinationFlags() {
            const flaggedDestinations = await Promise.all(
                destinations.map(async (destination) => {
                    if (destinationStartsWithFlag(destination)) return destination;

                    const flag = await geocodeDestinationFlag(geocoder, destination);
                    return flag ? `${flag} ${destination}` : destination;
                })
            );

            if (!isCancelled) {
                setDisplayDestinations(flaggedDestinations);
            }
        }

        void resolveDestinationFlags();

        return () => {
            isCancelled = true;
        };
    }, [destinations, isGoogleReady]);

    if (displayDestinations.length === 0) return null;

    return (
        <p className="mt-2 text-sm text-slate-600">
            {displayDestinations.join(", ")}
        </p>
    );
}

function parseDateKey(dateString: string) {
    return new Date(`${dateString}T00:00:00`);
}

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

function startOfWeek(date: Date) {
    return addDays(date, -date.getDay());
}

function startOfMonthGrid(date: Date) {
    return startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
}

function formatShortDate(date: Date) {
    return date.toLocaleDateString("en-CA", {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
}

function formatCalendarTitle(view: CalendarView, anchorDate: Date) {
    if (view === "day") {
        return anchorDate.toLocaleDateString("en-CA", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
        });
    }

    if (view === "week") {
        const weekStart = startOfWeek(anchorDate);
        const weekEnd = addDays(weekStart, 6);
        return `${weekStart.toLocaleDateString("en-CA", {
            month: "short",
            day: "numeric",
        })} - ${weekEnd.toLocaleDateString("en-CA", {
            month: "short",
            day: "numeric",
            year: "numeric",
        })}`;
    }

    return anchorDate.toLocaleDateString("en-CA", {
        month: "long",
        year: "numeric",
    });
}

function tripTouchesDate(trip: DashboardTrip, dateKey: string) {
    if (!trip.start_date) return false;
    const endDate = trip.end_date || trip.start_date;
    return trip.start_date <= dateKey && endDate >= dateKey;
}

function getUpcomingTrips(trips: DashboardTrip[]) {
    const todayKey = getLocalDateKey(new Date());

    return trips.filter((trip) => {
        const endDate = trip.end_date || trip.start_date;
        return endDate ? endDate >= todayKey : true;
    });
}

function TripsGrid({
    trips,
    isGoogleReady,
    onEditTrip,
}: {
    trips: DashboardTrip[];
    isGoogleReady: boolean;
    onEditTrip: (trip: DashboardTrip) => void;
}) {
    if (trips.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
                <h3 className="text-lg font-medium text-slate-900">No trips yet</h3>
                <p className="mt-2 text-sm text-slate-500">
                    Create your first VAIVIA trip to start planning.
                </p>
                <Link
                    href="/trips/new"
                    className="mt-5 inline-block rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                >
                    Create first trip
                </Link>
            </div>
        );
    }

    return (
        <div className="grid gap-4 md:grid-cols-2">
            {trips.map((trip) => {
                return (
                    <article
                        key={trip.id}
                        className="overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-slate-400 hover:shadow-sm"
                    >
                        <TripCoverImage
                            trip={trip}
                            isGoogleReady={isGoogleReady}
                            className="aspect-[16/9] w-full object-cover transition duration-200 hover:scale-[1.01]"
                        />
                        <div className="flex items-start justify-between gap-3 p-5">
                            <Link href={`/trips/${trip.id}`} className="min-w-0 flex-1">
                                <h3 className="text-lg font-semibold text-slate-900">
                                    {trip.title}
                                </h3>

                                <DestinationListLine
                                    destination={trip.destination}
                                    isGoogleReady={isGoogleReady}
                                />

                                <p className="mt-3 text-sm text-slate-500">
                                    {trip.start_date || "No start date"} -{" "}
                                    {trip.end_date || "No end date"}
                                </p>
                            </Link>

                            <button
                                type="button"
                                onClick={() => onEditTrip(trip)}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-700 transition hover:bg-slate-100"
                                aria-label={`Edit ${trip.title}`}
                            >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                    </article>
                );
            })}
        </div>
    );
}

function TripCalendar({
    trips,
}: {
    trips: DashboardTrip[];
}) {
    const [calendarView, setCalendarView] = useState<CalendarView>("month");
    const [anchorDate, setAnchorDate] = useState(new Date());
    const upcomingTrips = useMemo(() => getUpcomingTrips(trips), [trips]);

    const visibleDates = useMemo(() => {
        if (calendarView === "day") return [anchorDate];

        if (calendarView === "week") {
            const weekStart = startOfWeek(anchorDate);
            return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
        }

        const monthGridStart = startOfMonthGrid(anchorDate);
        return Array.from({ length: 42 }, (_, index) =>
            addDays(monthGridStart, index)
        );
    }, [anchorDate, calendarView]);

    function shiftBackward() {
        if (calendarView === "day") {
            setAnchorDate(addDays(anchorDate, -1));
            return;
        }

        if (calendarView === "week") {
            setAnchorDate(addDays(anchorDate, -7));
            return;
        }

        setAnchorDate(
            new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1)
        );
    }

    function shiftForward() {
        if (calendarView === "day") {
            setAnchorDate(addDays(anchorDate, 1));
            return;
        }

        if (calendarView === "week") {
            setAnchorDate(addDays(anchorDate, 7));
            return;
        }

        setAnchorDate(
            new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1)
        );
    }

    function selectDate(dateString: string) {
        if (!dateString) return;
        setAnchorDate(parseDateKey(dateString));
    }

    return (
        <div className="rounded-md border border-slate-200 bg-white">
            <div className="flex flex-col gap-4 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-slate-900">
                        Trip calendar
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                        {formatCalendarTitle(calendarView, anchorDate)}
                    </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="grid grid-cols-3 rounded-md border border-slate-300 bg-slate-50 p-1">
                        {[
                            { key: "day", label: "Day", icon: CalendarDays },
                            { key: "week", label: "Week", icon: Columns3 },
                            { key: "month", label: "Month", icon: List },
                        ].map(({ key, label, icon: Icon }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setCalendarView(key as CalendarView)}
                                className={`flex min-h-9 items-center justify-center gap-2 rounded px-3 text-sm font-medium transition ${
                                    calendarView === key
                                        ? "bg-white text-slate-950 shadow-sm"
                                        : "text-slate-600 hover:text-slate-950"
                                }`}
                            >
                                <Icon className="h-4 w-4" aria-hidden="true" />
                                {label}
                            </button>
                        ))}
                    </div>

                    <label className="flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700">
                        <span>Date</span>
                        <input
                            id="dashboardCalendarDate"
                            name="dashboardCalendarDate"
                            type="date"
                            autoComplete="off"
                            data-form-type="other"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            value={getLocalDateKey(anchorDate)}
                            onChange={(event) => selectDate(event.target.value)}
                            className="bg-transparent text-sm text-slate-900 outline-none"
                        />
                    </label>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={shiftBackward}
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-700 transition hover:bg-slate-100"
                            aria-label="Previous"
                        >
                            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setAnchorDate(new Date())}
                            className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                            TODAY
                        </button>
                        <button
                            type="button"
                            onClick={shiftForward}
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-700 transition hover:bg-slate-100"
                            aria-label="Next"
                        >
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </div>

            <div
                className={`grid ${
                    calendarView === "day" ? "grid-cols-1" : "grid-cols-7"
                } divide-x divide-slate-200 overflow-x-auto`}
            >
                {visibleDates.map((date) => {
                    const dateKey = getLocalDateKey(date);
                    const dayTrips = upcomingTrips.filter((trip) =>
                        tripTouchesDate(trip, dateKey)
                    );
                    const isCurrentMonth = date.getMonth() === anchorDate.getMonth();

                    return (
                        <div
                            key={dateKey}
                            className={`min-h-40 min-w-36 border-b border-slate-200 p-3 ${
                                calendarView === "month" && !isCurrentMonth
                                    ? "bg-slate-50 text-slate-400"
                                    : "bg-white"
                            }`}
                        >
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {formatShortDate(date)}
                            </p>
                            <div className="mt-3 space-y-2">
                                {dayTrips.map((trip) => (
                                    <Link
                                        key={trip.id}
                                        href={`/trips/${trip.id}`}
                                        className="block rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-100"
                                    >
                                        {trip.title}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function QuickAddFan({ trips }: { trips: DashboardTrip[] }) {
    const [isOpen, setIsOpen] = useState(false);
    const [showTripPicker, setShowTripPicker] = useState(false);
    const [tripPickerLabel, setTripPickerLabel] = useState(
        "Choose a trip to add this item"
    );
    const quickAddRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        function closeOnOutsideClick(event: MouseEvent) {
            if (
                quickAddRef.current &&
                !quickAddRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
                setShowTripPicker(false);
            }
        }

        document.addEventListener("mousedown", closeOnOutsideClick);
        return () => {
            document.removeEventListener("mousedown", closeOnOutsideClick);
        };
    }, [isOpen]);

    function openTripPicker(label: string) {
        setTripPickerLabel(label);
        setShowTripPicker(true);
    }

    return (
        <div
            ref={quickAddRef}
            className="fixed bottom-6 right-6 z-40 flex flex-col items-end"
        >
            {isOpen && (
                <div className="mb-3 flex flex-col items-end gap-2">
                    {showTripPicker && (
                        <div className="w-64 rounded-md border border-slate-200 bg-white p-3 shadow-lg">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {tripPickerLabel}
                            </p>
                            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                                {trips.length > 0 ? (
                                    trips.map((trip) => (
                                        <Link
                                            key={trip.id}
                                            href={`/trips/${trip.id}`}
                                            className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                                        >
                                            {trip.title}
                                        </Link>
                                    ))
                                ) : (
                                    <p className="px-3 py-2 text-sm text-slate-500">
                                        Create a trip first.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    <Link
                        href="/trips/new"
                        className="block rounded-full bg-slate-900 px-4 py-2 text-right text-sm font-medium text-white shadow-md transition hover:bg-slate-700"
                    >
                        Add trip
                    </Link>
                    <button
                        type="button"
                        onClick={() => openTripPicker("Choose a trip for transportation")}
                        className="block rounded-full border border-slate-300 bg-white px-4 py-2 text-right text-sm font-medium text-slate-800 shadow-md transition hover:bg-slate-50"
                    >
                        Add transportation
                    </button>
                    <button
                        type="button"
                        onClick={() => openTripPicker("Choose a trip for accommodation")}
                        className="block rounded-full border border-slate-300 bg-white px-4 py-2 text-right text-sm font-medium text-slate-800 shadow-md transition hover:bg-slate-50"
                    >
                        Add accommodation
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            openTripPicker("Choose a trip for food or restaurant")
                        }
                        className="block rounded-full border border-slate-300 bg-white px-4 py-2 text-right text-sm font-medium text-slate-800 shadow-md transition hover:bg-slate-50"
                    >
                        Add food or restaurant
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            openTripPicker("Choose a trip for scheduled activity/event")
                        }
                        className="block rounded-full border border-slate-300 bg-white px-4 py-2 text-right text-sm font-medium text-slate-800 shadow-md transition hover:bg-slate-50"
                    >
                        Add scheduled activity/event
                    </button>
                    <button
                        type="button"
                        onClick={() => openTripPicker("Choose a trip for activity idea")}
                        className="block rounded-full border border-slate-300 bg-white px-4 py-2 text-right text-sm font-medium text-slate-800 shadow-md transition hover:bg-slate-50"
                    >
                        Add activity idea
                    </button>
                </div>
            )}

            <button
                type="button"
                onClick={() => setIsOpen((current) => !current)}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
                aria-label={isOpen ? "Close quick add menu" : "Open quick add menu"}
                aria-expanded={isOpen}
            >
                <span
                    className={`grid place-items-center transition-transform duration-300 ${
                        isOpen ? "-rotate-180" : "rotate-0"
                    }`}
                >
                    {isOpen ? (
                        <Minus className="h-6 w-6" aria-hidden="true" />
                    ) : (
                        <Plus className="h-6 w-6" aria-hidden="true" />
                    )}
                </span>
            </button>
        </div>
    );
}

export default function TripDashboardClient({
    trips,
    updateTripAction,
    deleteTripAction,
}: TripDashboardClientProps) {
    const formRef = useRef<HTMLFormElement | null>(null);
    const [dashboardView, setDashboardView] = useState<DashboardView>("trips");
    const [selectedTrip, setSelectedTrip] = useState<DashboardTrip | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showCloseWarning, setShowCloseWarning] = useState(false);
    const [showDeleteWarning, setShowDeleteWarning] = useState(false);
    const [isGoogleReady, setIsGoogleReady] = useState(false);

    useEffect(() => {
        if (!selectedTrip) return;

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                requestCloseModal();
            }
        }

        document.addEventListener("keydown", closeOnEscape);
        return () => document.removeEventListener("keydown", closeOnEscape);
    });

    function openEditModal(trip: DashboardTrip) {
        setSelectedTrip(trip);
        setHasUnsavedChanges(false);
        setShowCloseWarning(false);
        setShowDeleteWarning(false);
    }

    function closeModal() {
        setSelectedTrip(null);
        setHasUnsavedChanges(false);
        setShowCloseWarning(false);
        setShowDeleteWarning(false);
    }

    function requestCloseModal() {
        if (hasUnsavedChanges) {
            setShowCloseWarning(true);
            return;
        }

        closeModal();
    }

    function discardChangesAndClose() {
        closeModal();
    }

    return (
        <>
            <Script
                src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
                strategy="afterInteractive"
                onLoad={() => setIsGoogleReady(true)}
                onReady={() => setIsGoogleReady(true)}
            />

            <nav className="mb-6 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4">
                {[
                    { key: "trips", label: "Trips" },
                    { key: "calendar", label: "Calendar" },
                ].map(({ key, label }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setDashboardView(key as DashboardView)}
                        className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                            dashboardView === key
                                ? "bg-slate-900 text-white"
                                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </nav>

            {dashboardView === "trips" ? (
                <TripsGrid
                    trips={trips}
                    isGoogleReady={isGoogleReady}
                    onEditTrip={openEditModal}
                />
            ) : (
                <TripCalendar trips={trips} />
            )}

            <QuickAddFan trips={trips} />

            {selectedTrip && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6"
                    onClick={requestCloseModal}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="edit-trip-title"
                        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md bg-white shadow-xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-4 border-b border-slate-200 p-5">
                            <h2
                                id="edit-trip-title"
                                className="text-xl font-semibold text-slate-900"
                            >
                                Edit trip
                            </h2>
                            <button
                                type="button"
                                onClick={requestCloseModal}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-700 transition hover:bg-slate-100"
                                aria-label="Close edit trip"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>

                        <form
                            ref={formRef}
                            action={updateTripAction}
                            onChange={() => setHasUnsavedChanges(true)}
                            className="space-y-5 p-5"
                        >
                            <input type="hidden" name="trip_id" value={selectedTrip.id} />

                            <div>
                                <label
                                    htmlFor="tripEditTitle"
                                    className="block text-sm font-medium text-slate-700"
                                >
                                    Trip title
                                </label>
                                <input
                                    id="tripEditTitle"
                                    name="title"
                                    type="text"
                                    required
                                    defaultValue={selectedTrip.title}
                                    placeholder="Berlin & Asia 2026"
                                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                    {...travelInputProps()}
                                />
                            </div>

                            <TripDestinationPicker
                                inputId="tripEditDestination"
                                initialDestination={selectedTrip.destination}
                                initialCoverImageUrl={
                                    selectedTrip.cover_image_url ||
                                    selectedTrip.trip_cover_image_url
                                }
                                onChange={() => setHasUnsavedChanges(true)}
                            />

                            <div className="grid gap-5 md:grid-cols-2">
                                <div>
                                    <label
                                        htmlFor="tripEditStartDate"
                                        className="block text-sm font-medium text-slate-700"
                                    >
                                        Start date
                                    </label>
                                    <input
                                        id="tripEditStartDate"
                                        name="start_date"
                                        type="date"
                                        defaultValue={selectedTrip.start_date || ""}
                                        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                        {...travelInputProps()}
                                    />
                                </div>

                                <div>
                                    <label
                                        htmlFor="tripEditEndDate"
                                        className="block text-sm font-medium text-slate-700"
                                    >
                                        End date
                                    </label>
                                    <input
                                        id="tripEditEndDate"
                                        name="end_date"
                                        type="date"
                                        defaultValue={selectedTrip.end_date || ""}
                                        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                        {...travelInputProps()}
                                    />
                                </div>
                            </div>

                            <div>
                                <label
                                    htmlFor="tripEditNotes"
                                    className="block text-sm font-medium text-slate-700"
                                >
                                    Notes
                                </label>
                                <textarea
                                    id="tripEditNotes"
                                    name="notes"
                                    rows={4}
                                    defaultValue={selectedTrip.notes || ""}
                                    placeholder="Anything important about this trip..."
                                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                />
                            </div>

                            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-between">
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteWarning(true)}
                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-300 px-4 text-sm font-medium text-red-700 transition hover:bg-red-50"
                                >
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    Delete
                                </button>

                                <button
                                    type="submit"
                                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                                >
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showCloseWarning && selectedTrip && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 px-4 py-6"
                    onClick={() => setShowCloseWarning(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="unsaved-trip-title"
                        className="w-full max-w-md rounded-md bg-white p-5 shadow-xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div>
                                <h2
                                    id="unsaved-trip-title"
                                    className="text-lg font-semibold text-slate-950"
                                >
                                    Save changes before leaving?
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    You have unsaved changes in this trip.
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
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteWarning && selectedTrip && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 px-4 py-6"
                    onClick={() => setShowDeleteWarning(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-trip-title"
                        className="w-full max-w-md rounded-md bg-white p-5 shadow-xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
                                <Trash2 className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div>
                                <h2
                                    id="delete-trip-title"
                                    className="text-lg font-semibold text-slate-950"
                                >
                                    Delete this trip?
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    This will delete the trip and its itinerary items. This
                                    cannot be undone.
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setShowDeleteWarning(false)}
                                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                            >
                                Cancel
                            </button>
                            <form action={deleteTripAction}>
                                <input
                                    type="hidden"
                                    name="trip_id"
                                    value={selectedTrip.id}
                                />
                                <button
                                    type="submit"
                                    className="w-full rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800 sm:w-auto"
                                >
                                    Delete trip
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
