export const IDEA_CATEGORIES = [
    "Food & Drink",
    "Nightlife",
    "Culture",
    "Entertainment",
    "Outdoors",
    "Shopping",
    "Sightseeing",
    "Wellness",
    "Practical",
    "Other",
] as const;

export const IDEA_DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
] as const;

export const IDEA_TIME_OF_DAY_OPTIONS = [
    "Early morning",
    "Morning",
    "Afternoon",
    "Evening",
    "Late night",
] as const;

export const IDEA_TIME_WINDOWS: Record<IdeaTimeOfDay, string> = {
    "Early morning": "5:00 AM - 8:00 AM",
    Morning: "8:00 AM - 12:00 PM",
    Afternoon: "12:00 PM - 5:00 PM",
    Evening: "5:00 PM - 10:00 PM",
    "Late night": "10:00 PM - 3:00 AM",
};

export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];
export type IdeaDay = (typeof IDEA_DAYS)[number];
export type IdeaTimeOfDay = (typeof IDEA_TIME_OF_DAY_OPTIONS)[number];

export type TripIdea = {
    id: string;
    trip_id: string;
    user_id?: string | null;
    title: string;
    description?: string | null;
    category: IdeaCategory | string;
    tags: string[];
    days_available: IdeaDay[];
    time_of_day: IdeaTimeOfDay[];
    opens_at?: string | null;
    closes_at?: string | null;
    address?: string | null;
    formatted_address?: string | null;
    google_place_id?: string | null;
    location_lat?: number | null;
    location_lng?: number | null;
    location_city?: string | null;
    is_24_hours?: boolean;
    ticket_type?: string | null;
    age_policy?: string | null;
    dress_code?: string | null;
    other_notes?: string | null;
    is_archived: boolean;
    created_at?: string | null;
    updated_at?: string | null;
};

export function normalizeStringArray(value: unknown) {
    if (Array.isArray(value)) {
        return value
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter(Boolean);
    }

    if (typeof value === "string") {
        return value
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);
    }

    return [];
}

export function normalizeTripIdea(record: Record<string, unknown>): TripIdea {
    return {
        id: String(record.id || ""),
        trip_id: String(record.trip_id || ""),
        user_id: typeof record.user_id === "string" ? record.user_id : null,
        title: String(record.title || ""),
        description:
            typeof record.description === "string" ? record.description : null,
        category:
            typeof record.category === "string" && record.category
                ? record.category
                : "Other",
        tags: normalizeStringArray(record.tags),
        days_available: normalizeStringArray(record.days_available) as IdeaDay[],
        time_of_day: normalizeStringArray(record.time_of_day) as IdeaTimeOfDay[],
        opens_at: typeof record.opens_at === "string" ? record.opens_at : null,
        closes_at: typeof record.closes_at === "string" ? record.closes_at : null,
        address: typeof record.address === "string" ? record.address : null,
        formatted_address:
            typeof record.formatted_address === "string"
                ? record.formatted_address
                : null,
        google_place_id:
            typeof record.google_place_id === "string"
                ? record.google_place_id
                : null,
        location_lat:
            typeof record.location_lat === "number" ? record.location_lat : null,
        location_lng:
            typeof record.location_lng === "number" ? record.location_lng : null,
        location_city:
            typeof record.location_city === "string" ? record.location_city : null,
        is_24_hours: Boolean(record.is_24_hours),
        ticket_type:
            typeof record.ticket_type === "string" ? record.ticket_type : null,
        age_policy:
            typeof record.age_policy === "string" ? record.age_policy : null,
        dress_code:
            typeof record.dress_code === "string" ? record.dress_code : null,
        other_notes:
            typeof record.other_notes === "string" ? record.other_notes : null,
        is_archived: Boolean(record.is_archived),
        created_at: typeof record.created_at === "string" ? record.created_at : null,
        updated_at: typeof record.updated_at === "string" ? record.updated_at : null,
    };
}

export function getIdeaDayForDate(date: Date): IdeaDay {
    const sundayFirstDays: IdeaDay[] = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    ];

    return sundayFirstDays[date.getDay()];
}

export function formatIdeaTimeLabel(times: IdeaTimeOfDay[]) {
    if (times.length === 0) return "Any time";
    return times.join(", ");
}

export function formatIdeaDayLabel(days: IdeaDay[]) {
    if (days.length === 0) return "Any day";
    if (days.length === IDEA_DAYS.length) return "Every day";

    return days.join(", ");
}
