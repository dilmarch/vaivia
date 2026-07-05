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

export const IDEA_DAY_VALUES = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
] as const;

export const IDEA_TIME_OF_DAY_OPTIONS = [
    "Early morning",
    "Morning",
    "Afternoon",
    "Evening",
    "Late night",
] as const;

export const IDEA_TIME_OF_DAY_VALUES = [
    "early_morning",
    "morning",
    "afternoon",
    "evening",
    "late_night",
] as const;

export const IDEA_TIME_WINDOWS: Record<IdeaTimeOfDay, string> = {
    "Early morning": "5:00 AM - 8:00 AM",
    Morning: "8:00 AM - 12:00 PM",
    Afternoon: "12:00 PM - 5:00 PM",
    Evening: "5:00 PM - 10:00 PM",
    "Late night": "10:00 PM - 3:00 AM",
};

export const IDEA_TIME_EXACT_WINDOWS: Record<
    IdeaTimeOfDay,
    { opensAt: string; closesAt: string }
> = {
    "Early morning": { opensAt: "05:00", closesAt: "08:00" },
    Morning: { opensAt: "08:00", closesAt: "12:00" },
    Afternoon: { opensAt: "12:00", closesAt: "17:00" },
    Evening: { opensAt: "17:00", closesAt: "22:00" },
    "Late night": { opensAt: "22:00", closesAt: "03:00" },
};

export const IDEA_TICKET_POLICIES = [
    { value: "free", label: "Free" },
    { value: "advance_ticket", label: "Advance ticket" },
    { value: "door_ticket", label: "Door ticket" },
    { value: "any", label: "Any ticket" },
] as const;

export const IDEA_AGE_POLICIES = [
    { value: "all_ages", label: "All ages" },
    { value: "nineteen_plus", label: "19+" },
] as const;

export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];
export type IdeaDay = (typeof IDEA_DAYS)[number];
export type IdeaDayValue = (typeof IDEA_DAY_VALUES)[number];
export type IdeaTimeOfDay = (typeof IDEA_TIME_OF_DAY_OPTIONS)[number];
export type IdeaTimeOfDayValue = (typeof IDEA_TIME_OF_DAY_VALUES)[number];
export type IdeaTicketPolicy = (typeof IDEA_TICKET_POLICIES)[number]["value"];
export type IdeaAgePolicy = (typeof IDEA_AGE_POLICIES)[number]["value"];
export type IdeaReactionType = "heart" | "thumbs_up" | "thumbs_down";

export type IdeaReactionProfile = {
    user_id: string;
    avatar_url?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
};

export type IdeaReactionSummary = {
    reaction: IdeaReactionType;
    value: 2 | 1 | -1;
    count: number;
    profiles: IdeaReactionProfile[];
};

