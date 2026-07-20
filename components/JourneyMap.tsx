"use client";

import { useMemo, useState } from "react";
import type { ItineraryCalendarItem } from "@/components/ItineraryCalendar";

type RoutePoint = {
    code: string;
    label: string;
    lat: number;
    lng: number;
};

const AIRPORT_COORDINATES: Record<string, RoutePoint> = {
    YYT: {
        code: "YYT",
        label: "St. John's",
        lat: 47.6186,
        lng: -52.7519,
    },
    LGW: {
        code: "LGW",
        label: "London",
        lat: 51.1537,
        lng: -0.1821,
    },
    STN: {
        code: "STN",
        label: "London",
        lat: 51.886,
        lng: 0.2389,
    },
    BER: {
        code: "BER",
        label: "Berlin",
        lat: 52.3667,
        lng: 13.5033,
    },
};

const AIRPORT_NAME_MATCHERS: Array<[RegExp, string]> = [
    [/st\.?\s*joh?ns?.*international airport/i, "YYT"],
    [/gatwick/i, "LGW"],
    [/stansted/i, "STN"],
    [/berlin brandenburg|brandenburg airport/i, "BER"],
];

function getAirportCode(value?: string | null) {
    if (!value) return "";

    const explicitCode = value.toUpperCase().match(/\b(YYT|LGW|STN|BER)\b/)?.[1];
    if (explicitCode) return explicitCode;

    return (
        AIRPORT_NAME_MATCHERS.find(([pattern]) => pattern.test(value))?.[1] || ""
    );
}

function getRoutePoint(value?: string | null) {
    const code = getAirportCode(value);
    return code ? AIRPORT_COORDINATES[code] : null;
}

function isFlightItem(item: ItineraryCalendarItem) {
    const mode = item.transportation_mode?.toLowerCase() || "";
    return ["airplane", "flight", "plane"].includes(mode);
}

function getJourneyRoutePoints(items: ItineraryCalendarItem[]) {
    const sortedItems = [...items].sort((a, b) => {
        const dateSort = (a.item_date || "").localeCompare(b.item_date || "");
        if (dateSort !== 0) return dateSort;

        return (a.start_time || "99:99").localeCompare(b.start_time || "99:99");
    });
    const points: RoutePoint[] = [];

    sortedItems.forEach((item) => {
        if (!isFlightItem(item)) return;

        const departurePoint = getRoutePoint(item.departure_location);
        const arrivalPoint = getRoutePoint(item.arrival_location);

        [departurePoint, arrivalPoint].forEach((point) => {
            if (!point) return;

            const previousPoint = points.at(-1);
            if (previousPoint?.code === point.code) return;

            points.push(point);
        });
    });

    return points;
}

function getStaticMapUrl(points: RoutePoint[]) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return "";

    const params = new URLSearchParams({
        key: apiKey,
        size: "1200x420",
        scale: "2",
        maptype: "roadmap",
    });
    const pathCoordinates = points
        .map((point) => `${point.lat},${point.lng}`)
        .join("|");

    params.append("path", `color:0x0F172A|weight:4|${pathCoordinates}`);
    points.forEach((point, index) => {
        const label = index < 9 ? String(index + 1) : "";
        params.append(
            "markers",
            `color:0x0F172A${label ? `|label:${label}` : ""}|${point.lat},${point.lng}`
        );
    });

    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

function getRouteSummary(points: RoutePoint[]) {
    return points.map((point) => point.label).join(" → ");
}

export default function JourneyMap({
    items,
}: {
    items: ItineraryCalendarItem[];
}) {
    const [mapFailed, setMapFailed] = useState(false);
    const points = useMemo(() => getJourneyRoutePoints(items), [items]);
    const mapUrl = useMemo(() => getStaticMapUrl(points), [points]);

    if (points.length < 2) return null;

    return (
        <section className="mb-6 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3">
                <h3 className="text-lg font-semibold text-slate-950">Transport map</h3>
                <p className="mt-1 text-sm text-slate-600">
                    {getRouteSummary(points)}
                </p>
            </div>

            {mapUrl && !mapFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={mapUrl}
                    alt=""
                    className="aspect-[16/6] w-full rounded-md border border-slate-200 object-cover"
                    onError={() => setMapFailed(true)}
                />
            ) : (
                <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500">
                    Transport map preview is unavailable right now.
                </div>
            )}
        </section>
    );
}
