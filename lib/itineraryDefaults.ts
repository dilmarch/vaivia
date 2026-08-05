import { isItineraryDateKey } from "@/lib/itineraryViewState";

type DefaultItineraryDateOptions = {
    tripStartDate?: string | null;
    tripEndDate?: string | null;
    requestedDate?: string | null;
    todayKey: string;
};

export function getDefaultItineraryDateKey({
    tripStartDate,
    tripEndDate,
    requestedDate,
    todayKey,
}: DefaultItineraryDateOptions) {
    if (isItineraryDateKey(requestedDate)) return requestedDate;
    if (!tripStartDate) return todayKey;
    if (todayKey < tripStartDate) return tripStartDate;
    if (tripEndDate && todayKey > tripEndDate) return tripEndDate;
    return todayKey;
}
