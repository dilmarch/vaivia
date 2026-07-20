"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import {
    CalendarPlus,
    ExternalLink,
    Hotel,
    Landmark,
    Lightbulb,
    MapPin,
    Plus,
    Pencil,
    Route,
    TrainFront,
    Utensils,
    X,
} from "lucide-react";
import {
    type ReactNode,
    useEffect,
    useMemo,
    useRef,
    useState,
    useTransition,
} from "react";
import { hasMappableCoordinatePair } from "@/lib/mapCoordinates";
import AnimatedModal from "@/components/AnimatedModal";
import {
    AccommodationCreateModal,
    AccommodationEditModal,
} from "@/components/accommodations/AccommodationManager";
import CostAllocationFields from "@/components/budget/CostAllocationFields";
import TripAudienceSelector from "@/components/TripAudienceSelector";
import { TimeInput } from "@/components/ui/time-input";
import {
    ACCOMMODATION_STATUS_OPTIONS,
    type AccommodationActionResult,
    type TripAccommodation,
} from "@/lib/accommodations";
import { COMMON_CURRENCIES, formatCurrency } from "@/lib/budget";
import { addVaiviaUtmAttribution } from "@/lib/outboundLinks";
import type { TripAudienceOption } from "@/lib/tripAudience";

export type AccommodationAreaMapPlaceType =
    "accommodation" | "scheduled" | "idea";

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
    recordId?: string | null;
    checkInDate?: string | null;
    checkOutDate?: string | null;
    bookingUrl?: string | null;
    cost?: number | null;
    currency?: string | null;
    isPlanningOption?: boolean;
    accommodation?: TripAccommodation;
};

export type AccommodationAreaMapCity = {
    id: string;
    name: string;
    countryName?: string | null;
    iconEmoji?: string | null;
    places: AccommodationAreaMapPlace[];
};

type NearbyPlaceCategory = "attraction" | "food";

type NearbyMapPlace = {
    id: string;
    category: NearbyPlaceCategory;
    name: string;
    address?: string | null;
    latitude: number;
    longitude: number;
    googleMapsUrl: string;
};

const nearbyPlaceConfig: Record<
    NearbyPlaceCategory,
    { label: string; markerLabel: string; color: string }
> = {
    attraction: {
        label: "Popular attraction",
        markerLabel: "P",
        color: "#facc15",
    },
    food: {
        label: "Place to eat",
        markerLabel: "E",
        color: "#fb7185",
    },
};

const excludedLodgingTypes = new Set([
    "bed_and_breakfast",
    "guest_house",
    "hostel",
    "hotel",
    "lodging",
    "motel",
    "resort_hotel",
]);

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
        featureType: "poi",
        elementType: "labels",
        stylers: [{ visibility: "off" }],
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
        featureType: "transit.station",
        elementType: "labels",
        stylers: [{ visibility: "off" }],
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

function getMapStyles(showTransit: boolean): google.maps.MapTypeStyle[] {
    if (!showTransit) return mapStyles;

    return [
        ...mapStyles,
        {
            featureType: "transit.station",
            elementType: "labels",
            stylers: [{ visibility: "on" }],
        },
    ];
}

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

function getNearbyActivities(
    stay: AccommodationAreaMapPlace,
    plans: AccommodationAreaMapPlace[]
) {
    return plans
        .map((place) => ({
            place,
            distanceKm: getDistanceInKilometers(stay, place),
        }))
        .filter(({ distanceKm }) => distanceKm <= 1)
        .sort((a, b) => a.distanceKm - b.distanceKm);
}

