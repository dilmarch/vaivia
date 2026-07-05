"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type TripCoverTrip = {
    id: string;
    title: string;
    destination?: string | null;
    cover_image_url?: string | null;
    trip_cover_image_url?: string | null;
};

function parseDestinationList(destination?: string | null) {
    if (!destination) return [];

    return destination
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

function stripFlag(destination: string) {
    return destination.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "");
}

export function getLocalTripCoverImageKey(tripId: string) {
    return `vaivia.tripCoverImage.${tripId}`;
}

export function getPersistedTripCoverImageUrl(trip: TripCoverTrip) {
    return (
        trip.cover_image_url?.trim() ||
        trip.trip_cover_image_url?.trim() ||
        ""
    );
}

export function useTripCoverImage(
    trip: TripCoverTrip,
    isGoogleReady: boolean,
    fallbackEnabled = true
) {
    const firstDestination = stripFlag(parseDestinationList(trip.destination)[0] || "");
    const [fallbackCoverImageUrl, setFallbackCoverImageUrl] = useState("");
    const persistedCoverImageUrl = getPersistedTripCoverImageUrl(trip);
    const coverImageUrl = persistedCoverImageUrl || fallbackCoverImageUrl;

    useEffect(() => {
        if (!fallbackEnabled) return;
        if (persistedCoverImageUrl) return;
        if (!firstDestination) return;
        if (!isGoogleReady) return;
        if (!window.google?.maps?.places?.PlacesService) return;

        let isMounted = true;
        const placesService = new window.google.maps.places.PlacesService(
            document.createElement("div")
        );

        placesService.findPlaceFromQuery(
            {
                query: firstDestination,
                fields: ["photos"],
            },
            (results, status) => {
                if (!isMounted) return;
                if (
                    status !== window.google.maps.places.PlacesServiceStatus.OK ||
                    !results?.[0]?.photos?.[0]
                ) {
                    return;
                }

                setFallbackCoverImageUrl(
                    results[0].photos[0].getUrl({
                        maxWidth: 1200,
                        maxHeight: 675,
                    })
                );
            }
        );

        return () => {
            isMounted = false;
        };
    }, [
        fallbackEnabled,
        firstDestination,
        isGoogleReady,
        persistedCoverImageUrl,
    ]);

    return coverImageUrl;
}

export default function TripCoverImage({
    trip,
    isGoogleReady,
    clickable = true,
    className = "aspect-[16/9] w-full object-cover",
}: {
    trip: TripCoverTrip;
    isGoogleReady: boolean;
    clickable?: boolean;
    className?: string;
}) {
    const coverImageUrl = useTripCoverImage(trip, isGoogleReady);
    const [hasImageLoadError, setHasImageLoadError] = useState(false);

    useEffect(() => {
        setHasImageLoadError(false);
    }, [coverImageUrl]);

    if (!coverImageUrl || hasImageLoadError) return null;

    const image = (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={coverImageUrl}
            alt=""
            className={className}
            onError={() => setHasImageLoadError(true)}
        />
    );

    if (!clickable) return image;

    return (
        <Link href={`/trips/${trip.id}`} aria-label={`Open ${trip.title}`}>
            {image}
        </Link>
    );
}
