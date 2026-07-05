"use client";

import Script from "next/script";
import { ImagePlus, RotateCcw, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
    getLocalTripCoverImageKey,
    useTripCoverImage,
    type TripCoverTrip,
} from "@/components/TripCoverImage";

type TripHeaderCoverProps = {
    trip: TripCoverTrip;
    updateCoverAction: (formData: FormData) => Promise<void>;
    children?: ReactNode;
};

export default function TripHeaderCover({
    trip,
    updateCoverAction,
    children,
}: TripHeaderCoverProps) {
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [imageUrlError, setImageUrlError] = useState("");
    const [coverLoadError, setCoverLoadError] = useState("");
    const coverImageUrl = useTripCoverImage(trip, isGoogleReady);

    function isSupportedImageUrl(url: string) {
        return /\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i.test(url.trim());
    }

    return (
        <>
            <Script
                src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
                strategy="afterInteractive"
                onLoad={() => setIsGoogleReady(true)}
                onReady={() => setIsGoogleReady(true)}
            />

            {coverImageUrl && (
                <div className="relative overflow-hidden rounded-t-2xl">
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
                        className="absolute bottom-4 right-4 inline-flex h-10 items-center gap-2 rounded-md bg-white/95 px-3 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-white"
                    >
                        <ImagePlus className="h-4 w-4" aria-hidden="true" />
                        Edit photo
                    </button>
                </div>
            )}

            {!coverImageUrl && (
                <div className="relative flex min-h-72 items-end overflow-hidden rounded-t-2xl bg-slate-900 p-6 sm:p-8">
                    {children}
                    <button
                        type="button"
                        onClick={() => setIsModalOpen(true)}
                        className="absolute bottom-4 right-4 inline-flex h-10 items-center gap-2 rounded-md bg-white/95 px-3 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-white"
                    >
                        <ImagePlus className="h-4 w-4" aria-hidden="true" />
                        Edit photo
                    </button>
                </div>
            )}

            {isModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6"
                    onClick={() => setIsModalOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="trip-photo-title"
                        className="w-full max-w-md rounded-md bg-white shadow-xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-slate-200 p-5">
                            <h2
                                id="trip-photo-title"
                                className="text-lg font-semibold text-slate-950"
                            >
                                Edit trip photo
                            </h2>
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-700 transition hover:bg-slate-100"
                                aria-label="Close edit photo"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>

                        <form
                            action={updateCoverAction}
                            className="space-y-4 p-5"
                            onSubmit={(event) => {
                                const submitter = event.nativeEvent.submitter as
                                    | HTMLButtonElement
                                    | null;
                                const localCoverKey = getLocalTripCoverImageKey(trip.id);

                                if (submitter?.name === "reset_to_default") {
                                    localStorage.removeItem(localCoverKey);
                                    window.dispatchEvent(
                                        new Event("vaivia-trip-cover-updated")
                                    );
                                    setImageUrlError("");
                                    return;
                                }

                                const formData = new FormData(event.currentTarget);
                                const nextImageUrl = String(
                                    formData.get("trip_cover_image_url") || ""
                                );

                                if (nextImageUrl && !isSupportedImageUrl(nextImageUrl)) {
                                    event.preventDefault();
                                    setImageUrlError(
                                        "Please enter a direct image URL ending in .jpg, .jpeg, .png, .webp, .gif, .avif, or .svg."
                                    );
                                    return;
                                }

                                if (nextImageUrl) {
                                    localStorage.setItem(localCoverKey, nextImageUrl);
                                } else {
                                    localStorage.removeItem(localCoverKey);
                                }
                                window.dispatchEvent(
                                    new Event("vaivia-trip-cover-updated")
                                );
                                setImageUrlError("");
                            }}
                        >
                            <input type="hidden" name="trip_id" value={trip.id} />
                            <label
                                htmlFor="tripCoverImageUrl"
                                className="block text-sm font-medium text-slate-700"
                            >
                                Custom image URL
                            </label>
                            <input
                                id="tripCoverImageUrl"
                                name="trip_cover_image_url"
                                type="url"
                                defaultValue={trip.trip_cover_image_url || ""}
                                placeholder="https://example.com/photo.jpg"
                                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                aria-describedby={
                                    imageUrlError ? "tripCoverImageUrlError" : undefined
                                }
                            />
                            {imageUrlError && (
                                <p
                                    id="tripCoverImageUrlError"
                                    className="text-sm text-red-700"
                                >
                                    {imageUrlError}
                                </p>
                            )}
                            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                                <button
                                    type="submit"
                                    name="reset_to_default"
                                    value="true"
                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                                >
                                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                    Reset to default
                                </button>
                                <button
                                    type="submit"
                                    className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700"
                                >
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