function getNightCount(checkInDate?: string | null, checkOutDate?: string | null) {
    if (!checkInDate || !checkOutDate) return null;
    const checkIn = Date.parse(`${checkInDate}T00:00:00Z`);
    const checkOut = Date.parse(`${checkOutDate}T00:00:00Z`);
    if (!Number.isFinite(checkIn) || !Number.isFinite(checkOut) || checkOut <= checkIn) {
        return null;
    }
    return Math.round((checkOut - checkIn) / 86_400_000);
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

function createMapInfoWindowContent({
    title,
    typeLabel,
    address,
    googleMapsUrl,
}: {
    title: string;
    typeLabel: string;
    address?: string | null;
    googleMapsUrl?: string | null;
}) {
    const content = document.createElement("div");
    content.dataset.vaiviaMapPopover = "true";
    content.className = "vaivia-map-popover";

    const category = document.createElement("span");
    category.textContent = typeLabel;
    category.className = "vaivia-map-popover__eyebrow";
    content.appendChild(category);

    const heading = document.createElement("strong");
    heading.textContent = title;
    heading.className = "vaivia-map-popover__title";
    content.appendChild(heading);

    if (address) {
        const addressLine = document.createElement("span");
        addressLine.textContent = address;
        addressLine.className = "vaivia-map-popover__address";
        content.appendChild(addressLine);
    }

    if (googleMapsUrl) {
        const link = document.createElement("a");
        link.href = googleMapsUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open in Google Maps";
        link.dataset.vaiviaMapButton = "true";
        link.className = "vaivia-map-popover__button";

        const arrow = document.createElement("span");
        arrow.textContent = "↗";
        arrow.setAttribute("aria-hidden", "true");
        link.appendChild(arrow);
        content.appendChild(link);
    }

    return content;
}

function getNearbySearchArea(places: AccommodationAreaMapPlace[]) {
    const bounds = new window.google.maps.LatLngBounds();
    places.forEach((place) =>
        bounds.extend({ lat: place.latitude, lng: place.longitude })
    );
    const center = bounds.getCenter();
    const centerPoint = {
        latitude: center.lat(),
        longitude: center.lng(),
    };
    const farthestPlaceKm = Math.max(
        0,
        ...places.map((place) =>
            getDistanceInKilometers(centerPoint, place)
        )
    );

    return {
        location: center,
        radius: Math.min(50_000, Math.max(1_500, farthestPlaceKm * 1_250)),
    };
}

function toNearbyMapPlace(
    place: google.maps.places.PlaceResult,
    category: NearbyPlaceCategory
): NearbyMapPlace | null {
    const location = place.geometry?.location;
    const placeId = place.place_id?.trim();
    const name = place.name?.trim();
    const placeTypes = place.types || [];
    const expectedType =
        category === "attraction" ? "tourist_attraction" : "restaurant";

    if (
        !location ||
        !placeId ||
        !name ||
        !placeTypes.includes(expectedType) ||
        placeTypes.some((type) => excludedLodgingTypes.has(type))
    ) {
        return null;
    }

    return {
        id: placeId,
        category,
        name,
        address: place.vicinity || null,
        latitude: location.lat(),
        longitude: location.lng(),
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`,
    };
}

function MapFilterButton({
    active,
    children,
    onClick,
}: {
    active: boolean;
    children: ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] shadow-lg shadow-black/25 backdrop-blur-md transition sm:text-xs ${
                active
                    ? "border-lime-200/60 bg-lime-300 text-slate-950"
                    : "border-white/15 bg-slate-950/90 text-slate-200 hover:border-lime-300/40 hover:text-white"
            }`}
        >
            {children}
        </button>
    );
}

