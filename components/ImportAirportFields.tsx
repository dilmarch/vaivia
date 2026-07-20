"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

export type ImportedAirportValue = {
    location: string;
    formattedAddress: string;
    googlePlaceId: string;
    latitude: string;
    longitude: string;
    timezone: string;
};

type ImportAirportFieldsProps = {
    itemId: string;
    departureDate: string;
    arrivalDate: string;
    departure: ImportedAirportValue;
    arrival: ImportedAirportValue;
};

type AirportSide = "departure" | "arrival";

const FIELD_CLASS_NAME =
    "mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50";

function getFieldName(itemId: string, side: AirportSide, field: string) {
    return `${itemId}:leg_0_${side}_${field}`;
}

function getAirportSearchQuery(value: string) {
    const normalized = value.trim().toUpperCase();
    const code = /^[A-Z]{3,4}$/.test(normalized)
        ? normalized
        : normalized.match(/(?:^|[^A-Z])([A-Z]{3,4})(?=$|[^A-Z])/)?.[1];
    return `${code || value.trim()} airport`;
}

function getCoordinates(place: google.maps.places.PlaceResult) {
    const latitude = place.geometry?.location?.lat();
    const longitude = place.geometry?.location?.lng();
    return typeof latitude === "number" && typeof longitude === "number"
        ? { latitude, longitude }
        : null;
}

