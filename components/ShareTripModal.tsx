"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { Send, X } from "lucide-react";
import AnimatedModal from "@/components/AnimatedModal";
import Portal from "@/components/Portal";
import { createClient } from "@/lib/supabase/client";
import type { TripHeaderFamilyMember } from "@/components/TripMembersPanel";

type QuickAddFriend = {
    id: string;
    name: string;
    username?: string | null;
    avatarUrl?: string | null;
};

type InviteWizardStep = "invitee" | "journey" | "accommodations" | "success";

const INVITE_SUCCESS_MESSAGE =
    "If this user exists, they will receive an invitation to join your trip. If this user doesn't have an account, they will be invited to create one.";

type InviteLegOption = {
    id: string;
    name: string;
    city_name?: string | null;
    country_code?: string | null;
    icon_emoji?: string | null;
    start_date?: string | null;
    end_date?: string | null;
};

type InviteJourneyOption = {
    id: string;
    title?: string | null;
    transport_type?: string | null;
    departure_location?: string | null;
    arrival_location?: string | null;
    departure_date?: string | null;
    transport_number?: string | null;
    status?: string | null;
};

type InviteAccommodationOption = {
    id: string;
    hotel_name?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    check_in_date?: string | null;
    check_out_date?: string | null;
    status?: string | null;
};

type ShareTripModalProps = {
    tripId: string;
    tripTitle?: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onInviteSent?: () => void;
    familyMembers?: TripHeaderFamilyMember[];
    availableFamilyMembers?: TripHeaderFamilyMember[];
    addFamilyMemberAction?: (formData: FormData) => Promise<void>;
};

function getInviteErrorMessage(error: { message?: string } | null) {
    const message = error?.message?.toLowerCase() || "";

    if (
        message.includes("create_trip_invitation_with_assignments") ||
        message.includes("could not find the function")
    ) {
        return "Trip invite assignments are not configured in Supabase yet. Apply the scoped trip invitation migration before sending invites.";
    }

    if (message.includes("blocked") || message.includes("create a trip from your account")) {
        return error?.message || "You can't invite this person to this trip.";
    }

    if (message.includes("duplicate") || message.includes("already")) {
        return "An invitation is already pending for this user.";
    }

    return "Could not send invite. Please try again.";
}

