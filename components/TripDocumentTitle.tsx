"use client";

import { useEffect } from "react";

type TripDocumentTitleProps = {
    title?: string | null;
    destination?: string | null;
    startDate?: string | null;
};

function parseDestinationList(destination?: string | null) {
    if (!destination) return [];

    return destination
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

function getLeadingFlag(value: string) {
    return value.match(/^[\u{1F1E6}-\u{1F1FF}]{2}/u)?.[0] || "";
}

function stripLeadingFlag(value: string) {
    return value.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "");
}

function getTripYear(startDate?: string | null) {
    if (!startDate) return new Date().getFullYear();

    const year = Number(startDate.slice(0, 4));
    return Number.isFinite(year) ? year : new Date().getFullYear();
}

function buildTripDocumentTitle({
    title,
    destination,
    startDate,
}: TripDocumentTitleProps) {
    const destinations = parseDestinationList(destination);
    const flag = destinations.map(getLeadingFlag).find(Boolean);
    const prefix = flag ? `${flag} ` : "";
    const cleanTitle = title?.trim();

    if (cleanTitle) {
        return `${prefix}${cleanTitle} – VAIVIA`;
    }

    const destinationSummary = destinations.map(stripLeadingFlag).join(", ");
    const fallbackTitle = destinationSummary
        ? `Trip ${getTripYear(startDate)}: ${destinationSummary}`
        : `Trip ${getTripYear(startDate)}`;

    return `${prefix}${fallbackTitle} – VAIVIA`;
}

export default function TripDocumentTitle({
    title,
    destination,
    startDate,
}: TripDocumentTitleProps) {
    useEffect(() => {
        document.title = buildTripDocumentTitle({ title, destination, startDate });
    }, [destination, startDate, title]);

    return null;
}