function CityMap({
    city,
    isGoogleReady,
}: {
    city: AccommodationAreaMapCity;
    isGoogleReady: boolean;
}) {
    const mapRef = useRef<HTMLDivElement | null>(null);
    const mapInstanceRef = useRef<google.maps.Map | null>(null);
    const markersRef = useRef<google.maps.Marker[]>([]);
    const nearbyMarkersRef = useRef<google.maps.Marker[]>([]);
    const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
    const transitLayerRef = useRef<google.maps.TransitLayer | null>(null);
    const [showTransit, setShowTransit] = useState(true);
    const [showAttractions, setShowAttractions] = useState(true);
    const [showFood, setShowFood] = useState(true);
    const [nearbyPlaces, setNearbyPlaces] = useState<
        Record<NearbyPlaceCategory, NearbyMapPlace[]>
    >({ attraction: [], food: [] });
    const markerPlaces = useMemo(
        () =>
            city.places.filter(
                (place) =>
                    hasMappableCoordinatePair(place.latitude, place.longitude)
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
            clickableIcons: false,
            styles: getMapStyles(true),
        });
        mapInstanceRef.current = map;
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
                    createMapInfoWindowContent({
                        title: place.title,
                        typeLabel: getTypeLabel(place.type),
                        address: place.address,
                        googleMapsUrl: getMapFallbackUrl(place),
                    })
                );
                infoWindow.open({ map, anchor: marker });
            });

            markersRef.current.push(marker);
        });

        const fitTripPlaces = () => {
            if (markerPlaces.length === 1) {
                map.setCenter({
                    lat: firstPlace.latitude,
                    lng: firstPlace.longitude,
                });
                map.setZoom(16);
                return;
            }

            map.fitBounds(bounds, {
                top: 72,
                right: 24,
                bottom: 24,
                left: 24,
            });
        };
        fitTripPlaces();

        const resizeObserver =
            typeof ResizeObserver !== "undefined"
                ? new ResizeObserver(() => fitTripPlaces())
                : null;
        resizeObserver?.observe(mapRef.current);

        return () => {
            resizeObserver?.disconnect();
            transitLayerRef.current?.setMap(null);
            transitLayerRef.current = null;
            mapInstanceRef.current = null;
            markersRef.current.forEach((marker) => marker.setMap(null));
            markersRef.current = [];
            nearbyMarkersRef.current.forEach((marker) => marker.setMap(null));
            nearbyMarkersRef.current = [];
            infoWindowRef.current?.close();
        };
    }, [isGoogleReady, markerPlaces]);

    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!isGoogleReady || !map || !window.google?.maps) return;

        map.setOptions({ styles: getMapStyles(showTransit) });
        const transitLayer =
            transitLayerRef.current || new window.google.maps.TransitLayer();
        transitLayerRef.current = transitLayer;
        transitLayer.setMap(showTransit ? map : null);
    }, [isGoogleReady, markerPlaces, showTransit]);

    useEffect(() => {
        const map = mapInstanceRef.current;
        if (
            !isGoogleReady ||
            !map ||
            !window.google?.maps?.places?.PlacesService ||
            markerPlaces.length === 0
        ) {
            return;
        }

        let isActive = true;
        setNearbyPlaces({ attraction: [], food: [] });
        const service = new window.google.maps.places.PlacesService(map);
        const searchArea = getNearbySearchArea(markerPlaces);
        const searches: Array<{
            category: NearbyPlaceCategory;
            type: string;
        }> = [
            { category: "attraction", type: "tourist_attraction" },
            { category: "food", type: "restaurant" },
        ];

        searches.forEach(({ category, type }) => {
            service.nearbySearch(
                { ...searchArea, type },
                (results, status) => {
                    if (
                        !isActive ||
                        status !==
                            window.google.maps.places.PlacesServiceStatus.OK ||
                        !results
                    ) {
                        return;
                    }

                    const places = results
                        .map((place) => toNearbyMapPlace(place, category))
                        .filter(
                            (place): place is NearbyMapPlace => place !== null
                        )
                        .slice(0, 12);
                    setNearbyPlaces((current) => ({
                        ...current,
                        [category]: places,
                    }));
                }
            );
        });

        return () => {
            isActive = false;
        };
    }, [isGoogleReady, markerPlaces]);

    useEffect(() => {
        const map = mapInstanceRef.current;
        const infoWindow = infoWindowRef.current;
        if (!isGoogleReady || !map || !infoWindow || !window.google?.maps) {
            return;
        }

        nearbyMarkersRef.current.forEach((marker) => marker.setMap(null));
        nearbyMarkersRef.current = [];
        const visiblePlaces = [
            ...(showAttractions ? nearbyPlaces.attraction : []),
            ...(showFood ? nearbyPlaces.food : []),
        ];

        visiblePlaces.forEach((place) => {
            const config = nearbyPlaceConfig[place.category];
            const marker = new window.google.maps.Marker({
                map,
                position: { lat: place.latitude, lng: place.longitude },
                title: place.name,
                zIndex: 1,
                label: {
                    text: config.markerLabel,
                    color: "#020617",
                    fontWeight: "900",
                },
                icon: {
                    path: window.google.maps.SymbolPath.CIRCLE,
                    fillColor: config.color,
                    fillOpacity: 0.95,
                    strokeColor: "#f8fafc",
                    strokeOpacity: 0.9,
                    strokeWeight: 1.5,
                    scale: 9,
                },
            });

            marker.addListener("click", () => {
                infoWindow.setContent(
                    createMapInfoWindowContent({
                        title: place.name,
                        typeLabel: config.label,
                        address: place.address,
                        googleMapsUrl: place.googleMapsUrl,
                    })
                );
                infoWindow.open({ map, anchor: marker });
            });

            nearbyMarkersRef.current.push(marker);
        });

        return () => {
            nearbyMarkersRef.current.forEach((marker) => marker.setMap(null));
            nearbyMarkersRef.current = [];
        };
    }, [isGoogleReady, nearbyPlaces, showAttractions, showFood]);

    if (markerPlaces.length === 0) {
        return (
            <div className="flex min-h-72 items-center justify-center rounded-[1.35rem] border border-white/10 bg-slate-950/70 p-6 text-center text-sm font-semibold leading-6 text-slate-400">
                Add a validated stay, scheduled activity, or idea in this city
                to see it on the map.
            </div>
        );
    }

    return (
        <div className="relative min-h-72 overflow-hidden rounded-[1.35rem] border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/25">
            <div
                ref={mapRef}
                role="region"
                className="vaivia-accommodation-map absolute inset-0"
                aria-label={`${city.name} stays and activities map`}
            />
            <div
                className="absolute left-3 right-3 top-3 z-10 flex gap-2 overflow-x-auto pb-1"
                aria-label="Map filters"
            >
                <MapFilterButton
                    active={showTransit}
                    onClick={() => setShowTransit((current) => !current)}
                >
                    <TrainFront className="h-3.5 w-3.5" aria-hidden="true" />
                    Metro &amp; transit
                </MapFilterButton>
                <MapFilterButton
                    active={showAttractions}
                    onClick={() => setShowAttractions((current) => !current)}
                >
                    <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
                    Popular attractions
                </MapFilterButton>
                <MapFilterButton
                    active={showFood}
                    onClick={() => setShowFood((current) => !current)}
                >
                    <Utensils className="h-3.5 w-3.5" aria-hidden="true" />
                    Places to eat
                </MapFilterButton>
            </div>
        </div>
    );
}