function getFriendInitials(friend: QuickAddFriend) {
    return friend.name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

function getFamilyInitials(member: TripHeaderFamilyMember) {
    return member.name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

export default function ShareTripModal({
    tripId,
    tripTitle,
    open,
    onOpenChange,
    onInviteSent,
    familyMembers = [],
    availableFamilyMembers = [],
    addFamilyMemberAction,
}: ShareTripModalProps) {
    const router = useRouter();
    const [inviteStep, setInviteStep] = useState<InviteWizardStep>("invitee");
    const [invitee, setInvitee] = useState("");
    const [consentChecked, setConsentChecked] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAddingFamily, setIsAddingFamily] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [quickAddFriends, setQuickAddFriends] = useState<QuickAddFriend[]>([]);
    const [isLoadingFriends, setIsLoadingFriends] = useState(false);
    const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
    const [legOptions, setLegOptions] = useState<InviteLegOption[]>([]);
    const [journeyOptions, setJourneyOptions] = useState<InviteJourneyOption[]>([]);
    const [accommodationOptions, setAccommodationOptions] = useState<
        InviteAccommodationOption[]
    >([]);
    const [selectedLegIds, setSelectedLegIds] = useState<Set<string>>(
        () => new Set()
    );
    const [selectedJourneyIds, setSelectedJourneyIds] = useState<Set<string>>(
        () => new Set()
    );
    const [selectedAccommodationIds, setSelectedAccommodationIds] = useState<
        Set<string>
    >(() => new Set());
    const [selectedFamilyIds, setSelectedFamilyIds] = useState<Set<string>>(
        () => new Set()
    );
    const canContinueInvite = Boolean(invitee.trim() && consentChecked);
    const canSubmit = canContinueInvite && !isSubmitting;
    const goingFamilyIds = new Set(
        familyMembers.map((member) => member.family_member_id)
    );
    const selectableFamilyMembers = availableFamilyMembers.filter(
        (member) => !goingFamilyIds.has(member.family_member_id)
    );
    const canAddFamily =
        Boolean(addFamilyMemberAction) &&
        selectedFamilyIds.size > 0 &&
        !isAddingFamily;

    function resetInviteForm() {
        setInvitee("");
        setConsentChecked(false);
        setSelectedLegIds(new Set());
        setSelectedJourneyIds(new Set());
        setSelectedAccommodationIds(new Set());
        setErrorMessage("");
        setSuccessMessage("");
    }

    useEffect(() => {
        if (!open) {
            setInviteStep("invitee");
            resetInviteForm();
            return;
        }

        let isCancelled = false;

        async function loadFriends() {
            const supabase = createClient();
            setIsLoadingFriends(true);

            try {
                const {
                    data: { user },
                } = await supabase.auth.getUser();
                if (!user) return;

                const { data: friendships, error: friendshipsError } =
                    await supabase
                        .from("user_friendships")
                        .select(
                            "requester_user_id,addressee_user_id,status"
                        )
                        .or(
                            `requester_user_id.eq.${user.id},addressee_user_id.eq.${user.id}`
                        )
                        .eq("status", "accepted");

                if (friendshipsError) throw friendshipsError;

                const friendIds = Array.from(
                    new Set(
                        ((friendships || []) as Array<{
                            requester_user_id?: string | null;
                            addressee_user_id?: string | null;
                        }>)
                            .map((friendship) =>
                                friendship.requester_user_id === user.id
                                    ? friendship.addressee_user_id
                                    : friendship.requester_user_id
                            )
                            .filter((friendId): friendId is string =>
                                Boolean(friendId && friendId !== user.id)
                            )
                    )
                );

                const { data: profiles, error: profilesError } =
                    friendIds.length > 0
                        ? await supabase
                              .from("connected_public_user_profiles")
                              .select(
                                  "id,first_name,last_name,username,avatar_url"
                              )
                              .in("id", friendIds)
                        : { data: [], error: null };

                if (profilesError) throw profilesError;

                if (!isCancelled) {
                    setQuickAddFriends(
                        ((profiles || []) as Array<{
                            id: string;
                            first_name?: string | null;
                            last_name?: string | null;
                            username?: string | null;
                            avatar_url?: string | null;
                        }>).map((friend) => {
                            const name =
                                [friend.first_name, friend.last_name]
                                    .filter(Boolean)
                                    .join(" ")
                                    .trim() ||
                                friend.username ||
                                "VAIVIA friend";

                            return {
                                id: friend.id,
                                name,
                                username: friend.username || null,
                                avatarUrl: friend.avatar_url || null,
                            };
                        })
                    );
                }
            } catch (error) {
                console.warn("Could not load friends for quick add:", error);
                if (!isCancelled) setQuickAddFriends([]);
            } finally {
                if (!isCancelled) setIsLoadingFriends(false);
            }
        }

        loadFriends();

        return () => {
            isCancelled = true;
        };
    }, [open]);

    useEffect(() => {
        if (!open || !tripId) return;

        let isCancelled = false;

        async function loadAssignmentOptions() {
            const supabase = createClient();
            setIsLoadingAssignments(true);

            try {
                const [legsResult, journeyResult, accommodationsResult] =
                    await Promise.all([
                        supabase
                            .from("trip_legs")
                            .select(
                                "id,name,city_name,country_code,icon_emoji,start_date,end_date,leg_type,sort_order"
                            )
                            .eq("trip_id", tripId)
                            .neq("leg_type", "accommodation")
                            .order("start_date", {
                                ascending: true,
                                nullsFirst: false,
                            })
                            .order("sort_order", { ascending: true }),
                        supabase
                            .from("transportation_items")
                            .select(
                                "id,title,transport_type,departure_location,arrival_location,departure_date,transport_number,status"
                            )
                            .eq("trip_id", tripId)
                            .order("departure_date", {
                                ascending: true,
                                nullsFirst: false,
                            }),
                        supabase
                            .from("trip_accommodations")
                            .select(
                                "id,hotel_name,city,region,country,check_in_date,check_out_date,status"
                            )
                            .eq("trip_id", tripId)
                            .order("check_in_date", {
                                ascending: true,
                                nullsFirst: false,
                            }),
                    ]);

                if (legsResult.error) throw legsResult.error;
                if (journeyResult.error) throw journeyResult.error;
                if (accommodationsResult.error) throw accommodationsResult.error;

                if (!isCancelled) {
                    setLegOptions((legsResult.data || []) as InviteLegOption[]);
                    setJourneyOptions(
                        ((journeyResult.data || []) as InviteJourneyOption[]).filter(
                            (item) =>
                                String(item.status || "").toLowerCase() !==
                                "cancelled"
                        )
                    );
                    setAccommodationOptions(
                        (
                            (accommodationsResult.data || []) as InviteAccommodationOption[]
                        ).filter(
                            (stay) =>
                                String(stay.status || "").toLowerCase() !==
                                "cancelled"
                        )
                    );
                }
            } catch (error) {
                console.warn("Could not load invite assignment options:", error);
                if (!isCancelled) {
                    setLegOptions([]);
                    setJourneyOptions([]);
                    setAccommodationOptions([]);
                }
            } finally {
                if (!isCancelled) setIsLoadingAssignments(false);
            }
        }

        loadAssignmentOptions();

        return () => {
            isCancelled = true;
        };
    }, [open, tripId]);

    if (!open) return null;

    async function sendInvite(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!canSubmit) return;

        setIsSubmitting(true);
        setErrorMessage("");
        setSuccessMessage("");

        const response = await fetch(
            `/api/trips/${encodeURIComponent(tripId)}/invitations`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    invitee_identifier: invitee.trim(),
                    consent_confirmed: consentChecked,
                    target_leg_ids: Array.from(selectedLegIds),
                    target_transportation_item_ids: Array.from(selectedJourneyIds),
                    target_accommodation_item_ids: Array.from(
                        selectedAccommodationIds
                    ),
                }),
            }
        );
        const result = (await response.json().catch(() => null)) as {
            error?: string;
            code?: string;
            details?: string;
            hint?: string;
        } | null;

        if (!response.ok) {
            console.error("Could not send scoped trip invite:", {
                status: response.status,
                code: result?.code,
                message: result?.error,
                details: result?.details,
                hint: result?.hint,
            });
            setErrorMessage(
                getInviteErrorMessage({ message: result?.error || "" })
            );
        } else {
            resetInviteForm();
            setInviteStep("success");
            onInviteSent?.();
        }

        setIsSubmitting(false);
    }

    async function addSelectedFamily() {
        if (!addFamilyMemberAction || selectedFamilyIds.size === 0) return;

        const formData = new FormData();
        formData.set("trip_id", tripId);
        selectedFamilyIds.forEach((familyMemberId) => {
            formData.append("family_member_id", familyMemberId);
        });

        setIsAddingFamily(true);
        setErrorMessage("");
        setSuccessMessage("");

        try {
            await addFamilyMemberAction(formData);
            setSelectedFamilyIds(new Set());
            setSuccessMessage("Selected family members were added to this trip.");
            router.refresh();
        } catch {
            setErrorMessage("Could not add family members. Please try again.");
        } finally {
            setIsAddingFamily(false);
        }
    }

    function toggleFamilyMember(familyMemberId: string) {
        setSelectedFamilyIds((current) => {
            const next = new Set(current);
            if (next.has(familyMemberId)) next.delete(familyMemberId);
            else next.add(familyMemberId);
            return next;
        });
    }

    function toggleSelectedId(
        setter: Dispatch<SetStateAction<Set<string>>>,
        id: string
    ) {
        setter((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function formatOptionDates(start?: string | null, end?: string | null) {
        return [start, end].filter(Boolean).join(" - ") || "Dates not set";
    }

    function getLegLabel(leg: InviteLegOption) {
        return leg.name || leg.city_name || "Trip leg";
    }

    function getJourneyLabel(item: InviteJourneyOption) {
        const type = item.transport_type || "Transportation";
        const route = [item.departure_location, item.arrival_location]
            .filter(Boolean)
            .join(" → ");

        return item.title || item.transport_number || route || type;
    }

    function getAccommodationLabel(stay: InviteAccommodationOption) {
        return (
            stay.hotel_name ||
            [stay.city, stay.region, stay.country].filter(Boolean).join(", ") ||
            "Accommodation"
        );
    }

    return (
        <Portal>
            <AnimatedModal
                onClose={() => onOpenChange(false)}
                panelClassName="max-w-lg"
                labelledBy="share-trip-title"
            >
                {({ requestClose }) => (
                    <>
                    <div className="vaivia-modal-header flex items-start justify-between gap-4">
                        <div>
                            <p className="vaivia-modal-eyebrow">Collaboration</p>
                            <h2 id="share-trip-title" className="vaivia-modal-title">
                                Share this trip
                            </h2>
                            {tripTitle ? (
                                <p className="mt-2 text-sm font-medium text-slate-300">
                                    {tripTitle}
                                </p>
                            ) : null}
                        </div>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="vaivia-modal-close"
                            aria-label="Close share trip"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>

                    <div className="vaivia-modal-body space-y-5">
                        {inviteStep === "success" ? (
                            <div className="space-y-5">
                                <div className="rounded-2xl border border-lime-200 bg-lime-50 p-5 text-slate-950">
                                    <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-700">
                                        Invite sent
                                    </p>
                                    <h3 className="mt-2 text-2xl font-black">
                                        Your trip invite is on its way
                                    </h3>
                                    <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">
                                        {INVITE_SUCCESS_MESSAGE}
                                    </p>
                                </div>

                                <div className="flex flex-col gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={requestClose}
                                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                    >
                                        Done
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            resetInviteForm();
                                            setInviteStep("invitee");
                                        }}
                                        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                                    >
                                        Add another user
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form
                                onSubmit={(event) => {
                                    if (inviteStep === "accommodations") {
                                        void sendInvite(event);
                                        return;
                                    }

                                    event.preventDefault();
                                    if (!canContinueInvite) return;
                                    setErrorMessage("");
                                    setSuccessMessage("");
                                    setInviteStep(
                                        inviteStep === "invitee"
                                            ? "journey"
                                            : "accommodations"
                                    );
                                }}
                                className="space-y-5"
                            >
                                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                                    <span
                                        className={
                                            inviteStep === "invitee"
                                                ? "text-slate-950"
                                                : "text-lime-700"
                                        }
                                    >
                                        1 Invite
                                    </span>
                                    <span>/</span>
                                    <span
                                        className={
                                            inviteStep === "journey"
                                                ? "text-slate-950"
                                                : "text-slate-500"
                                        }
                                    >
                                        2 Journey
                                    </span>
                                    <span>/</span>
                                    <span
                                        className={
                                            inviteStep === "accommodations"
                                                ? "text-slate-950"
                                                : "text-slate-500"
                                        }
                                    >
                                        3 Stays
                                    </span>
                                </div>

                                {inviteStep === "invitee" ? (
                                    <>
                                        <p className="text-sm leading-6 text-slate-600">
                                            Invite a friend to collaborate on this trip.
                                            You’ll choose exactly which legs, journey
                                            items, and stays they are added to before the
                                            invite is sent.
                                        </p>

                                        <div>
                                            <label
                                                htmlFor="tripInvitee"
                                                className="block text-sm font-semibold text-slate-800"
                                            >
                                                Friend’s email or username
                                            </label>
                                            <input
                                                id="tripInvitee"
                                                value={invitee}
                                                onChange={(event) =>
                                                    setInvitee(event.target.value)
                                                }
                                                placeholder="name@example.com or username"
                                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                                autoComplete="off"
                                                data-form-type="other"
                                                data-lpignore="true"
                                                data-1p-ignore="true"
                                            />
                                        </div>

                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                                                Quick add friends
                                            </p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {isLoadingFriends ? (
                                                    <p className="text-sm font-semibold text-slate-500">
                                                        Loading friends...
                                                    </p>
                                                ) : quickAddFriends.length > 0 ? (
                                                    quickAddFriends.map((friend) => (
                                                        <button
                                                            key={friend.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setInvitee(
                                                                    friend.username || ""
                                                                );
                                                                setConsentChecked(true);
                                                            }}
                                                            disabled={!friend.username}
                                                            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 text-left text-slate-900 shadow-sm transition hover:border-lime-300 hover:bg-lime-50"
                                                        >
                                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-950 text-xs font-black uppercase text-lime-200">
                                                                {friend.avatarUrl ? (
                                                                    // eslint-disable-next-line @next/next/no-img-element
                                                                    <img
                                                                        src={friend.avatarUrl}
                                                                        alt=""
                                                                        className="h-full w-full object-cover"
                                                                    />
                                                                ) : (
                                                                    getFriendInitials(friend)
                                                                )}
                                                            </span>
                                                            <span className="min-w-0">
                                                                <span className="block max-w-32 truncate text-sm font-black">
                                                                    {friend.name}
                                                                </span>
                                                                {friend.username ? (
                                                                    <span className="block max-w-32 truncate text-xs font-semibold text-slate-500">
                                                                        @{friend.username}
                                                                    </span>
                                                                ) : null}
                                                            </span>
                                                        </button>
                                                    ))
                                                ) : (
                                                    <p className="text-sm font-semibold text-slate-500">
                                                        Accepted friends will appear here.
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                                                        Quick add family
                                                    </p>
                                                    <p className="mt-1 text-sm font-semibold leading-5 text-slate-600">
                                                        Add saved family members to Going
                                                        without sending them an account
                                                        invite.
                                                    </p>
                                                </div>
                                                {selectedFamilyIds.size > 0 ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => void addSelectedFamily()}
                                                        disabled={!canAddFamily}
                                                        className="shrink-0 rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        {isAddingFamily
                                                            ? "Adding..."
                                                            : "Add"}
                                                    </button>
                                                ) : null}
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {selectableFamilyMembers.length > 0 ? (
                                                    selectableFamilyMembers.map((member) => {
                                                        const selected =
                                                            selectedFamilyIds.has(
                                                                member.family_member_id
                                                            );

                                                        return (
                                                            <button
                                                                key={member.family_member_id}
                                                                type="button"
                                                                onClick={() =>
                                                                    toggleFamilyMember(
                                                                        member.family_member_id
                                                                    )
                                                                }
                                                                className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-left shadow-sm transition ${
                                                                    selected
                                                                        ? "border-lime-300 bg-lime-50 text-slate-950"
                                                                        : "border-slate-200 bg-white text-slate-900 hover:border-lime-300 hover:bg-lime-50"
                                                                }`}
                                                            >
                                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-950 text-xs font-black uppercase text-lime-200">
                                                                    {member.avatar_url ? (
                                                                        // eslint-disable-next-line @next/next/no-img-element
                                                                        <img
                                                                            src={member.avatar_url}
                                                                            alt=""
                                                                            className="h-full w-full object-cover"
                                                                        />
                                                                    ) : (
                                                                        getFamilyInitials(
                                                                            member
                                                                        )
                                                                    )}
                                                                </span>
                                                                <span className="min-w-0">
                                                                    <span className="block max-w-32 truncate text-sm font-black">
                                                                        {member.name}
                                                                    </span>
                                                                    <span className="block max-w-32 truncate text-xs font-semibold text-slate-500">
                                                                        {member.relationship ||
                                                                            "Family member"}
                                                                    </span>
                                                                </span>
                                                            </button>
                                                        );
                                                    })
                                                ) : (
                                                    <p className="text-sm font-semibold text-slate-500">
                                                        Saved family members who are not
                                                        already going will appear here.
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={consentChecked}
                                                onChange={(event) =>
                                                    setConsentChecked(event.target.checked)
                                                }
                                                className="mt-1 h-4 w-4 rounded border-slate-300"
                                            />
                                            <span>
                                                I consent to sharing selected trip details
                                                with this user, except for any activities
                                                marked private.
                                            </span>
                                        </label>
                                    </>
                                ) : null}

                                {inviteStep === "journey" ? (
                                    <div className="space-y-4">
                                        <div>
                                            <h3 className="text-lg font-black text-slate-950">
                                                Add them to trip legs
                                            </h3>
                                            <p className="mt-1 text-sm leading-6 text-slate-600">
                                                If you choose none, they can accept the
                                                trip but will see blank dates until a leg
                                                is added for them.
                                            </p>
                                        </div>

                                        {isLoadingAssignments ? (
                                            <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                                                Loading trip details...
                                            </p>
                                        ) : legOptions.length > 0 ? (
                                            <div className="grid gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedLegIds(new Set())}
                                                    className={`rounded-2xl border p-3 text-left text-sm font-black transition ${
                                                        selectedLegIds.size === 0
                                                            ? "border-lime-300 bg-lime-50 text-slate-950"
                                                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                                    }`}
                                                >
                                                    None
                                                </button>
                                                {legOptions.map((leg) => {
                                                    const selected = selectedLegIds.has(leg.id);
                                                    return (
                                                        <button
                                                            key={leg.id}
                                                            type="button"
                                                            onClick={() =>
                                                                toggleSelectedId(
                                                                    setSelectedLegIds,
                                                                    leg.id
                                                                )
                                                            }
                                                            className={`flex items-center justify-between gap-3 rounded-2xl border p-3 text-left transition ${
                                                                selected
                                                                    ? "border-lime-300 bg-lime-50 text-slate-950"
                                                                    : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                                                            }`}
                                                        >
                                                            <span>
                                                                <span className="block text-sm font-black">
                                                                    {leg.icon_emoji
                                                                        ? `${leg.icon_emoji} `
                                                                        : ""}
                                                                    {getLegLabel(leg)}
                                                                </span>
                                                                <span className="block text-xs font-semibold text-slate-500">
                                                                    {formatOptionDates(
                                                                        leg.start_date,
                                                                        leg.end_date
                                                                    )}
                                                                </span>
                                                            </span>
                                                            <span
                                                                className={`h-5 w-5 rounded-full border ${
                                                                    selected
                                                                        ? "border-slate-950 bg-slate-950 shadow-[inset_0_0_0_5px_#bef264]"
                                                                        : "border-slate-300 bg-white"
                                                                }`}
                                                            />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                                                No trip legs have been added yet.
                                            </p>
                                        )}

                                        <div className="border-t border-slate-200 pt-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <h3 className="text-lg font-black text-slate-950">
                                                        Journey items
                                                    </h3>
                                                    <p className="mt-1 text-sm leading-6 text-slate-600">
                                                        Select flights, trains, buses, or
                                                        other transportation this invitee
                                                        should be assigned to.
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedJourneyIds(new Set())}
                                                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600 transition hover:bg-slate-50"
                                                >
                                                    None
                                                </button>
                                            </div>
                                            <div className="mt-3 grid gap-2">
                                                {journeyOptions.length > 0 ? (
                                                    journeyOptions.map((item) => {
                                                        const selected =
                                                            selectedJourneyIds.has(item.id);
                                                        return (
                                                            <button
                                                                key={item.id}
                                                                type="button"
                                                                onClick={() =>
                                                                    toggleSelectedId(
                                                                        setSelectedJourneyIds,
                                                                        item.id
                                                                    )
                                                                }
                                                                className={`rounded-2xl border p-3 text-left transition ${
                                                                    selected
                                                                        ? "border-lime-300 bg-lime-50 text-slate-950"
                                                                        : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                                                                }`}
                                                            >
                                                                <span className="block text-sm font-black">
                                                                    {getJourneyLabel(item)}
                                                                </span>
                                                                <span className="mt-1 block text-xs font-semibold text-slate-500">
                                                                    {[
                                                                        item.transport_type,
                                                                        item.departure_date,
                                                                    ]
                                                                        .filter(Boolean)
                                                                        .join(" · ") ||
                                                                        "No date set"}
                                                                </span>
                                                            </button>
                                                        );
                                                    })
                                                ) : (
                                                    <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                                                        No journey items have been added
                                                        yet.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : null}

                                {inviteStep === "accommodations" ? (
                                    <div className="space-y-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <h3 className="text-lg font-black text-slate-950">
                                                    Add them to stays
                                                </h3>
                                                <p className="mt-1 text-sm leading-6 text-slate-600">
                                                    Select accommodations this invitee
                                                    should be assigned to, or choose none.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setSelectedAccommodationIds(new Set())
                                                }
                                                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600 transition hover:bg-slate-50"
                                            >
                                                None
                                            </button>
                                        </div>
                                        <div className="grid gap-2">
                                            {accommodationOptions.length > 0 ? (
                                                accommodationOptions.map((stay) => {
                                                    const selected =
                                                        selectedAccommodationIds.has(stay.id);
                                                    return (
                                                        <button
                                                            key={stay.id}
                                                            type="button"
                                                            onClick={() =>
                                                                toggleSelectedId(
                                                                    setSelectedAccommodationIds,
                                                                    stay.id
                                                                )
                                                            }
                                                            className={`rounded-2xl border p-3 text-left transition ${
                                                                selected
                                                                    ? "border-lime-300 bg-lime-50 text-slate-950"
                                                                    : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                                                            }`}
                                                        >
                                                            <span className="block text-sm font-black">
                                                                {getAccommodationLabel(stay)}
                                                            </span>
                                                            <span className="mt-1 block text-xs font-semibold text-slate-500">
                                                                {formatOptionDates(
                                                                    stay.check_in_date,
                                                                    stay.check_out_date
                                                                )}
                                                            </span>
                                                        </button>
                                                    );
                                                })
                                            ) : (
                                                <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                                                    No accommodations have been added yet.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ) : null}

                                {errorMessage ? (
                                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                                        {errorMessage}
                                    </p>
                                ) : null}
                                {successMessage ? (
                                    <p className="rounded-xl border border-lime-200 bg-lime-50 px-4 py-3 text-sm font-semibold text-lime-800">
                                        {successMessage}
                                    </p>
                                ) : null}

                                <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
                                    {inviteStep !== "invitee" ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setInviteStep(
                                                    inviteStep === "accommodations"
                                                        ? "journey"
                                                        : "invitee"
                                                )
                                            }
                                            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                        >
                                            Back
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={requestClose}
                                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!canSubmit}
                                        className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {inviteStep === "accommodations" ? (
                                            <Send className="h-4 w-4" aria-hidden="true" />
                                        ) : null}
                                        {isSubmitting
                                            ? "Sending..."
                                            : inviteStep === "accommodations"
                                              ? "Send invite"
                                              : "Next"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                    </>
                )}
            </AnimatedModal>
        </Portal>
    );
}
