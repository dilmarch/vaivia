export type ItineraryView = "list" | "day" | "week" | "month";

export const ITINERARY_VIEW_DATE_PARAM = "date";

export function isItineraryView(value: string | null): value is ItineraryView {
    return (
        value === "list" ||
        value === "day" ||
        value === "week" ||
        value === "month"
    );
}

export function isItineraryCalendarPath(pathname: string | null | undefined) {
    return /^\/trips\/[^/]+\/itinerary\/?$/.test(pathname || "");
}

export function isItineraryDateKey(
    value: string | null | undefined
): value is string {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return false;

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}` === value;
}

export function buildItineraryViewUrl(
    currentUrl: string,
    view: ItineraryView,
    dateKey: string
) {
    const url = new URL(currentUrl, "https://vaivia.local");
    url.searchParams.set("view", view);

    if (isItineraryDateKey(dateKey)) {
        url.searchParams.set(ITINERARY_VIEW_DATE_PARAM, dateKey);
    } else {
        url.searchParams.delete(ITINERARY_VIEW_DATE_PARAM);
    }

    return `${url.pathname}${url.search}${url.hash}`;
}
