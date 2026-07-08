export type FamilyMember = {
    id: string;
    user_id: string;
    name: string;
    relationship?: string | null;
    avatar_url?: string | null;
    notes?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
};

export type TripFamilyMember = {
    id: string;
    trip_id: string;
    family_member_id: string;
    added_by?: string | null;
    status: "going" | "not_going" | "removed";
    created_at?: string | null;
    updated_at?: string | null;
};

export type TransportationTravelerType = "user" | "family" | "guest";

export type TransportationTraveler = {
    id?: string;
    type: TransportationTravelerType;
    user_id?: string | null;
    family_member_id?: string | null;
    guest_name?: string | null;
    traveler_note?: string | null;
    name: string;
    secondaryLabel?: string | null;
    avatar_url?: string | null;
};

export type TransportationTravelerOptions = {
    users: TransportationTraveler[];
    familyMembers: TransportationTraveler[];
};

export function getInitials(name?: string | null) {
    return (name || "?")
        .trim()
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

export function getFamilyLimitMessage(message?: string | null) {
    const value = message?.toLowerCase() || "";
    if (value.includes("10") || value.includes("max") || value.includes("limit")) {
        return "You can add up to 10 family members.";
    }
    return "";
}

export function normalizeFamilyMemberPayload(formData: FormData, userId: string) {
    return {
        user_id: userId,
        name: String(formData.get("name") || "").trim(),
        relationship: String(formData.get("relationship") || "").trim() || null,
        avatar_url: String(formData.get("avatar_url") || "").trim() || null,
        notes: String(formData.get("notes") || "").trim() || null,
    };
}
