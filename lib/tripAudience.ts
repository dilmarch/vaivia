export type TripAudienceMode = "everyone" | "custom" | "just_me";

export type TripAudienceParticipantKind =
    | "member"
    | "invitation"
    | "family_member"
    | "guest";

export type TripAudienceItemType =
    | "itinerary"
    | "transportation"
    | "accommodation";

export type TripAudienceOption = {
    kind: TripAudienceParticipantKind;
    id: string;
    displayName: string;
    avatarUrl?: string | null;
    status: "accepted" | "invited" | "family_member" | "guest";
    secondaryLabel?: string | null;
    isCurrentUser?: boolean;
};

export type TripItemParticipantDisplay = {
    trip_id?: string | null;
    item_type: TripAudienceItemType;
    item_id: string;
    participant_kind?: TripAudienceParticipantKind | null;
    participant_status?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
};

export type ParsedTripAudience = {
    audienceMode: TripAudienceMode;
    memberIds: string[];
    invitationIds: string[];
    familyMemberIds: string[];
    guestNames: string[];
};

function getUniqueFormStrings(formData: FormData, name: string) {
    return Array.from(
        new Set(
            formData
                .getAll(name)
                .map((value) => String(value || "").trim())
                .filter(Boolean)
        )
    );
}

export function normalizeAudienceMode(value: FormDataEntryValue | null) {
    const text = String(value || "").trim();
    return text === "custom" || text === "just_me" ? text : "everyone";
}

export function parseTripAudienceFormData(formData: FormData): ParsedTripAudience {
    return {
        audienceMode: normalizeAudienceMode(formData.get("audience_mode")),
        memberIds: getUniqueFormStrings(formData, "audience_member_ids"),
        invitationIds: getUniqueFormStrings(formData, "audience_invitation_ids"),
        familyMemberIds: getUniqueFormStrings(
            formData,
            "audience_family_member_ids"
        ),
        guestNames: getUniqueFormStrings(formData, "audience_guest_names"),
    };
}

export function buildTripItemParticipantRows({
    tripId,
    itemType,
    itemId,
    audience,
}: {
    tripId: string;
    itemType: TripAudienceItemType;
    itemId: string;
    audience: ParsedTripAudience;
}) {
    if (audience.audienceMode === "everyone") return [];

    return [
        ...audience.memberIds.map((tripMemberId) => ({
            trip_id: tripId,
            item_type: itemType,
            item_id: itemId,
            participant_kind: "member",
            trip_member_id: tripMemberId,
        })),
        ...audience.invitationIds.map((invitationId) => ({
            trip_id: tripId,
            item_type: itemType,
            item_id: itemId,
            participant_kind: "invitation",
            invitation_id: invitationId,
        })),
        ...audience.familyMemberIds.map((familyMemberId) => ({
            trip_id: tripId,
            item_type: itemType,
            item_id: itemId,
            participant_kind: "family_member",
            family_member_id: familyMemberId,
        })),
        ...audience.guestNames.map((guestName) => ({
            trip_id: tripId,
            item_type: itemType,
            item_id: itemId,
            participant_kind: "guest",
            guest_name: guestName,
        })),
    ];
}
