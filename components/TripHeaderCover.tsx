"use client";

import Script from "next/script";
import { AlertTriangle, Pencil, Share2, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import ShareTripModal from "@/components/ShareTripModal";
import TripDestinationPicker from "@/components/TripDestinationPicker";
import {
    useTripCoverImage,
    type TripCoverTrip,
} from "@/components/TripCoverImage";

type TripHeaderCoverProps = {
    trip: TripCoverTrip;
    updateTripAction: (formData: FormData) => Promise<void>;
    deleteTripAction: (formData: FormData) => Promise<void>;
    children?: ReactNode;
};

export default function TripHeaderCover({
    trip,
    updateTripAction,
    deleteTripAction,
    children,
}: TripHeaderCoverProps) {
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showCloseWarning, setShowCloseWarning] = useState(false);
    const [showDeleteWarning, setShowDeleteWarning] = useState(false);
    const [coverLoadError, setCoverLoadError] = useState("");
    const formRef = useRef<HTMLFormElement>(null);
    const coverImageUrl = useTripCoverImage(trip, isGoogleReady);

    function closeModal() {
        setIsModalOpen(false);
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

    function saveAndClose() {
        formRef.current?.requestSubmit();
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

            {coverImageUrl && !coverLoadError && (
                <div className="relative overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={coverImageUrl}
                        alt=""
                        className="aspect-[16/7] w-full object-cover"
                        onLoad={() => setCoverLoadError("")}
                        onError={() =>
                            setCoverLoadError(
                                "This image could not be loaded. Try a direct .jpg, .jpeg, .png, .webp, .gif, .avif, or .svg image URL from a host that allows embedding."
                            )
                        }
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/15 to-transparent" />
                    {children && (
                        <div className="absolute bottom-6 left-6 right-24 sm:bottom-8 sm:left-8">
                            {children}
                        </div>
                    )}
                    {coverLoadError && (
                        <div className="absolute left-4 top-4 max-w-lg rounded-md bg-white/95 px-3 py-2 text-sm text-red-700 shadow-sm">
                            {coverLoadError}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => setIsModalOpen(true)}
                        className="absolute bottom-4 right-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/65 text-white shadow-xl shadow-black/30 backdrop-blur transition hover:-translate-y-0.5 hover:border-lime-300/50 hover:bg-lime-300 hover:text-slate-950"
                        aria-label="Edit trip"
                    >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsShareModalOpen(true)}
                        className="absolute bottom-4 right-[4.25rem] inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/65 text-white shadow-xl shadow-black/30 backdrop-blur transition hover:-translate-y-0.5 hover:border-lime-300/50 hover:bg-white/15"
                        aria-label="Share trip"
                    >
                        <Share2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            )}

            {(!coverImageUrl || coverLoadError) && (
                <div className="relative flex min-h-72 items-end overflow-hidden bg-slate-900 p-6 sm:p-8">
                    {children}
                    {coverLoadError && (
                        <div className="absolute left-4 top-4 max-w-lg rounded-md bg-white/95 px-3 py-2 text-sm text-red-700 shadow-sm">
                            {coverLoadError}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => setIsModalOpen(true)}
                        className="absolute bottom-4 right-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/65 text-white shadow-xl shadow-black/30 backdrop-blur transition hover:-translate-y-0.5 hover:border-lime-300/50 hover:bg-lime-300 hover:text-slate-950"
                        aria-label="Edit trip"
                    >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsShareModalOpen(true)}
                        className="absolute bottom-4 right-[4.25rem] inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/65 text-white shadow-xl shadow-black/30 backdrop-blur transition hover:-translate-y-0.5 hover:border-lime-300/50 hover:bg-white/15"
                        aria-label="Share trip"
                    >
                        <Share2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            )}

            <ShareTripModal
                tripId={trip.id}
                tripTitle={trip.title}
                open={isShareModalOpen}
                onOpenChange={setIsShareModalOpen}
            />

            {isModalOpen && (
                <div
                    className="vaivia-modal-backdrop"
                    onClick={requestCloseModal}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="trip-edit-title"
                        className="vaivia-modal-panel max-w-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="vaivia-modal-header flex items-start justify-between gap-4">
                            <div>
                                <p className="vaivia-modal-eyebrow">Trip settings</p>
                                <h2 id="trip-edit-title" className="vaivia-modal-title">
                                    Edit trip
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={requestCloseModal}
                                className="vaivia-modal-close"
                                aria-label="Close edit trip"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>

                        <form
                            ref={formRef}
                            action={updateTripAction}
                            onChange={() => setHasUnsavedChanges(true)}
                            className="vaivia-modal-body space-y-5"
                        >
                            <input type="hidden" name="trip_id" value={trip.id} />

                            <div>
                                <label
                                    htmlFor="tripHeaderEditTitle"
                                    className="block text-sm font-medium text-slate-700"
                                >
                                    Trip title
                                </label>
                                <input
                                    id="tripHeaderEditTitle"
                                    name="title"
                                    type="text"
                                    required
                                    defaultValue={trip.title}
                                    placeholder="Berlin & Asia 2026"
                                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                    autoComplete="off"
                                    data-form-type="other"
                                    data-lpignore="true"
                                    data-1p-ignore="true"
                                />
                            </div>

                            <TripDestinationPicker
                                inputId="tripHeaderEditDestination"
                                tripId={trip.id}
                                initialDestination={trip.destination || ""}
                                initialCoverImageUrl={
                                    trip.cover_image_url || trip.trip_cover_image_url
                                }
                                onChange={() => setHasUnsavedChanges(true)}
                            />

                            <div className="grid gap-5 md:grid-cols-2">
                                <div>
                                    <label
                                        htmlFor="tripHeaderEditStartDate"
                                        className="block text-sm font-medium text-slate-700"
                                    >
                                        Start date
                                    </label>
                                    <input
                                        id="tripHeaderEditStartDate"
                                        name="start_date"
                                        type="date"
                                        defaultValue={trip.start_date || ""}
                                        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                        autoComplete="off"
                                        data-form-type="other"
                                        data-lpignore="true"
                                        data-1p-ignore="true"
                                    />
                                </div>

                                <div>
                                    <label
                                        htmlFor="tripHeaderEditEndDate"
                                        className="block text-sm font-medium text-slate-700"
                                    >
                                        End date
                                    </label>
                                    <input
                                        id="tripHeaderEditEndDate"
                                        name="end_date"
                                        type="date"
                                        defaultValue={trip.end_date || ""}
                                        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                        autoComplete="off"
                                        data-form-type="other"
                                        data-lpignore="true"
                                        data-1p-ignore="true"
                                    />
                                </div>
                            </div>

                            <div>
                                <label
                                    htmlFor="tripHeaderEditNotes"
                                    className="block text-sm font-medium text-slate-700"
                                >
                                    Notes
                                </label>
                                <textarea
                                    id="tripHeaderEditNotes"
                                    name="notes"
                                    rows={4}
                                    defaultValue={trip.notes || ""}
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

            {showCloseWarning && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0c0115]/70 px-4 py-6 backdrop-blur-sm"
                    onClick={() => setShowCloseWarning(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="unsaved-trip-title"
                        className="vaivia-modal-confirm"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div>
                                <h3
                                    id="unsaved-trip-title"
                                    className="text-lg font-semibold text-slate-950"
                                >
                                    Save changes before closing?
                                </h3>
                                <p className="mt-1 text-sm text-slate-600">
                                    You have unsaved trip changes.
                                </p>
                            </div>
                        </div>
                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={discardChangesAndClose}
                                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                                Discard
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowCloseWarning(false)}
                                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                                Keep editing
                            </button>
                            <button
                                type="button"
                                onClick={saveAndClose}
                                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteWarning && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0c0115]/70 px-4 py-6 backdrop-blur-sm"
                    onClick={() => setShowDeleteWarning(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-trip-title"
                        className="vaivia-modal-confirm"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
                                <Trash2 className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div>
                                <h3
                                    id="delete-trip-title"
                                    className="text-lg font-semibold text-slate-950"
                                >
                                    Delete this trip?
                                </h3>
                                <p className="mt-1 text-sm text-slate-600">
                                    This will remove the trip and its itinerary items.
                                </p>
                            </div>
                        </div>
                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setShowDeleteWarning(false)}
                                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <form action={deleteTripAction}>
                                <input type="hidden" name="trip_id" value={trip.id} />
                                <button
                                    type="submit"
                                    className="w-full rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800 sm:w-auto"
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