export default function ImportAirportFields({
    itemId,
    departureDate,
    arrivalDate,
    departure,
    arrival,
}: ImportAirportFieldsProps) {
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [values, setValues] = useState({ departure, arrival });
    const departureRef = useRef<HTMLInputElement | null>(null);
    const arrivalRef = useRef<HTMLInputElement | null>(null);
    const lookedUpValuesRef = useRef(new Set<string>());

    function updateSide(
        side: AirportSide,
        update: Partial<ImportedAirportValue>
    ) {
        setValues((current) => ({
            ...current,
            [side]: { ...current[side], ...update },
        }));
    }

    async function resolveTimezone(
        side: AirportSide,
        latitude: number,
        longitude: number
    ) {
        try {
            const response = await fetch("/api/timezone", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lat: latitude,
                    lng: longitude,
                    date: side === "departure" ? departureDate : arrivalDate,
                }),
            });
            if (!response.ok) return;

            const payload = (await response.json()) as { timeZoneId?: unknown };
            if (typeof payload.timeZoneId === "string" && payload.timeZoneId.trim()) {
                updateSide(side, { timezone: payload.timeZoneId.trim() });
            }
        } catch {
            // The editable time-zone field remains available as a fallback.
        }
    }

    function applyPlace(side: AirportSide, place: google.maps.places.PlaceResult) {
        const coordinates = getCoordinates(place);
        setValues((current) => ({
            ...current,
            [side]: {
                ...current[side],
                location: place.name?.trim() || current[side].location,
                formattedAddress: place.formatted_address?.trim() || "",
                googlePlaceId: place.place_id?.trim() || "",
                latitude: coordinates ? String(coordinates.latitude) : "",
                longitude: coordinates ? String(coordinates.longitude) : "",
            },
        }));

        if (coordinates) {
            void resolveTimezone(side, coordinates.latitude, coordinates.longitude);
        }
    }

    function lookupAirport(side: AirportSide, rawValue: string) {
        const value = rawValue.trim();
        if (!value || !window.google?.maps?.places?.PlacesService) return;

        const lookupKey = `${side}:${value.toLowerCase()}`;
        if (lookedUpValuesRef.current.has(lookupKey)) return;
        lookedUpValuesRef.current.add(lookupKey);

        const service = new window.google.maps.places.PlacesService(
            document.createElement("div")
        );
        service.findPlaceFromQuery(
            {
                query: getAirportSearchQuery(value),
                fields: [
                    "name",
                    "formatted_address",
                    "geometry",
                    "place_id",
                    "types",
                ],
            },
            (results, status) => {
                if (
                    status !== window.google.maps.places.PlacesServiceStatus.OK ||
                    !results?.length
                ) {
                    return;
                }

                const airport = results.find((result) =>
                    result.types?.includes("airport")
                );
                if (!airport) return;
                applyPlace(side, airport);
            }
        );
    }

    useEffect(() => {
        if (!isGoogleReady || !window.google?.maps?.places?.Autocomplete) return;

        const listeners: google.maps.MapsEventListener[] = [];
        ([
            ["departure", departureRef.current],
            ["arrival", arrivalRef.current],
        ] as const).forEach(([side, input]) => {
            if (!input) return;
            const autocomplete = new window.google.maps.places.Autocomplete(input, {
                fields: [
                    "name",
                    "formatted_address",
                    "geometry",
                    "place_id",
                    "types",
                ],
                types: ["airport"],
            });
            listeners.push(
                autocomplete.addListener("place_changed", () => {
                    const place = autocomplete.getPlace();
                    if (place.place_id) applyPlace(side, place);
                })
            );
        });

        if (!values.departure.googlePlaceId) {
            lookupAirport("departure", values.departure.location);
        }
        if (!values.arrival.googlePlaceId) {
            lookupAirport("arrival", values.arrival.location);
        }

        return () => listeners.forEach((listener) => listener.remove());
        // Initial automatic validation runs once when the Maps library becomes ready.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGoogleReady]);

    return (
        <>
            <Script
                id="google-maps-import-airports"
                src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
                strategy="afterInteractive"
                onLoad={() => setIsGoogleReady(true)}
                onReady={() => setIsGoogleReady(true)}
            />
            {(["departure", "arrival"] as const).map((side) => {
                const value = values[side];
                const inputRef = side === "departure" ? departureRef : arrivalRef;
                const label = side === "departure" ? "Departure" : "Arrival";

                return (
                    <div key={side} className="contents">
                        <label className="block rounded-2xl border border-white/10 bg-black/20 p-3">
                            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                                {label} airport, code, or city
                                <span className="ml-1 text-lime-200">
                                    Required before adding
                                </span>
                            </span>
                            <input
                                ref={inputRef}
                                name={getFieldName(itemId, side, "location")}
                                value={value.location}
                                onChange={(event) => {
                                    lookedUpValuesRef.current.delete(
                                        `${side}:${value.location.toLowerCase()}`
                                    );
                                    updateSide(side, {
                                        location: event.target.value,
                                        formattedAddress: "",
                                        googlePlaceId: "",
                                        latitude: "",
                                        longitude: "",
                                    });
                                }}
                                onBlur={(event) =>
                                    lookupAirport(side, event.currentTarget.value)
                                }
                                required
                                autoComplete="off"
                                className={FIELD_CLASS_NAME}
                            />
                            {value.googlePlaceId ? (
                                <span className="mt-2 block text-xs font-bold text-lime-200">
                                    Google-validated airport
                                </span>
                            ) : null}
                        </label>

                        <label className="block rounded-2xl border border-white/10 bg-black/20 p-3">
                            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                                {label} time zone
                            </span>
                            <input
                                name={getFieldName(itemId, side, "timezone")}
                                value={value.timezone}
                                onChange={(event) =>
                                    updateSide(side, { timezone: event.target.value })
                                }
                                className={FIELD_CLASS_NAME}
                            />
                        </label>

                        <input
                            type="hidden"
                            name={getFieldName(itemId, side, "formatted_address")}
                            value={value.formattedAddress}
                        />
                        <input
                            type="hidden"
                            name={getFieldName(itemId, side, "google_place_id")}
                            value={value.googlePlaceId}
                        />
                        <input
                            type="hidden"
                            name={getFieldName(itemId, side, "lat")}
                            value={value.latitude}
                        />
                        <input
                            type="hidden"
                            name={getFieldName(itemId, side, "lng")}
                            value={value.longitude}
                        />
                    </div>
                );
            })}
        </>
    );
}