function NearbyActivitySummary({
    activities,
}: {
    activities: ReturnType<typeof getNearbyActivities>;
}) {
    const count = activities.length;
    return (
        <span className="group/nearby relative mt-2 inline-flex text-xs font-black text-lime-200">
            <button
                type="button"
                className="underline decoration-lime-300/40 underline-offset-4 focus:outline-none focus:ring-2 focus:ring-lime-300/50"
                aria-label={`Within 1 kilometre of ${count} ${count === 1 ? "activity" : "activities"}. Show names.`}
            >
                Within 1 km of {count} {count === 1 ? "activity" : "activities"}
            </button>
            {count > 0 ? (
                <span
                    role="tooltip"
                    className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-0 z-30 w-64 rounded-2xl border border-lime-300/20 bg-slate-950 p-3 text-left text-xs font-semibold leading-5 text-slate-200 opacity-0 shadow-2xl shadow-black/50 transition group-hover/nearby:opacity-100 group-focus-within/nearby:opacity-100"
                >
                    {activities.map(({ place, distanceKm }) => (
                        <span key={place.id} className="block py-0.5">
                            {place.title} · {formatDistance(distanceKm)}
                        </span>
                    ))}
                </span>
            ) : null}
        </span>
    );
}

function CityDistanceList({
    city,
    onPromote,
    onEdit,
}: {
    city: AccommodationAreaMapCity;
    onPromote: (stay: AccommodationAreaMapPlace) => void;
    onEdit: (stay: AccommodationAreaMapPlace) => void;
}) {
    const plans = city.places.filter((place) => place.type !== "accommodation");
    const stays = city.places.filter((place) => place.type === "accommodation");
    const plannedStays = stays.filter((stay) => !stay.isPlanningOption);
    const stayOptions = stays
        .filter((stay) => stay.isPlanningOption)
        .map((stay) => ({ stay, activities: getNearbyActivities(stay, plans) }))
        .sort((a, b) => b.activities.length - a.activities.length);

    const renderTripStay = (stay: AccommodationAreaMapPlace) => (
        <a
            key={stay.id}
            href={getMapFallbackUrl(stay)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/60 p-3 text-sm font-semibold text-slate-200 transition hover:border-lime-300/35 hover:text-white"
        >
            <span className="min-w-0">
                <span className="block truncate font-black text-white">{stay.title}</span>
                {stay.dateLabel ? (
                    <span className="mt-1 block text-xs text-slate-400">{stay.dateLabel}</span>
                ) : null}
                <NearbyActivitySummary activities={getNearbyActivities(stay, plans)} />
            </span>
            <ExternalLink className="h-4 w-4 shrink-0 text-lime-200" aria-hidden="true" />
        </a>
    );

    return (
        <div className="space-y-4">
            <section className="rounded-[1.15rem] border border-emerald-300/20 bg-emerald-300/10 p-3">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">
                    Planned accommodations
                </p>
                <div className="mt-2 space-y-2">
                    {plannedStays.length > 0 ? (
                        plannedStays.map(renderTripStay)
                    ) : (
                        <p className="text-xs font-semibold leading-5 text-slate-400">
                            No planned stay with a mapped location in this city yet.
                        </p>
                    )}
                </div>
            </section>

            <section className="rounded-[1.15rem] border border-lime-300/20 bg-lime-300/10 p-3">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-lime-200">
                    Stay ideas to compare
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">
                    Ranked by how many mapped activities and ideas are within 1 km.
                </p>
                <div className="mt-3 space-y-3">
                    {stayOptions.length > 0 ? (
                        stayOptions.map(({ stay, activities }, index) => {
                            const nights = getNightCount(stay.checkInDate, stay.checkOutDate);
                            return (
                                <article
                                    key={stay.id}
                                    className="rounded-2xl border border-white/10 bg-slate-950/70 p-4"
                                >
                                    <div className="flex items-start gap-3">
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime-300 text-xs font-black text-slate-950">
                                            {index + 1}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <h4 className="truncate text-sm font-black text-white">
                                                {stay.title}
                                            </h4>
                                            <NearbyActivitySummary activities={activities} />
                                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                                <span className="rounded-xl border border-white/10 bg-white/[0.05] p-2 font-semibold text-slate-300">
                                                    {stay.dateLabel || "Dates not set"}
                                                </span>
                                                <span className="rounded-xl border border-white/10 bg-white/[0.05] p-2 font-semibold text-slate-300">
                                                    {nights === null
                                                        ? "Nights not set"
                                                        : `${nights} ${nights === 1 ? "night" : "nights"}`}
                                                </span>
                                            </div>
                                            <p className="mt-3 text-base font-black text-white">
                                                {stay.cost
                                                    ? formatCurrency(stay.cost, stay.currency || "CAD")
                                                    : "Price not added"}
                                            </p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {stay.bookingUrl ? (
                                                    <a
                                                        href={addVaiviaUtmAttribution(
                                                            stay.bookingUrl
                                                        )}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-2 text-xs font-black text-white transition hover:border-lime-300/35 hover:bg-white/[0.12]"
                                                    >
                                                        Book Stay
                                                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                                    </a>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    onClick={() => onEdit(stay)}
                                                    disabled={!stay.accommodation}
                                                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-2 text-xs font-black text-white transition hover:border-lime-300/35 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                                    Edit stay idea
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onPromote(stay)}
                                                    className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-lime-200"
                                                >
                                                    <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                                                    Add to itinerary
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            );
                        })
                    ) : (
                        <p className="text-xs font-semibold leading-5 text-slate-400">
                            Add a stay option to start comparing locations.
                        </p>
                    )}
                </div>
            </section>
        </div>
    );
}

function PromoteStayOptionModal({
    tripId,
    stay,
    action,
    audienceOptions,
    currentUserTripMemberId,
    onComplete,
    onClose,
}: {
    tripId: string;
    stay: AccommodationAreaMapPlace;
    action: (formData: FormData) => Promise<AccommodationActionResult>;
    audienceOptions: TripAudienceOption[];
    currentUserTripMemberId?: string | null;
    onComplete: () => void;
    onClose: () => void;
}) {
    const [error, setError] = useState<string | null>(null);
    const [costAmount, setCostAmount] = useState(
        stay.cost === null || stay.cost === undefined ? "" : String(stay.cost)
    );
    const [isSaving, startSaving] = useTransition();

    return (
        <AnimatedModal
            onClose={onClose}
            panelClassName="max-w-xl"
            labelledBy="promote-stay-option-title"
            presentation
        >
            {({ requestClose }) => (
                <>
                    <div className="vaivia-modal-header flex items-start justify-between gap-4">
                        <div>
                            <p className="vaivia-modal-eyebrow">Compare Stays</p>
                            <h2 id="promote-stay-option-title" className="vaivia-modal-title">
                                Add {stay.title} to the trip
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="vaivia-modal-close"
                            aria-label="Close add stay to trip modal"
                        >
                            <X className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </div>
                    <form
                        className="space-y-5 bg-[#080511] p-6 text-white"
                        onSubmit={(event) => {
                            event.preventDefault();
                            setError(null);
                            const formData = new FormData(event.currentTarget);
                            startSaving(() => {
                                void action(formData)
                                    .then((result) => {
                                        if (!result.ok) {
                                            setError(result.error);
                                            return;
                                        }
                                        onComplete();
                                    })
                                    .catch(() =>
                                        setError("Could not add this stay to the trip.")
                                    );
                            });
                        }}
                    >
                        <input type="hidden" name="trip_id" value={tripId} />
                        <input
                            type="hidden"
                            name="accommodation_id"
                            value={stay.recordId || ""}
                        />
                        {error ? (
                            <p className="rounded-2xl border border-red-300/35 bg-red-950/80 p-4 text-sm font-semibold text-red-50">
                                {error}
                            </p>
                        ) : null}
                        <div className="grid gap-4 sm:grid-cols-3">
                            <label className="space-y-2">
                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/80">
                                    Check-in starts
                                </span>
                                <TimeInput name="check_in_time_start" />
                            </label>
                            <label className="space-y-2">
                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/80">
                                    Check-in ends
                                </span>
                                <TimeInput
                                    name="check_in_time_end"
                                    onBlur={(event) => {
                                        if (
                                            event.currentTarget.value === "00:00" ||
                                            event.currentTarget.value === "00:00:00"
                                        ) {
                                            event.currentTarget.value = "23:59";
                                        }
                                    }}
                                />
                            </label>
                            <label className="space-y-2">
                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/80">
                                    Check-out time
                                </span>
                                <TimeInput name="check_out_time" />
                            </label>
                            <p className="text-xs font-bold text-slate-400 sm:col-span-3">
                                Times are interpreted in the stay location&apos;s time
                                zone and adjust when you switch itinerary time zones.
                            </p>
                        </div>
                        <label className="block space-y-2">
                            <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/80">
                                Status
                            </span>
                            <select
                                name="status"
                                defaultValue="tentative"
                                className="w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-semibold text-white outline-none [color-scheme:dark] focus:border-lime-300/50"
                            >
                                {ACCOMMODATION_STATUS_OPTIONS.map((option) => (
                                    <option
                                        key={option.value}
                                        value={option.value}
                                        className="bg-slate-950 text-white"
                                    >
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                            <label className="space-y-2">
                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/80">
                                    Confirm price
                                </span>
                                <input
                                    type="number"
                                    name="cost"
                                    min="0"
                                    step="0.01"
                                    value={costAmount}
                                    onChange={(event) => setCostAmount(event.target.value)}
                                    placeholder="0.00"
                                    className="w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-semibold text-white outline-none focus:border-lime-300/50"
                                />
                            </label>
                            <label className="space-y-2">
                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/80">
                                    Currency
                                </span>
                                <select
                                    name="currency"
                                    defaultValue={stay.currency || "CAD"}
                                    className="w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-semibold text-white outline-none [color-scheme:dark] focus:border-lime-300/50"
                                >
                                    {COMMON_CURRENCIES.map((currency) => (
                                        <option
                                            key={currency}
                                            value={currency}
                                            className="bg-slate-950 text-white"
                                        >
                                            {currency}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <TripAudienceSelector
                            options={audienceOptions}
                            currentUserTripMemberId={currentUserTripMemberId}
                            initialAudienceMode="everyone"
                            heading="Guests"
                            description="Confirm who this stay is being planned for."
                            alwaysShowOptions
                        />
                        {costAmount ? (
                            <CostAllocationFields
                                amount={costAmount}
                                participants={audienceOptions}
                                currentUserTripMemberId={currentUserTripMemberId}
                                tone="dark"
                            />
                        ) : null}
                        <div className="flex justify-end gap-3 border-t border-white/10 pt-5">
                            <button
                                type="button"
                                onClick={requestClose}
                                className="rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-white"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving || !stay.recordId}
                                className="rounded-full bg-lime-300 px-5 py-2 text-sm font-black text-slate-950 disabled:opacity-50"
                            >
                                {isSaving ? "Adding..." : "Add to itinerary"}
                            </button>
                        </div>
                    </form>
                </>
            )}
        </AnimatedModal>
    );
}

export default function AccommodationAreaMaps({
    cities,
    tripId,
    createAction,
    updateAction,
    promoteAction,
    audienceOptions = [],
    currentUserTripMemberId = null,
}: {
    cities: AccommodationAreaMapCity[];
    tripId: string;
    createAction: (formData: FormData) => Promise<AccommodationActionResult>;
    updateAction: (formData: FormData) => Promise<AccommodationActionResult>;
    promoteAction: (formData: FormData) => Promise<AccommodationActionResult>;
    audienceOptions?: TripAudienceOption[];
    currentUserTripMemberId?: string | null;
}) {
    const router = useRouter();
    const [isGoogleReady, setIsGoogleReady] = useState(
        typeof window !== "undefined" && Boolean(window.google?.maps)
    );
    const [showAddOption, setShowAddOption] = useState(false);
    const [promotionTarget, setPromotionTarget] =
        useState<AccommodationAreaMapPlace | null>(null);
    const [editTarget, setEditTarget] =
        useState<AccommodationAreaMapPlace | null>(null);
    const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const mappableCities = useMemo(
        () =>
            cities
                .map((city) => ({
                    ...city,
                    places: city.places.filter((place) =>
                        hasMappableCoordinatePair(
                            place.latitude,
                            place.longitude
                        )
                    ),
                }))
                .filter((city) => city.places.length > 0),
        [cities]
    );

    return (
        <>
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

            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 bg-[radial-gradient(circle_at_85%_0%,rgba(255,54,190,0.18),transparent_26%),linear-gradient(120deg,rgba(124,60,255,0.12),transparent_42%)] p-5 sm:p-6">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.35em] text-lime-200/80">
                        Compare Stays
                    </p>
                    <h2 className="mt-2 text-3xl font-black text-white">
                        Find the best base for your plans
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
                        Compare planned stays and stay ideas with scheduled
                        activities and saved ideas, grouped by city. Distances
                        are straight-line planning estimates, not travel times.
                        Transit detail appears where Google has coverage.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setShowAddOption(true)}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 py-2.5 text-xs font-black uppercase tracking-[0.13em] text-white transition hover:border-lime-300/35 hover:bg-white/[0.12]"
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Add stay option
                    </button>
                </div>
            </div>

            {!googleMapsApiKey ? (
                <div className="p-5 sm:p-6">
                    <div className="rounded-[1.35rem] border border-amber-300/25 bg-amber-300/10 p-4 text-sm font-semibold leading-6 text-amber-50">
                        Google Maps is not configured for this environment.
                    </div>
                </div>
            ) : null}

            <div className="space-y-6 p-5 sm:p-6">
                {mappableCities.length === 0 ? (
                    <div className="rounded-[1.35rem] border border-dashed border-white/15 bg-white/[0.04] p-8 text-center">
                        <MapPin
                            className="mx-auto h-8 w-8 text-lime-200"
                            aria-hidden="true"
                        />
                        <h3 className="mt-3 text-lg font-black text-white">
                            No mapped places yet
                        </h3>
                        <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-400">
                            Add a stay, scheduled activity, or idea with a
                            Google Maps location to start comparing areas.
                        </p>
                    </div>
                ) : (
                    mappableCities.map((city) => (
                        <article
                            key={city.id}
                            className="rounded-[1.65rem] border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-black/20"
                        >
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-lime-300/25 bg-slate-950/75 text-xl text-lime-200 shadow-[0_0_20px_rgba(var(--vaivia-neon-rgb),0.12)]">
                                        {city.iconEmoji || (
                                            <MapPin
                                                className="h-5 w-5"
                                                aria-hidden="true"
                                            />
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
                                    {(
                                        [
                                            "accommodation",
                                            "scheduled",
                                            "idea",
                                        ] as const
                                    ).map((type) => {
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
                                                    style={{
                                                        backgroundColor:
                                                            config.color,
                                                    }}
                                                />
                                                {count} {getTypeLabel(type)}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
                                <CityMap
                                    city={city}
                                    isGoogleReady={isGoogleReady}
                                />
                                <CityDistanceList
                                    city={city}
                                    onPromote={setPromotionTarget}
                                    onEdit={setEditTarget}
                                />
                            </div>
                        </article>
                    ))
                )}
            </div>
            </section>
            {showAddOption ? (
                <AccommodationCreateModal
                    tripId={tripId}
                    createAction={createAction}
                    variant="planning"
                    onClose={() => setShowAddOption(false)}
                />
            ) : null}
            {promotionTarget ? (
                <PromoteStayOptionModal
                    tripId={tripId}
                    stay={promotionTarget}
                    action={promoteAction}
                    audienceOptions={audienceOptions}
                    currentUserTripMemberId={currentUserTripMemberId}
                    onComplete={() => {
                        setPromotionTarget(null);
                        router.refresh();
                    }}
                    onClose={() => setPromotionTarget(null)}
                />
            ) : null}
            {editTarget?.accommodation ? (
                <AccommodationEditModal
                    tripId={tripId}
                    accommodation={editTarget.accommodation}
                    updateAction={updateAction}
                    variant="planning"
                    onClose={() => setEditTarget(null)}
                />
            ) : null}
        </>
    );
}
