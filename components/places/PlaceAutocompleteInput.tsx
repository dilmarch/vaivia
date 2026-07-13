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
];

const PASSWORD_MANAGER_IGNORE_PROPS = {
    autoComplete: "off",
    "data-form-type": "other",
    "data-lpignore": "true",
    "data-1p-ignore": "true",
};

const VAIVIA_GOOGLE_PLACES_STYLE_ID = "vaivia-google-places-autocomplete-style";

const VAIVIA_GOOGLE_PLACES_CSS = `
body .pac-container {
    z-index: 2147483647 !important;
    margin-top: 0.5rem !important;
    border: 1px solid rgb(190 242 100 / 0.28) !important;
    border-radius: 22px !important;
    background: linear-gradient(180deg, rgb(8 5 17 / 0.98), rgb(3 7 18 / 0.98)) !important;
    color: #fff !important;
    overflow: hidden !important;
    padding: 0.4rem !important;
    font-family: inherit !important;
    box-shadow: 0 28px 80px rgb(0 0 0 / 0.62), 0 0 34px rgba(var(--vaivia-neon-rgb), 0.16) !important;
    backdrop-filter: blur(18px) !important;
    -webkit-backdrop-filter: blur(18px) !important;
}

body .pac-container .pac-item {
    min-height: 48px !important;
    border-top: 0 !important;
    border-radius: 16px !important;
    color: rgb(203 213 225) !important;
    font-family: inherit !important;
    font-size: 0.9rem !important;
    line-height: 1.35 !important;
    margin: 0.1rem 0 !important;
    padding: 0.85rem 1rem !important;
    cursor: pointer !important;
    transition: background-color 160ms ease, color 160ms ease, transform 160ms ease !important;
}

body .pac-container .pac-item:hover,
body .pac-container .pac-item-selected {
    background: rgb(190 242 100 / 0.92) !important;
    color: rgb(2 6 23) !important;
    transform: translateY(-1px) !important;
}

body .pac-container .pac-item-query {
    color: #fff !important;
    font-weight: 800 !important;
}

body .pac-container .pac-matched {
    color: rgb(190 242 100) !important;
    font-weight: 900 !important;
}

body .pac-container .pac-item:hover .pac-item-query,
body .pac-container .pac-item-selected .pac-item-query,
body .pac-container .pac-item:hover .pac-matched,
body .pac-container .pac-item-selected .pac-matched {
    color: rgb(2 6 23) !important;
}

body .pac-container .pac-icon {
    margin-top: 0.15rem !important;
    filter: invert(1) opacity(0.75) !important;
}

body .pac-container .pac-item:hover .pac-icon,
body .pac-container .pac-item-selected .pac-icon {
    filter: invert(0) opacity(0.85) !important;
}

body .pac-container.pac-logo::after {
    margin: 0.35rem 0.7rem 0.2rem !important;
    filter: brightness(1.2) contrast(0.9) !important;
    opacity: 0.78 !important;
}
`;

function ensureVaiviaGooglePlacesStyles() {
    if (typeof document === "undefined") return;
    if (document.getElementById(VAIVIA_GOOGLE_PLACES_STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = VAIVIA_GOOGLE_PLACES_STYLE_ID;
    style.textContent = VAIVIA_GOOGLE_PLACES_CSS;
    document.head.appendChild(style);
}

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
        ensureVaiviaGooglePlacesStyles();

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
