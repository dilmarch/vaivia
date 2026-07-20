export const ACCOMMODATION_TYPE_OPTIONS = [
    { value: "hotel", label: "Hotel" },
    { value: "motel", label: "Motel" },
    { value: "home_rental", label: "Home Rental" },
    { value: "hostel", label: "Hostel" },
    { value: "friend_family", label: "Friend / Family" },
    { value: "other", label: "Other" },
] as const;

export const ACCOMMODATION_STATUS_OPTIONS = [
    { value: "tentative", label: "Tentative" },
    { value: "booked", label: "Booked" },
    { value: "cancelled", label: "Cancelled" },
] as const;

export type AccommodationType =
    (typeof ACCOMMODATION_TYPE_OPTIONS)[number]["value"];

export type AccommodationStatus =
    (typeof ACCOMMODATION_STATUS_OPTIONS)[number]["value"];

export type AccommodationActionResult =
    | { ok: true }
    | { ok: false; error: string };

export type TripAccommodation = {
    id: string;
    trip_id: string;
    created_by?: string | null;
    hotel_name: string;
    google_place_id?: string | null;
    google_maps_url?: string | null;
    address?: string | null;
    address_line_1?: string | null;
    address_line_2?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    postal_code?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    check_in_date: string;
    check_out_date: string;
    free_cancellation_ends_on?: string | null;
    check_in_time_start?: string | null;
    check_in_time_end?: string | null;
    check_out_time?: string | null;
    accommodation_type: AccommodationType;
    status: AccommodationStatus;
    website?: string | null;
    cost?: number | null;
    currency?: string | null;
    is_private: boolean;
    notes?: string | null;
    trip_leg_id?: string | null;
    audience_mode?: "everyone" | "custom" | "just_me" | null;
    created_at?: string | null;
    updated_at?: string | null;
};

export type TripAccommodationFormPayload = Omit<
    TripAccommodation,
    "id" | "created_at" | "updated_at" | "created_by"
>;

export function nullableString(value: FormDataEntryValue | null) {
    const text = typeof value === "string" ? value.trim() : "";
    return text || null;
}

