"use client";

import Script from "next/script";
import { ExternalLink, Hotel, Lightbulb, MapPin, Route } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type AccommodationAreaMapPlaceType =
    | "accommodation"
    | "scheduled"
    | "idea";

export type AccommodationAreaMapPlace = {
    id: string;
    type: AccommodationAreaMapPlaceType;
    title: string;
    subtitle?: string | null;
    address?: string | null;
    latitude: number;
    longitude: number;
    dateLabel?: string | null;
    statusLabel?: string | null;
    googleMapsUrl?: string | null;
};

export type AccommodationAreaMapCity = {
    id: string;
    name: string;
    countryName?: string | null;
    iconEmoji?: string | null;
    places: AccommodationAreaMapPlace[];
};

const markerConfig: Record<
    AccommodationAreaMapPlaceType,
    { label: string; color: string; labelColor: string; icon: typeof Hotel }
> = {
    accommodation: {
        label: "S",
        color: "#bef264",
        labelColor: "#020617",
        icon: Hotel,
    },
    scheduled: {
        label: "A",
        color: "#f0abfc",
        labelColor: "#020617",
        icon: Route,
    },
    idea: {
        label: "I",
        color: "#7dd3fc",
        labelColor: "#020617",
        icon: Lightbulb,
    },
};

const mapStyles: google.maps.MapTypeStyle[] = [
    { elementType: "geometry", stylers: [{ color: "#101423" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#d8dee9" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#060812" }] },
    {
        featureType: "administrative",
        elementType: "geometry.stroke",
        stylers: [{ color: "#334155" }],
    },
    {
        featureType: "poi",
        elementType: "geometry",
        stylers: [{ color: "#172033" }],
    },
    {
        featureType: "poi",
        elementType: "labels.text.fill",
        stylers: [{ color: "#94a3b8" }],
    },
    {
        featureType: "road",
        elementType: "geometry",
        stylers: [{ color: "#253044" }],
    },
    {
        featureType: "road",
        elementType: "geometry.stroke",
        stylers: [{ color: "#111827" }],
    },
    {
        featureType: "road",
        elementType: "labels.text.fill",
        stylers: [{ color: "#cbd5e1" }],
    },
    {
        featureType: "transit",
        elementType: "geometry",
        stylers: [{ color: "#1f2937" }],
    },
    {
        featureType: "water",
        elementType: "geometry",
        stylers: [{ color: "#07111f" }],
    },
    {
        featureType: "water",
        elementType: "labels.text.fill",
        stylers: [{ color: "#64748b" }],
    },
];

function formatDistance(kilometers: number) {
    if (!Number.isFinite(kilometers)) return "";
    if (kilometers < 1) return `${Math.round(kilometers * 1000)} m`;
    if (kilometers < 10) return `${kilometers.toFixed(1)} km`;
    return `${Math.round(kilometers)} km`;
}

function toRadians(value: number) {
    return (value * Math.PI) / 180;
}

function getDistanceInKilometers(
    from: Pick<AccommodationAreaMapPlace, "latitude" | "longitude">,
    to: Pick<AccommodationAreaMapPlace, "latitude" | "longitude">
) {
    const earthRadiusKm = 6371;
    const deltaLat = toRadians(to.latitude - from.latitude);
    const deltaLng = toRadians(to.longitude - from.longitude);
    const fromLat = toRadians(from.latitude);
    const toLat = toRadians(to.latitude);

    const a =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(fromLat) *
            Math.cos(toLat) *
            Math.sin(deltaLng / 2) *
            Math.sin(deltaLng / 2);

    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getNearestStay(
    place: AccommodationAreaMapPlace,
    stays: AccommodationAreaMapPlace[]
) {
    if (stays.length === 0) return null;

    return stays
        .map((stay) => ({
            stay,
            distanceKm: getDistanceInKilometers(place, stay),
        }))
        .sort((a, b) => a.distanceKm - b.distanceKm)[0];
}

function getTypeLabel(type: AccommodationAreaMapPlaceType) {
    if (type === "accommodation") return "Stay";
    if (type === "scheduled") return "Scheduled";
    return "Idea";
}

function getMapFallbackUrl(place: AccommodationAreaMapPlace) {
    return (
        place.googleMapsUrl ||
        `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
    );
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function CityMap({
    city,
    isGoogleReady,
}: {
    city: AccommodationAreaMapCity;
    isGoogleReady: boolean;
}) {
    const mapRef = useRef<HTMLDivElement | null>(null);
    const markersRef = useRef<google.maps.Marker[]>([]);
    const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
    const markerPlaces = useMemo(
        () =>
            city.places.filter(
                (place) =>
                    Number.isFinite(place.latitude) &&
                    Number.isFinite(place.longitude)
            ),
        [city.places]
    );

    useEffect(() => {
        if (!isGoogleReady || !mapRef.current || !window.google?.maps) return;
        if (markerPlaces.length === 0) return;

        markersRef.current.forEach((marker) => marker.setMap(null));
        markersRef.current = [];

        const firstPlace = markerPlaces[0];
        const map = new window.google.maps.Map(mapRef.current, {
            center: { lat: firstPlace.latitude, lng: firstPlace.longitude },
            zoom: 13,
            disableDefaultUI: true,
            zoomControl: true,
            fullscreenControl: true,
            styles: mapStyles,
        });
        const bounds = new window.google.maps.LatLngBounds();
        const infoWindow = new window.google.maps.InfoWindow();
        infoWindowRef.current = infoWindow;

        markerPlaces.forEach((place) => {
            const config = markerConfig[place.type];
            const position = { lat: place.latitude, lng: place.longitude };
            bounds.extend(position);

            const marker = new window.google.maps.Marker({
                map,
                position,
                title: place.title,
                label: {
                    text: config.label,
                    color: config.labelColor,
                    fontWeight: "900",
                },
                icon: {
                    path: window.google.maps.SymbolPath.CIRCLE,
                    fillColor: config.color,
                    fillOpacity: 1,
                    strokeColor: "#f8fafc",
                    strokeOpacity: 1,
                    strokeWeight: 2,
                    scale: 12,
                },
            });

            marker.addListener("click", () => {
                infoWindow.setContent(
                    `<div style="max-width: 220px; font-family: Arial, sans-serif;"><strong>${escapeHtml(place.title)}</strong><br/><span>${escapeHtml(getTypeLabel(place.type))}</span>${place.address ? `<br/><span>${escapeHtml(place.address)}</span>` : ""}</div>`
                );
                infoWindow.open({ map, anchor: marker });
            });

            markersRef.current.push(marker);
        });

        if (markerPlaces.length > 1) {
            map.fitBounds(bounds, 48);
        }

        return () => {
            markersRef.current.forEach((marker) => marker.setMap(null));
            markersRef.current = [];
            infoWindowRef.current?.close();
        };
    }, [isGoogleReady, markerPlaces]);

    if (markerPlaces.length === 0) {
        return (
            <div className="flex min-h-72 items-center justify-center rounded-[1.35rem] border border-white/10 bg-slate-950/70 p-6 text-center text-sm font-semibold leading-6 text-slate-400">
                Add a validated stay, scheduled activity, or idea in this city to see it on the map.
            </div>
        );
    }

    return (
        <div
            ref={mapRef}
            className="min-h-72 overflow-hidden rounded-[1.35rem] border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/25"
            aria-label={`${city.name} accommodations and activities map`}
        />
    );
}

function CityDistanceList({ city }: { city: AccommodationAreaMapCity }) {
    const stays = city.places.filter((place) => place.type === "accommodation");
    const activities = city.places
        .filter((place) => place.type !== "accommodation")
        .map((place) => ({
            place,
            nearestStay: getNearestStay(place, stays),
        }))
        .sort((a, b) => {
            const aDistance = a.nearestStay?.distanceKm ?? Number.POSITIVE_INFINITY;
            const bDistance = b.nearestStay?.distanceKm ?? Number.POSITIVE_INFINITY;
            return aDistance - bDistance;
        });

    return (
        <div className="space-y-3">
            {stays.length > 0 ? (
                <div className="rounded-[1.15rem] border border-lime-300/20 bg-lime-300/10 p-3">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-lime-200">
                        Staying at
                    </p>
                    <div className="mt-2 space-y-2">
                        {stays.map((stay) => (
                            <a
                                key={stay.id}
                                href={getMapFallbackUrl(stay)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/60 p-3 text-sm font-semibold text-slate-200 transition hover:border-lime-300/35 hover:text-white"
                            >
                                <span>
                                    <span className="block font-black text-white">
                                        {stay.title}
                                    </span>
                                    {stay.address ? (
                                        <span className="mt-1 block text-xs leading-5 text-slate-400">
                                            {stay.address}
                                        </span>
                                    ) : null}
                                </span>
                                <ExternalLink
                                    className="mt-0.5 h-4 w-4 shrink-0 text-lime-200"
                                    aria-hidden="true"
                                />
                            </a>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="rounded-[1.15rem] border border-amber-300/25 bg-amber-300/10 p-3 text-sm font-semibold leading-6 text-amber-50">
                    No stay with a validated map location yet, so distances are not available for this city.
                </div>
            )}

            <div className="space-y-2">
                {activities.length > 0 ? (
                    activities.map(({ place, nearestStay }) => {
                        const config = markerConfig[place.type];
                        const Icon = config.icon;

                        return (
                            <a
                                key={place.id}
                                href={getMapFallbackUrl(place)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-3 rounded-[1.15rem] border border-white/10 bg-white/[0.05] p-3 text-left transition hover:border-lime-300/30 hover:bg-white/[0.08]"
                            >
                                <span
                                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/15 text-slate-950"
                                    style={{ backgroundColor: config.color }}
                                >
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center gap-2">
                                        <span className="truncate text-sm font-black text-white">
                                            {place.title}
                                        </span>
                                        <span className="rounded-full border border-white/10 bg-slate-950/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-300">
                                            {getTypeLabel(place.type)}
                                        </span>
                                    </span>
                                    {place.subtitle || place.dateLabel ? (
                                        <span className="mt-1 block text-xs font-semibold leading-5 text-slate-400">
                                            {[place.subtitle, place.dateLabel]
                                                .filter(Boolean)
                                                .join(" · ")}
                                        </span>
                                    ) : null}
                                    <span className="mt-1 block text-xs font-black text-lime-200">
                                        {nearestStay
                                            ? `${formatDistance(nearestStay.distanceKm)} from ${nearestStay.stay.title}`
                                            : "Add a stay to compare distance"}
                                    </span>
                                </span>
                            </a>
                        );
                    })
                ) : (
                    <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold leading-6 text-slate-400">
                        No mapped activities or ideas in this city yet.
                    </div>
                )}
            </div>
        </div>
    );
}

export default function AccommodationAreaMaps({
    cities,
}: {
    cities: AccommodationAreaMapCity[];
}) {
    const [isGoogleReady, setIsGoogleReady] = useState(
        typeof window !== "undefined" && Boolean(window.google?.maps)
    );
    const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (cities.length === 0) return null;

    return (
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/30">
            {googleMapsApiKey ? (
                <Script
                    id="google-maps-places"
                    src={`https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places`}
                    strategy="afterInteractive"
                    onLoad={() => setIsGoogleReady(true)}
                    onReady={() => setIsGoogleReady(true)}
                />
            ) : null}

            <div className="border-b border-white/10 bg-[radial-gradient(circle_at_85%_0%,rgba(255,54,190,0.18),transparent_26%),linear-gradient(120deg,rgba(124,60,255,0.12),transparent_42%)] p-5 sm:p-6">
                <p className="text-xs font-black uppercase tracking-[0.35em] text-lime-200/80">
                    Stay area maps
                </p>
                <h2 className="mt-2 text-3xl font-black text-white">
                    See what is near each stay
                </h2>
                <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
                    Compare where you are staying with scheduled activities and saved
                    ideas, grouped by city.
                </p>
            </div>

            {!googleMapsApiKey ? (
                <div className="p-5 sm:p-6">
                    <div className="rounded-[1.35rem] border border-amber-300/25 bg-amber-300/10 p-4 text-sm font-semibold leading-6 text-amber-50">
                        Google Maps is not configured for this environment.
                    </div>
                </div>
            ) : null}

            <div className="space-y-6 p-5 sm:p-6">
                {cities.map((city) => (
                    <article
                        key={city.id}
                        className="rounded-[1.65rem] border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-black/20"
                    >
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-lime-300/25 bg-slate-950/75 text-xl text-lime-200 shadow-[0_0_20px_rgba(var(--vaivia-neon-rgb),0.12)]">
                                    {city.iconEmoji || (
                                        <MapPin className="h-5 w-5" aria-hidden="true" />
                                    )}
                                </span>
                                <div>
                                    <h3 className="text-2xl font-black text-white">
                                        {city.name}
                                    </h3>
                                    {city.countryName ? (
                                        <p className="text-sm font-semibold text-slate-400">
                                            {city.countryName}
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.14em]">
                                {(["accommodation", "scheduled", "idea"] as const).map(
                                    (type) => {
                                        const count = city.places.filter(
                                            (place) => place.type === type
                                        ).length;
                                        const config = markerConfig[type];

                                        return (
                                            <span
                                                key={type}
                                                className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-slate-200"
                                            >
                                                <span
                                                    className="mr-1 inline-block h-2.5 w-2.5 rounded-full"
                                                    style={{ backgroundColor: config.color }}
                                                />
                                                {count} {getTypeLabel(type)}
                                            </span>
                                        );
                                    }
                                )}
                            </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
                            <CityMap city={city} isGoogleReady={isGoogleReady} />
                            <CityDistanceList city={city} />
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}
