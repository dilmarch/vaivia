"use client";

import { X } from "lucide-react";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";

type TripDestinationPickerProps = {
    initialDestination?: string | null;
    initialCoverImageUrl?: string | null;
    inputId: string;
    onChange?: () => void;
};

type DestinationOption = {
    label: string;
    coverImageUrl: string;
};

function getFlagEmoji(countryCode: string) {
    if (!/^[A-Z]{2}$/.test(countryCode)) return "";

    return countryCode
        .split("")
        .map((letter) => String.fromCodePoint(letter.charCodeAt(0) + 127397))
        .join("");
}

function getCountryFlag(place: google.maps.places.PlaceResult) {
    const country = place.address_components?.find((component) =>
        component.types.includes("country")
    );

    return country?.short_name ? getFlagEmoji(country.short_name) : "";
}

function prependFlag(label: string, flag: string) {
    if (!flag || label.startsWith(flag)) return label;
    return `${flag} ${label}`;
}

function parseDestinations(destination?: string | null) {
    if (!destination) return [];

    return destination
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((label) => ({ label, coverImageUrl: "" }));
}

export default function TripDestinationPicker({
    initialDestination,
    initialCoverImageUrl,
    inputId,
    onChange,
}: TripDestinationPickerProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [destinations, setDestinations] = useState<DestinationOption[]>(() => {
        const parsedDestinations = parseDestinations(initialDestination);

        if (parsedDestinations[0] && initialCoverImageUrl) {
            parsedDestinations[0] = {
                ...parsedDestinations[0],
                coverImageUrl: initialCoverImageUrl,
            };
        }

        return parsedDestinations;
    });
    const destinationValue = useMemo(
        () => destinations.map((destination) => destination.label).join(", "),
        [destinations]
    );
    const coverImageUrl =
        destinations.length > 0
            ? destinations.find((destination) => destination.coverImageUrl)?.coverImageUrl ||
              ""
            : "";

    useEffect(() => {
        const parsedDestinations = parseDestinations(initialDestination);

        if (parsedDestinations[0] && initialCoverImageUrl) {
            parsedDestinations[0] = {
                ...parsedDestinations[0],
                coverImageUrl: initialCoverImageUrl,
            };
        }

        setDestinations(parsedDestinations);
    }, [initialCoverImageUrl, initialDestination]);

    useEffect(() => {
        if (!isGoogleReady) return;
        if (!inputRef.current) return;
        if (!window.google?.maps?.places?.Autocomplete) return;

        const autocomplete = new window.google.maps.places.Autocomplete(
            inputRef.current,
            {
                fields: [
                    "address_components",
                    "name",
                    "formatted_address",
                    "photos",
                    "types",
                ],
                types: ["(regions)"],
            }
        );

        const listener = autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            const placeTypes = place.types || [];
            const isValidRegion = placeTypes.some((type) =>
                [
                    "locality",
                    "administrative_area_level_1",
                    "administrative_area_level_2",
                    "country",
                ].includes(type)
            );

            if (!isValidRegion) {
                inputRef.current!.value = "";
                return;
            }

            const label = prependFlag(
                place.name || place.formatted_address || "",
                getCountryFlag(place)
            );
            if (!label) return;

            const coverPhotoUrl =
                place.photos?.[0]?.getUrl({
                    maxWidth: 1200,
                    maxHeight: 675,
                }) || "";

            setDestinations((currentDestinations) => {
                if (
                    currentDestinations.some(
                        (destination) =>
                            destination.label.toLowerCase() === label.toLowerCase()
                    )
                ) {
                    return currentDestinations;
                }

                return [
                    ...currentDestinations,
                    {
                        label,
                        coverImageUrl: coverPhotoUrl,
                    },
                ];
            });

            inputRef.current!.value = "";
            onChange?.();
        });

        return () => {
            listener.remove();
        };
    }, [isGoogleReady, onChange]);

    function removeDestination(label: string) {
        setDestinations((currentDestinations) =>
            currentDestinations.filter((destination) => destination.label !== label)
        );
        onChange?.();
    }

    return (
        <div>
            <Script
                src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
                strategy="afterInteractive"
                onLoad={() => setIsGoogleReady(true)}
                onReady={() => setIsGoogleReady(true)}
            />

            <input type="hidden" name="destination" value={destinationValue} />
            <input
                type="hidden"
                name="trip_cover_image_url"
                value={coverImageUrl}
            />

            <label
                htmlFor={inputId}
                className="block text-sm font-medium text-slate-700"
            >
                Destination
            </label>
            <input
                id={inputId}
                ref={inputRef}
                type="text"
                autoComplete="off"
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore="true"
                placeholder="Search city, province/state, or country..."
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
            />

            {destinations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                    {destinations.map((destination) => (
                        <span
                            key={destination.label}
                            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700"
                        >
                            {destination.label}
                            <button
                                type="button"
                                onClick={() => removeDestination(destination.label)}
                                className="text-slate-500 transition hover:text-slate-900"
                                aria-label={`Remove ${destination.label}`}
                            >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
