import { getFlightAwareUrl } from "@/lib/flightAware";

type TrackFlightButtonProps = {
    flightNumber?: string | null;
    departureDate?: string | null;
    departureTime?: string | null;
    departureTimezone?: string | null;
    originAirportCode?: string | null;
    destinationAirportCode?: string | null;
    className?: string;
};

export function TrackFlightButton({
    flightNumber,
    departureDate,
    departureTime,
    departureTimezone,
    originAirportCode,
    destinationAirportCode,
    className = "",
}: TrackFlightButtonProps) {
    if (!flightNumber) return null;

    return (
        <a
            href={getFlightAwareUrl(flightNumber, {
                departureDate,
                departureTime,
                departureTimezone,
                originAirportCode,
                destinationAirportCode,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 ${className}`}
        >
            Track flight
        </a>
    );
}
