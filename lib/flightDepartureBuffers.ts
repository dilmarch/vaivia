export const FLIGHT_DEPARTURE_BUFFER_HOURS = 4;

export type FlightBufferSource = {
    id: string;
    title: string;
    item_date: string;
    start_time?: string | null;
    category?: string | null;
    transportation_mode?: string | null;
    source_table?: string | null;
    airline_code?: string | null;
    flight_number?: string | null;
    departure_location?: string | null;
    departure_timezone?: string | null;
    timezone?: string | null;
};

export type FlightDepartureBuffer<T extends FlightBufferSource = FlightBufferSource> = Omit<
    T,
    "category" | "start_time" | "transportation_mode"
> & {
    category: "flight_buffer";
    start_time: string;
    transportation_mode: null;
    end_date: string;
    end_time: string;
    status: string;
    is_flight_departure_buffer: true;
    buffer_for_item_id: string;
    notes: string;
};

function isFlight(item: FlightBufferSource) {
    return (
        item.source_table === "transportation_items" &&
        (item.transportation_mode === "airplane" ||
            Boolean(item.airline_code) ||
            Boolean(item.flight_number))
    );
}

function formatDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
}

function formatTimeKey(date: Date) {
    return date.toISOString().slice(11, 16);
}

export function buildFlightDepartureBuffers<T extends FlightBufferSource>(items: T[]) {
    return items.flatMap((item): FlightDepartureBuffer<T>[] => {
        if (!isFlight(item) || !item.item_date || !item.start_time) return [];

        const departure = new Date(`${item.item_date}T${item.start_time.slice(0, 5)}:00Z`);
        if (Number.isNaN(departure.getTime())) return [];

        const bufferStart = new Date(
            departure.getTime() - FLIGHT_DEPARTURE_BUFFER_HOURS * 60 * 60 * 1000
        );
        const flightLabel = item.title || "your flight";

        return [
            {
                ...item,
                id: `flight-buffer:${item.id}`,
                title: "Depart for airport",
                item_date: formatDateKey(bufferStart),
                end_date: item.item_date,
                start_time: formatTimeKey(bufferStart),
                end_time: item.start_time.slice(0, 5),
                category: "flight_buffer",
                transportation_mode: null,
                status: "confirmed",
                is_flight_departure_buffer: true,
                buffer_for_item_id: item.id,
                notes: `Protected travel and airport time before ${flightLabel}.`,
                timezone: item.departure_timezone || item.timezone || null,
            },
        ];
    });
}
