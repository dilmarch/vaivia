"use client";

import { useState } from "react";
import { getAirlineIconUrl, getAirlineNameFromCode } from "@/lib/airlineIcons";

type AirlineIconProps = {
    flightNumber?: string | null;
    airlineCode?: string | null;
    airlineName?: string | null;
    compact?: boolean;
    className?: string;
};

export function AirlineIcon({
    flightNumber,
    airlineCode,
    airlineName,
    compact = false,
    className = "",
}: AirlineIconProps) {
    const [failed, setFailed] = useState(false);
    const iconUrl = getAirlineIconUrl(flightNumber, airlineCode);
    const fallback =
        airlineCode?.slice(0, 2).toUpperCase() ||
        flightNumber?.trim().slice(0, 2).toUpperCase() ||
        "✈";
    const label =
        airlineName ||
        getAirlineNameFromCode(airlineCode) ||
        airlineCode ||
        "Airline";

    if (!iconUrl || failed) {
        return (
            <span
                aria-hidden="true"
                className={`inline-flex shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600 ${
                    compact ? "h-8 w-8" : "h-10 w-10"
                } ${className}`}
            >
                {fallback}
            </span>
        );
    }

    return (
        <span
            className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white ${
                compact ? "h-8 w-8" : "h-10 w-10"
            } ${className}`}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={iconUrl}
                alt={`${label} icon`}
                className="h-5 w-5 object-contain"
                onError={() => setFailed(true)}
            />
        </span>
    );
}
