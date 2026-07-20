"use client";

import { ExternalLink, Lock, MapPin, X } from "lucide-react";
import AnimatedModal from "@/components/AnimatedModal";
import { getAccommodationMapsUrl } from "@/lib/accommodations";
import { formatCurrency } from "@/lib/budget";
import { addVaiviaUtmAttribution } from "@/lib/outboundLinks";

export type AccommodationDetailRecord = {
    id: string;
    hotel_name: string;
    accommodation_type?: string | null;
    status?: string | null;
    address?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    check_in_date: string;
    check_out_date: string;
    check_in_time_start?: string | null;
    check_in_time_end?: string | null;
    check_out_time?: string | null;
    free_cancellation_ends_on?: string | null;
    website?: string | null;
    booking_url?: string | null;
    google_maps_url?: string | null;
    google_place_id?: string | null;
    cost?: number | null;
    currency?: string | null;
    notes?: string | null;
    is_private?: boolean | null;
};

function formatDate(value?: string | null) {
    if (!value) return "Not set";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(date);
}

function formatTime(value?: string | null) {
    if (!value) return "";
    const [hours, minutes] = value.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);

    return new Intl.DateTimeFormat("en", {
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function formatLabel(value?: string | null) {
    if (!value) return "";
    const words = value.replaceAll("_", " ").trim();
    return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : "";
}

function getAccommodationLocation(accommodation: AccommodationDetailRecord) {
    return (
        accommodation.address ||
        [accommodation.city, accommodation.region, accommodation.country]
            .filter(Boolean)
            .join(", ") ||
        ""
    );
}

function DetailCard({
    label,
    value,
    detail,
}: {
    label: string;
    value: string;
    detail?: string;
}) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/80">
                {label}
            </p>
            <p className="mt-1 text-lg font-black text-white">{value}</p>
            {detail ? (
                <p className="mt-1 text-sm font-semibold text-slate-300">
                    {detail}
                </p>
            ) : null}
        </div>
    );
}

export function AccommodationDetailsModal({
    accommodation,
    onClose,
}: {
    accommodation: AccommodationDetailRecord;
    onClose: () => void;
}) {
    const location = getAccommodationLocation(accommodation);
    const mapsUrl = getAccommodationMapsUrl(accommodation);
    const checkInTimes = [
        formatTime(accommodation.check_in_time_start),
        formatTime(accommodation.check_in_time_end),
    ].filter(Boolean);

    return (
        <AnimatedModal
            onClose={onClose}
            panelClassName="max-w-2xl"
            labelledBy="accommodation-details-title"
            presentation
        >
            {({ requestClose }) => (
                <>
                    <div className="vaivia-modal-header flex items-start justify-between gap-4">
                        <div>
                            <p className="vaivia-modal-eyebrow">Stay details</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <h2
                                    id="accommodation-details-title"
                                    className="vaivia-modal-title !mt-0"
                                >
                                    {accommodation.hotel_name}
                                </h2>
                                {accommodation.is_private ? (
                                    <span className="vaivia-private-tag inline-flex items-center gap-1 rounded-full border border-white/15 bg-slate-950/80 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-lime-200">
                                        <Lock
                                            className="h-3.5 w-3.5"
                                            aria-hidden="true"
                                        />
                                        Private
                                    </span>
                                ) : null}
                            </div>
                            <p className="mt-2 text-sm font-bold text-slate-300">
                                {[formatLabel(accommodation.status), formatLabel(accommodation.accommodation_type)]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="vaivia-modal-close"
                            aria-label="Close stay details"
                        >
                            <X className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </div>

                    <div className="vaivia-modal-body space-y-5">
                        {location ? (
                            <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm font-semibold text-slate-200">
                                <MapPin
                                    className="mt-0.5 h-4 w-4 shrink-0 text-lime-200"
                                    aria-hidden="true"
                                />
                                <span>{location}</span>
                            </div>
                        ) : null}

                        <div className="grid gap-3 sm:grid-cols-2">
                            <DetailCard
                                label="Check-in"
                                value={formatDate(accommodation.check_in_date)}
                                detail={
                                    checkInTimes.length > 0
                                        ? checkInTimes.join(" – ")
                                        : undefined
                                }
                            />
                            <DetailCard
                                label="Check-out"
                                value={formatDate(accommodation.check_out_date)}
                                detail={
                                    formatTime(accommodation.check_out_time) ||
                                    undefined
                                }
                            />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            {accommodation.cost ? (
                                <DetailCard
                                    label="Price"
                                    value={formatCurrency(
                                        Number(accommodation.cost),
                                        accommodation.currency || "CAD"
                                    )}
                                />
                            ) : null}
                            {accommodation.free_cancellation_ends_on ? (
                                <DetailCard
                                    label="Free cancellation ends"
                                    value={formatDate(
                                        accommodation.free_cancellation_ends_on
                                    )}
                                />
                            ) : null}
                        </div>

                        {accommodation.notes ? (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                                <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/80">
                                    Notes
                                </p>
                                <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-slate-200">
                                    {accommodation.notes}
                                </p>
                            </div>
                        ) : null}
                    </div>

                    <div className="vaivia-modal-footer flex flex-wrap justify-end gap-2">
                        {accommodation.website ? (
                            <a
                                href={addVaiviaUtmAttribution(accommodation.website)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="vaivia-modal-button-secondary"
                            >
                                Website
                                <ExternalLink
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                />
                            </a>
                        ) : null}
                        {accommodation.booking_url ? (
                            <a
                                href={addVaiviaUtmAttribution(accommodation.booking_url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="vaivia-modal-button-secondary"
                            >
                                Booking link
                                <ExternalLink
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                />
                            </a>
                        ) : null}
                        {mapsUrl ? (
                            <a
                                href={mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="vaivia-modal-button-primary"
                            >
                                Location
                                <MapPin className="h-4 w-4" aria-hidden="true" />
                            </a>
                        ) : null}
                    </div>
                </>
            )}
        </AnimatedModal>
    );
}
