"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type PlaceAutocompleteInputProps = {
    id?: string;
    value: string;
    onInputChange: (value: string) => void;
    onPlaceSelect: (place: google.maps.places.PlaceResult) => void;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    className?: string;
};

const PLACE_FIELDS = [
    "place_id",
    "name",
    "formatted_address",
    "geometry",
    "website",
    "url",
    "types",
    "business_status",
    "opening_hours",
    "formatted_phone_number",
    "international_phone_number",
    "address_components",
    "utc_offset_minutes",
];

const PASSWORD_MANAGER_IGNORE_PROPS = {
    autoComplete: "off",
    "data-form-type": "other",
    "data-lpignore": "true",
    "data-1p-ignore": "true",
};

export default function PlaceAutocompleteInput({
    id,
    value,
    onInputChange,
    onPlaceSelect,
    placeholder,
    disabled = false,
    required = false,
    className = "",
}: PlaceAutocompleteInputProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const serviceHostRef = useRef<HTMLDivElement | null>(null);
    const onPlaceSelectRef = useRef(onPlaceSelect);
    const [isGoogleReady, setIsGoogleReady] = useState(false);

    useEffect(() => {
        onPlaceSelectRef.current = onPlaceSelect;
    }, [onPlaceSelect]);

    useEffect(() => {
        if (window.google?.maps?.places?.Autocomplete) {
            setIsGoogleReady(true);
            return;
        }

        const interval = window.setInterval(() => {
            if (window.google?.maps?.places?.Autocomplete) {
                setIsGoogleReady(true);
                window.clearInterval(interval);
            }
        }, 250);

        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!isGoogleReady) return;
        if (!inputRef.current) return;
        if (!window.google?.maps?.places?.Autocomplete) return;

        const autocomplete = new window.google.maps.places.Autocomplete(
            inputRef.current,
            { fields: PLACE_FIELDS }
        );

        const listener = autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            const placeId = place.place_id;

            if (!placeId || !serviceHostRef.current || !window.google?.maps?.places) {
                onPlaceSelectRef.current(place);
                return;
            }

            const placesService = new window.google.maps.places.PlacesService(
                serviceHostRef.current
            );

            placesService.getDetails(
                {
                    placeId,
                    fields: PLACE_FIELDS,
                },
                (details, status) => {
                    if (
                        status === window.google.maps.places.PlacesServiceStatus.OK &&
                        details
                    ) {
                        onPlaceSelectRef.current({ ...place, ...details });
                        return;
                    }

                    if (process.env.NODE_ENV === "development") {
                        console.warn("Google place details lookup failed:", {
                            placeId,
                            status,
                        });
                    }
                    onPlaceSelectRef.current(place);
                }
            );
        });

        return () => listener.remove();
    }, [isGoogleReady]);

    return (
        <>
            <Script
                id="google-maps-places"
                src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
                strategy="afterInteractive"
                onLoad={() => setIsGoogleReady(true)}
                onReady={() => setIsGoogleReady(true)}
            />
            <input
                ref={inputRef}
                id={id}
                value={value}
                onChange={(event) => onInputChange(event.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                required={required}
                className={className}
                {...PASSWORD_MANAGER_IGNORE_PROPS}
            />
            <div ref={serviceHostRef} className="hidden" aria-hidden="true" />
        </>
    );
}
