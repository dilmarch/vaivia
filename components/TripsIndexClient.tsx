"use client";

import Script from "next/script";
import { AlertTriangle, Archive, Info, Pencil, Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import AnimatedModal from "@/components/AnimatedModal";
import ShareTripModal from "@/components/ShareTripModal";
import TripDestinationPicker from "@/components/TripDestinationPicker";
import { DateRangeInputs } from "@/components/ui/date-range-inputs";
import {
    DashboardTripCard,
    TripQuickInfoPanel,
    type DashboardTrip,
} from "@/components/TripDashboardClient";
import {
    TripsIndexPresentation,
    type TripFilter,
} from "@/components/trips/TripsIndexPresentation";
import { sanitizeTripSlugInput, slugifyTripTitle } from "@/lib/tripRoutes";

type TripsIndexClientProps = {
    trips: DashboardTrip[];
    currentUserId?: string | null;
    updateTripAction: (formData: FormData) => Promise<void>;
    deleteTripAction: (formData: FormData) => Promise<void>;
    initialFilter?: TripFilter;
};

function travelInputProps() {
    return {
        autoComplete: "off",
        "data-form-type": "other",
        "data-lpignore": "true",
        "data-1p-ignore": "true",
    };
}

function getTripLabel(trip: DashboardTrip) {
    return trip.title?.trim() || "Untitled trip";
}

function getTripActionClusterPosition(index: number) {
    return index % 3 === 1 ? "bottom-9 left-14" : "bottom-10 right-5";
}

export default function TripsIndexClient({
    trips,
    currentUserId,
    updateTripAction,
    deleteTripAction,
    initialFilter = "upcoming",
}: TripsIndexClientProps) {
    const formRef = useRef<HTMLFormElement | null>(null);
    const [filter, setFilter] = useState<TripFilter>(initialFilter);
    const [selectedTrip, setSelectedTrip] = useState<DashboardTrip | null>(null);
    const [shareTrip, setShareTrip] = useState<DashboardTrip | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showCloseWarning, setShowCloseWarning] = useState(false);
    const [showDeleteWarning, setShowDeleteWarning] = useState(false);
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [summaryTripId, setSummaryTripId] = useState<string | null>(null);
    useEffect(() => {
        if (!summaryTripId) return;

        function closeOnOutsideClick(event: MouseEvent) {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (target.closest("[data-trip-card-shell]")) return;
            setSummaryTripId(null);
        }

        document.addEventListener("mousedown", closeOnOutsideClick);

        return () => {
            document.removeEventListener("mousedown", closeOnOutsideClick);
        };
    }, [summaryTripId]);

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

    return (
        <>
            <Script
                src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
                strategy="afterInteractive"
                onLoad={() => setIsGoogleReady(true)}
                onReady={() => setIsGoogleReady(true)}
            />

            <TripsIndexPresentation
                trips={trips}
                filter={filter}
                onFilterChange={setFilter}
                renderTrip={(trip, index) => (
                    <DashboardTripCard
                        trip={trip}
                        index={index}
                        isGoogleReady={isGoogleReady}
                        currentUserId={currentUserId}
                        disableHoverTransform
                    />
                )}
                renderCardActions={(trip, index) => (
                    <div
                        className={`absolute z-30 flex items-center gap-2 ${getTripActionClusterPosition(
                            index
                        )}`}
                    >
                        <button
                            type="button"
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                openEditModal(trip);
                            }}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/65 text-white shadow-xl shadow-black/30 backdrop-blur transition hover:-translate-y-0.5 hover:border-lime-300/50 hover:bg-lime-300 hover:text-slate-950"
                            aria-label={`Edit ${getTripLabel(trip)}`}
                        >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setSummaryTripId((current) =>
                                    current === trip.id ? null : trip.id
                                );
                            }}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/65 text-white shadow-xl shadow-black/30 backdrop-blur transition hover:-translate-y-0.5 hover:border-lime-300/50 hover:bg-lime-300 hover:text-slate-950"
                            aria-label={`Show quick info for ${getTripLabel(trip)}`}
                            aria-pressed={summaryTripId === trip.id}
                        >
                            <Info className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setShareTrip(trip);
                            }}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/65 text-white shadow-xl shadow-black/30 backdrop-blur transition hover:-translate-y-0.5 hover:border-lime-300/50 hover:bg-lime-300 hover:text-slate-950"
                            aria-label={`Share ${getTripLabel(trip)}`}
                        >
                            <Share2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                )}
                renderCardSupplement={(trip) =>
                    summaryTripId === trip.id ? (
                        <TripQuickInfoPanel
                            trip={trip}
                            onClose={() => setSummaryTripId(null)}
                        />
                    ) : null
                }
            />

            <ShareTripModal
                tripId={shareTrip?.id || ""}
                tripTitle={shareTrip?.title}
                open={Boolean(shareTrip)}
                onOpenChange={(open) => {
                    if (!open) setShareTrip(null);
                }}
            />

            {selectedTrip ? (
                <AnimatedModal
                    onClose={closeModal}
                    onRequestClose={(close) => {
                        if (hasUnsavedChanges) {
                            setShowCloseWarning(true);
                            return;
                        }
                        close();
                    }}
                    className="z-[100]"
                    panelClassName="max-w-2xl"
                    labelledBy="trip-index-edit-title"
                >
                    {({ requestClose }) => (
                        <>
                        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-[radial-gradient(circle_at_10%_0%,rgba(var(--vaivia-neon-rgb),0.14),transparent_30%),linear-gradient(135deg,rgba(124,60,255,0.16),transparent_58%)] p-6">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.4em] text-lime-200/80">
                                    Trip settings
                                </p>
                                <h2
                                    id="trip-index-edit-title"
                                    className="mt-2 text-2xl font-black text-white"
                                >
                                    Edit trip
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    if (hasUnsavedChanges) {
                                        setShowCloseWarning(true);
                                        return;
                                    }
                                    requestClose();
                                }}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-slate-200 transition hover:bg-white/10 hover:text-white"
                                aria-label="Close edit trip"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>

                        <form
                            ref={formRef}
                            action={updateTripAction}
                            onChange={() => setHasUnsavedChanges(true)}
                            className="space-y-5 bg-white p-6 text-slate-950"
                        >
                            <input
                                type="hidden"
                                name="trip_id"
                                value={selectedTrip.id}
                            />

                            <div>
                                <label
                                    htmlFor="tripsIndexEditTitle"
                                    className="block text-sm font-bold text-slate-700"
                                >
                                    Trip title
                                </label>
                                <input
                                    id="tripsIndexEditTitle"
                                    name="title"
                                    type="text"
                                    required
                                    defaultValue={selectedTrip.title}
                                    placeholder="Berlin & Asia 2026"
                                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                    {...travelInputProps()}
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="tripsIndexEditSlug"
                                    className="block text-sm font-bold text-slate-700"
                                >
                                    Trip link
                                </label>
                                <div className="mt-2 flex rounded-xl border border-slate-300 bg-slate-50 focus-within:border-slate-500">
                                    <span className="shrink-0 rounded-l-xl border-r border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500">
                                        trips/
                                    </span>
                                    <input
                                        id="tripsIndexEditSlug"
                                        name="slug"
                                        type="text"
                                        required
                                        defaultValue={
                                            selectedTrip.slug ||
                                            slugifyTripTitle(selectedTrip.title)
                                        }
                                        onChange={(event) => {
                                            event.currentTarget.value = sanitizeTripSlugInput(
                                                event.currentTarget.value
                                            );
                                        }}
                                        className="min-w-0 flex-1 rounded-r-xl bg-white px-4 py-2 text-slate-900 outline-none"
                                        {...travelInputProps()}
                                    />
                                </div>
                                <p className="mt-2 text-xs font-semibold text-slate-500">
                                    Changing this updates the URL for everyone on this trip.
                                </p>
                            </div>

                            <TripDestinationPicker
                                inputId="tripsIndexEditDestination"
                                tripId={selectedTrip.id}
                                initialDestination={selectedTrip.destination}
                                initialCoverImageUrl={
                                    selectedTrip.cover_image_url ||
                                    selectedTrip.trip_cover_image_url
                                }
                                initialCoverImageSource={
                                    selectedTrip.cover_image_source || null
                                }
                                initialCoverImageStoragePath={
                                    selectedTrip.cover_image_storage_path || null
                                }
                                initialCoverImageUnsplashId={
                                    selectedTrip.cover_image_unsplash_id || null
                                }
                                onChange={() => setHasUnsavedChanges(true)}
                            />

                            <DateRangeInputs
                                key={selectedTrip.id}
                                startName="start_date"
                                endName="end_date"
                                startLabel="Start date"
                                endLabel="End date"
                                initialStartDate={selectedTrip.start_date}
                                initialEndDate={selectedTrip.end_date}
                                startId="tripsIndexEditStartDate"
                                endId="tripsIndexEditEndDate"
                                className="grid gap-5 md:grid-cols-2"
                                labelClassName="text-sm font-bold text-slate-700"
                                inputClassName="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                            />

                            <div>
                                <label
                                    htmlFor="tripsIndexEditNotes"
                                    className="block text-sm font-bold text-slate-700"
                                >
                                    Notes
                                </label>
                                <textarea
                                    id="tripsIndexEditNotes"
                                    name="notes"
                                    rows={4}
                                    defaultValue={selectedTrip.notes || ""}
                                    placeholder="Anything important about this trip..."
                                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                />
                            </div>

                            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-between">
                                {!selectedTrip.archived_at &&
                                (!selectedTrip.user_id ||
                                    selectedTrip.user_id === currentUserId) ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowDeleteWarning(true)}
                                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-300 px-4 text-sm font-bold text-amber-700 transition hover:bg-amber-50"
                                    >
                                        <Archive
                                            className="h-4 w-4"
                                            aria-hidden="true"
                                        />
                                        Archive
                                    </button>
                                ) : (
                                    <span />
                                )}

                                <button
                                    type="submit"
                                    className="rounded-xl bg-lime-300 px-5 py-2 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.20)] transition hover:bg-lime-200"
                                >
                                    Save
                                </button>
                            </div>
                        </form>
                        </>
                    )}
                </AnimatedModal>
            ) : null}

            {showCloseWarning && selectedTrip ? (
                <div
                    className="fixed inset-0 z-[110] flex items-center justify-center bg-[#0c0115]/70 px-4 py-6 backdrop-blur-sm"
                    onClick={() => setShowCloseWarning(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="trips-index-unsaved-title"
                        className="w-full max-w-md rounded-[24px] border border-white/10 bg-white p-5 text-slate-950 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div>
                                <h2
                                    id="trips-index-unsaved-title"
                                    className="text-lg font-black text-slate-950"
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
                                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="rounded-xl border border-red-300 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
                            >
                                Discard
                            </button>
                            <button
                                type="button"
                                onClick={() => formRef.current?.requestSubmit()}
                                className="rounded-xl bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-lime-200"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {showDeleteWarning && selectedTrip ? (
                <div
                    className="fixed inset-0 z-[110] flex items-center justify-center bg-[#0c0115]/70 px-4 py-6 backdrop-blur-sm"
                    onClick={() => setShowDeleteWarning(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="trips-index-delete-title"
                        className="w-full max-w-md rounded-[24px] border border-white/10 bg-white p-5 text-slate-950 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                <Archive className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div>
                                <h2
                                    id="trips-index-delete-title"
                                    className="text-lg font-black text-slate-950"
                                >
                                    Archive this trip?
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    This moves the trip out of your active lists and
                                    into Archive. Nothing inside the trip will be deleted.
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setShowDeleteWarning(false)}
                                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
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
                                    className="w-full rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-400 sm:w-auto"
                                >
                                    Archive trip
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
