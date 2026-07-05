"use client";

import Script from "next/script";
import { useEffect, useMemo, useState } from "react";

type TripDestinationLineProps = {
    destination?: string | null;
    className?: string;
};

type DestinationDisplay = {
    id: string;
    flag?: string | null;
    name: string;
    secondaryLabel?: string | null;
};

type DestinationTileProps = {
    flag?: string | null;
    name: string;
    secondaryLabel?: string | null;
};

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

function getLeadingFlag(destination: string) {
    return destination.match(/^[\u{1F1E6}-\u{1F1FF}]{2}/u)?.[0] || "";
}

function stripDestinationFlag(destination: string) {
    return destination.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "");
}

function findAddressComponent(
    result: google.maps.GeocoderResult,
    type: string
) {
    return result.address_components.find((component) =>
        component.types.includes(type)
    );
}

function getDestinationDetailsFromGeocoderResult(
    fallbackName: string,
    result: google.maps.GeocoderResult
): DestinationDisplay {
    const country = findAddressComponent(result, "country");
    const locality =
        findAddressComponent(result, "locality") ||
        findAddressComponent(result, "postal_town");
    const region =
        findAddressComponent(result, "administrative_area_level_1") ||
        findAddressComponent(result, "administrative_area_level_2");
    const isCountry = result.types.includes("country");
    const name =
        locality?.long_name ||
        (!isCountry && region?.long_name) ||
        stripDestinationFlag(fallbackName);
    const secondaryLabel = isCountry
        ? null
        : country?.long_name || region?.long_name || null;

    return {
        id: fallbackName,
        flag: country?.short_name ? getFlagEmoji(country.short_name) : null,
        name,
        secondaryLabel,
    };
}

function geocodeDestinationDetails(
    geocoder: google.maps.Geocoder,
    destination: string
) {
    return new Promise<DestinationDisplay>((resolve) => {
        const cleanDestination = stripDestinationFlag(destination);
        const fallback: DestinationDisplay = {
            id: destination,
            flag: getLeadingFlag(destination) || null,
            name: cleanDestination,
            secondaryLabel: null,
        };

        geocoder.geocode(
            { address: cleanDestination },
            (results, status) => {
                if (status !== "OK" || !results?.[0]) {
                    resolve(fallback);
                    return;
                }

                const details = getDestinationDetailsFromGeocoderResult(
                    destination,
                    results[0]
                );
                resolve({
                    ...details,
                    flag: details.flag || fallback.flag,
                });
            }
        );
    });
}

export function DestinationTile({
    flag,
    name,
    secondaryLabel,
}: DestinationTileProps) {
    return (
        <div className="flex h-28 w-24 flex-col items-center justify-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:h-32 sm:w-28">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-2xl ring-1 ring-slate-200 sm:h-12 sm:w-12 sm:text-3xl">
                <span aria-hidden="true">{flag || "📍"}</span>
            </div>

            <div className="min-w-0 text-center leading-tight">
                <div className="line-clamp-2 text-sm font-semibold text-slate-900">
                    {name}
                </div>
                {secondaryLabel ? (
                    <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                        {secondaryLabel}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export default function TripDestinationLine({
    destination,
    className = "",
}: TripDestinationLineProps) {
    const destinations = useMemo(() => parseDestinationList(destination), [destination]);
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [displayDestinations, setDisplayDestinations] = useState<
        DestinationDisplay[]
    >(
        destinations.map((entry) => ({
            id: entry,
            flag: getLeadingFlag(entry) || null,
            name: stripDestinationFlag(entry),
            secondaryLabel: null,
        }))
    );

    useEffect(() => {
        setDisplayDestinations(
            destinations.map((entry) => ({
                id: entry,
                flag: getLeadingFlag(entry) || null,
                name: stripDestinationFlag(entry),
                secondaryLabel: null,
            }))
        );
    }, [destinations]);

    useEffect(() => {
        if (!isGoogleReady || destinations.length === 0) return;
        if (!window.google?.maps?.Geocoder) return;

        let isCancelled = false;
        const geocoder = new window.google.maps.Geocoder();

        async function resolveDestinationDetails() {
            const resolvedDestinations = await Promise.all(
                destinations.map((destination) =>
                    geocodeDestinationDetails(geocoder, destination)
                )
            );

            if (!isCancelled) {
                setDisplayDestinations(resolvedDestinations);
            }
        }

        void resolveDestinationDetails();

        return () => {
            isCancelled = true;
        };
    }, [destinations, isGoogleReady]);

    if (displayDestinations.length === 0) return null;

    return (
        <>
            <Script
                src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
                strategy="afterInteractive"
                onLoad={() => setIsGoogleReady(true)}
                onReady={() => setIsGoogleReady(true)}
            />
            <div className={`flex flex-wrap gap-3 sm:gap-4 ${className}`}>
                {displayDestinations.map((destination) => (
                    <DestinationTile
                        key={destination.id}
                        flag={destination.flag}
                        name={destination.name}
                        secondaryLabel={destination.secondaryLabel}
                    />
                ))}
            </div>
        </>
    );
}