export function normalizeWebsiteUrl(value: FormDataEntryValue | null) {
    const text = nullableString(value);
    if (!text) return null;

    if (/^https?:\/\//i.test(text)) return text;
    return `https://${text}`;
}

export function getAccommodationTypeLabel(value?: string | null) {
    return (
        ACCOMMODATION_TYPE_OPTIONS.find((option) => option.value === value)?.label ||
        "Other"
    );
}

export function getAccommodationStatusLabel(value?: string | null) {
    return (
        ACCOMMODATION_STATUS_OPTIONS.find((option) => option.value === value)
            ?.label || "Tentative"
    );
}

export function getAccommodationErrorMessage(message?: string | null) {
    const value = message?.toLowerCase() || "";

    if (value.includes("check_out") || value.includes("after check_in")) {
        return "Check-out date must be after check-in date.";
    }
    if (
        value.includes("free_cancellation") ||
        value.includes("cancellation_before_checkin")
    ) {
        return "Free cancellation must end on or before check-in.";
    }
    if (value.includes("check_in_time") || value.includes("time")) {
        return "Check-in end time must be after check-in start time.";
    }
    if (value.includes("google_place_id")) {
        return "Select a Google Maps result to validate this accommodation.";
    }
    if (value.includes("website")) {
        return "Website must be a valid URL.";
    }
    if (value.includes("row-level security") || value.includes("permission")) {
        return "You do not have permission to edit this accommodation.";
    }

    return message || "Unknown Supabase error";
}

export function getAccommodationLocationLabel(
    accommodation: Pick<
        TripAccommodation,
        "city" | "region" | "country" | "address" | "hotel_name"
    >
) {
    return (
        accommodation.city ||
        accommodation.region ||
        accommodation.country ||
        accommodation.address?.split(",").at(0)?.trim() ||
        accommodation.hotel_name ||
        ""
    );
}

export function buildAccommodationPayload(
    formData: FormData,
    tripId: string
): TripAccommodationFormPayload {
    const accommodationType = String(
        formData.get("accommodation_type") || "other"
    ) as AccommodationType;
    const status = String(formData.get("status") || "tentative") as AccommodationStatus;
    const latitudeText = nullableString(formData.get("latitude"));
    const longitudeText = nullableString(formData.get("longitude"));
    const costText = nullableString(formData.get("cost"));

    return {
        trip_id: tripId,
        hotel_name: String(formData.get("hotel_name") || "").trim(),
        google_place_id: nullableString(formData.get("google_place_id")),
        google_maps_url: nullableString(formData.get("google_maps_url")),
        address: nullableString(formData.get("address")),
        address_line_1: nullableString(formData.get("address_line_1")),
        address_line_2: nullableString(formData.get("address_line_2")),
        city: nullableString(formData.get("city")),
        region: nullableString(formData.get("region")),
        country: nullableString(formData.get("country")),
        postal_code: nullableString(formData.get("postal_code")),
        latitude: latitudeText ? Number(latitudeText) : null,
        longitude: longitudeText ? Number(longitudeText) : null,
        check_in_date: String(formData.get("check_in_date") || ""),
        check_out_date: String(formData.get("check_out_date") || ""),
        free_cancellation_ends_on: nullableString(
            formData.get("free_cancellation_ends_on")
        ),
        check_in_time_start: nullableString(formData.get("check_in_time_start")),
        check_in_time_end: nullableString(formData.get("check_in_time_end")),
        check_out_time: nullableString(formData.get("check_out_time")),
        accommodation_type: accommodationType,
        status,
        website: normalizeWebsiteUrl(formData.get("website")),
        cost: costText ? Number(costText.replace(/,/g, "")) : null,
        currency: costText
            ? nullableString(formData.get("currency"))?.toUpperCase() || null
            : null,
        is_private:
            formData.get("is_private") === "on" ||
            formData.get("is_private") === "true",
        trip_leg_id: nullableString(formData.get("trip_leg_id")),
        audience_mode:
            String(formData.get("audience_mode") || "") === "custom" ||
            String(formData.get("audience_mode") || "") === "just_me"
                ? (String(formData.get("audience_mode")) as "custom" | "just_me")
                : "everyone",
        notes: nullableString(formData.get("notes")),
    };
}

export function validateAccommodationPayload(
    payload: TripAccommodationFormPayload
) {
    const errors: string[] = [];

    if (!payload.hotel_name) errors.push("Accommodation name is required.");
    if (!payload.check_in_date) errors.push("Check-in date is required.");
    if (!payload.check_out_date) errors.push("Check-out date is required.");
    if (
        payload.check_in_date &&
        payload.check_out_date &&
        payload.check_out_date <= payload.check_in_date
    ) {
        errors.push("Check-out date must be after check-in date.");
    }
    if (
        payload.free_cancellation_ends_on &&
        payload.check_in_date &&
        payload.free_cancellation_ends_on > payload.check_in_date
    ) {
        errors.push("Free cancellation must end on or before check-in.");
    }
    if (
        payload.check_in_time_start &&
        payload.check_in_time_end &&
        payload.check_in_time_end <= payload.check_in_time_start
    ) {
        errors.push("Check-in end time must be after check-in start time.");
    }
    if (payload.website && !/^https?:\/\/\S+\.\S+/i.test(payload.website)) {
        errors.push("Website must be a valid URL.");
    }
    if (payload.cost !== null && payload.cost !== undefined) {
        if (!Number.isFinite(payload.cost) || payload.cost <= 0) {
            errors.push("Cost must be greater than 0.");
        }
        if (!payload.currency || !/^[A-Z]{3}$/.test(payload.currency)) {
            errors.push("Choose a valid currency.");
        }
    }

    return errors;
}