export type TripIdea = {
    id: string;
    trip_id: string;
    created_by?: string | null;
    title: string;
    description?: string | null;
    category: IdeaCategory | string;
    tags: string[];
    days_available: IdeaDay[];
    time_of_day: IdeaTimeOfDay[];
    opens_at?: string | null;
    closes_at?: string | null;
    location?: string | null;
    address?: string | null;
    formatted_address?: string | null;
    google_place_id?: string | null;
    location_lat?: number | null;
    location_lng?: number | null;
    location_city?: string | null;
    location_region?: string | null;
    location_country?: string | null;
    location_country_code?: string | null;
    location_postal_code?: string | null;
    location_website?: string | null;
    ticket_website?: string | null;
    is_24_hours?: boolean;
    ticket_policy?: IdeaTicketPolicy | string | null;
    ticket_type?: string | null;
    age_policy?: IdeaAgePolicy | string | null;
    dress_code?: string | null;
    other_notes?: string | null;
    is_archived: boolean;
    reaction_summaries?: IdeaReactionSummary[];
    current_user_reaction?: IdeaReactionType | null;
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

export function toIdeaDayValue(day: string) {
    return day.trim().toLowerCase();
}

export function toIdeaDayLabel(day: string) {
    const normalizedDay = toIdeaDayValue(day);
    const matchingDay = IDEA_DAYS.find(
        (candidate) => candidate.toLowerCase() === normalizedDay
    );

    return matchingDay || day;
}

export function toIdeaTimeOfDayValue(time: string): IdeaTimeOfDayValue {
    const normalizedValue = time.trim().toLowerCase().replace(/\s+/g, "_");

    if (
        normalizedValue === "early_morning" ||
        normalizedValue === "morning" ||
        normalizedValue === "afternoon" ||
        normalizedValue === "evening" ||
        normalizedValue === "late_night"
    ) {
        return normalizedValue;
    }

    return "evening";
}

export function toIdeaTimeOfDayLabel(time: string): IdeaTimeOfDay {
    const normalizedValue = toIdeaTimeOfDayValue(time);
    const matchingTime = IDEA_TIME_OF_DAY_OPTIONS.find(
        (candidate) => toIdeaTimeOfDayValue(candidate) === normalizedValue
    );

    return matchingTime || "Evening";
}

export function normalizeIdeaTicketPolicy(value: unknown): IdeaTicketPolicy {
    if (typeof value !== "string") return "any";

    const normalizedValue = value.trim().toLowerCase().replace(/\s+/g, "_");

    if (
        normalizedValue === "free" ||
        normalizedValue === "advance_ticket" ||
        normalizedValue === "door_ticket" ||
        normalizedValue === "any"
    ) {
        return normalizedValue;
    }

    if (normalizedValue === "any_ticket") return "any";

    return "any";
}

export function normalizeIdeaAgePolicy(value: unknown): IdeaAgePolicy {
    if (typeof value !== "string") return "all_ages";

    const normalizedValue = value.trim().toLowerCase().replace(/\s+/g, "_");

    if (normalizedValue === "nineteen_plus" || normalizedValue === "19+") {
        return "nineteen_plus";
    }

    return "all_ages";
}

export function formatIdeaTicketPolicy(value?: string | null) {
    const normalizedValue = normalizeIdeaTicketPolicy(value);
    return (
        IDEA_TICKET_POLICIES.find((option) => option.value === normalizedValue)
            ?.label || "Any ticket"
    );
}

export function formatIdeaAgePolicy(value?: string | null) {
    const normalizedValue = normalizeIdeaAgePolicy(value);
    return (
        IDEA_AGE_POLICIES.find((option) => option.value === normalizedValue)
            ?.label || "All ages"
    );
}

export function normalizeTripIdea(record: Record<string, unknown>): TripIdea {
    const rawDays =
        record.days_of_week === undefined
            ? record.days_available
            : record.days_of_week;

    return {
        id: String(record.id || ""),
        trip_id: String(record.trip_id || ""),
        created_by:
            typeof record.created_by === "string"
                ? record.created_by
                : typeof record.user_id === "string"
                  ? record.user_id
                  : null,
        title: String(record.title || ""),
        description:
            typeof record.description === "string" ? record.description : null,
        category:
            typeof record.category === "string" && record.category
                ? record.category
                : "Other",
        tags: normalizeStringArray(record.tags),
        days_available: normalizeStringArray(rawDays).map(toIdeaDayLabel) as IdeaDay[],
        time_of_day: normalizeStringArray(record.time_of_day).map(
            toIdeaTimeOfDayLabel
        ) as IdeaTimeOfDay[],
        opens_at: typeof record.opens_at === "string" ? record.opens_at : null,
        closes_at: typeof record.closes_at === "string" ? record.closes_at : null,
        location:
            typeof record.location === "string"
                ? record.location
                : typeof record.address === "string"
                  ? record.address
                  : null,
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
        location_region:
            typeof record.location_region === "string"
                ? record.location_region
                : null,
        location_country:
            typeof record.location_country === "string"
                ? record.location_country
                : null,
        location_country_code:
            typeof record.location_country_code === "string"
                ? record.location_country_code
                : null,
        location_postal_code:
            typeof record.location_postal_code === "string"
                ? record.location_postal_code
                : null,
        location_website:
            typeof record.location_website === "string"
                ? record.location_website
                : null,
        ticket_website:
            typeof record.ticket_website === "string"
                ? record.ticket_website
                : null,
        is_24_hours: Boolean(record.is_24_hours),
        ticket_policy: normalizeIdeaTicketPolicy(
            record.ticket_policy ?? record.ticket_type
        ),
        ticket_type:
            typeof record.ticket_type === "string" ? record.ticket_type : null,
        age_policy: normalizeIdeaAgePolicy(record.age_policy),
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
