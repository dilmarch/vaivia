"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import Portal from "@/components/Portal";
import ShareTripModal from "@/components/ShareTripModal";
import { createClient } from "@/lib/supabase/client";

export type TripHeaderMember = {
    user_id: string;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    email?: string | null;
    avatar_url?: string | null;
    joined_at?: string | null;
    role?: string | null;
};

export type TripHeaderFamilyMember = {
    id: string;
    family_member_id: string;
    name: string;
    relationship?: string | null;
    avatar_url?: string | null;
    notes?: string | null;
    joined_at?: string | null;
    status?: string | null;
};

export type TripHeaderInvitation = {
    id: string;
    label: string;
    invited_by?: string | null;
    created_at?: string | null;
};

type TripMembersPanelProps = {
    tripId: string;
    tripTitle?: string | null;
    members: TripHeaderMember[];
    familyMembers?: TripHeaderFamilyMember[];
    availableFamilyMembers?: TripHeaderFamilyMember[];
    invitations?: TripHeaderInvitation[];
    currentUserId: string;
    tripOwnerId?: string | null;
    removeMemberAction: (formData: FormData) => Promise<void>;
    addFamilyMemberAction?: (formData: FormData) => Promise<void>;
    removeFamilyMemberAction?: (formData: FormData) => Promise<void>;
};

type FriendshipStatus = "pending" | "accepted" | "cancelled" | "declined" | "blocked";

type FriendshipRow = {
    id: string;
    requester_user_id: string;
    addressee_user_id: string | null;
    status: FriendshipStatus;
    blocked_by_user_id?: string | null;
};

function getDisplayName(member: TripHeaderMember) {
    return (
        [member.first_name, member.last_name].filter(Boolean).join(" ").trim() ||
        member.username ||
        "Trip member"
    );
}

function getFriendIdentifier(member: TripHeaderMember) {
    return member.username || "";
}

function getInitials(member: TripHeaderMember) {
    return getDisplayName(member)
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

function formatJoinedDate(value?: string | null) {
    if (!value) return "Not available";

    return new Date(value).toLocaleDateString("en-CA", {
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

function MemberAvatar({ member }: { member: TripHeaderMember }) {
    return (
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/15 bg-slate-950 text-xs font-black uppercase text-lime-200 shadow-[0_0_24px_rgba(0,0,0,0.26)]">
            {member.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={member.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                />
            ) : (
                getInitials(member)
            )}
        </span>
    );
}

function FamilyAvatar({ member }: { member: TripHeaderFamilyMember }) {
    return (
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/15 bg-slate-950 text-xs font-black uppercase text-lime-200 shadow-[0_0_24px_rgba(0,0,0,0.26)]">
            {member.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={member.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
                member.name
                    .split(/\s+/)
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()
            )}
        </span>
    );
}

function getInvitationInitial(invitation: TripHeaderInvitation) {
    return invitation.label.trim()[0]?.toUpperCase() || "?";
}

export default function TripMembersPanel({
    tripId,
    tripTitle,
    members,
    familyMembers = [],
    availableFamilyMembers = [],
    invitations = [],
    currentUserId,
    tripOwnerId,
    removeMemberAction,
    addFamilyMemberAction,
    removeFamilyMemberAction,
}: TripMembersPanelProps) {
    const router = useRouter();
    const [selectedMember, setSelectedMember] = useState<TripHeaderMember | null>(
        null
    );
    const [selectedFamilyMember, setSelectedFamilyMember] =
        useState<TripHeaderFamilyMember | null>(null);
    const [friendshipsByUserId, setFriendshipsByUserId] = useState<
        Record<string, FriendshipRow>
    >({});
    const [confirmingFriend, setConfirmingFriend] =
        useState<TripHeaderMember | null>(null);
    const [cancelFriendInviteTarget, setCancelFriendInviteTarget] =
        useState<TripHeaderMember | null>(null);
    const [friendActionError, setFriendActionError] = useState("");
    const [savingFriendUserId, setSavingFriendUserId] = useState<string | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [isRemovingMember, setIsRemovingMember] = useState(false);
    const [removeMemberError, setRemoveMemberError] = useState("");
    const [isRemovingFamilyMember, setIsRemovingFamilyMember] = useState(false);
    const [removeFamilyMemberError, setRemoveFamilyMemberError] = useState("");
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [cancelTripInviteTarget, setCancelTripInviteTarget] =
        useState<TripHeaderInvitation | null>(null);
    const [cancelledTripInviteIds, setCancelledTripInviteIds] = useState<string[]>(
        []
    );
    const [isCancellingTripInvite, setIsCancellingTripInvite] = useState(false);
    const [tripInviteCancelError, setTripInviteCancelError] = useState("");

    const friendCandidateIds = useMemo(
        () =>
            members
                .map((member) => member.user_id)
                .filter((memberUserId) => memberUserId !== currentUserId),
        [currentUserId, members]
    );

    useEffect(() => {
        let isActive = true;

        async function loadFriendships() {
            if (friendCandidateIds.length === 0) {
                setFriendshipsByUserId({});
                return;
            }

            const supabase = createClient();
            const { data, error } = await supabase
                .from("user_friendships")
                .select(
                    "id,requester_user_id,addressee_user_id,status,blocked_by_user_id"
                )
                .or(
                    `requester_user_id.eq.${currentUserId},addressee_user_id.eq.${currentUserId}`
                );

            if (!isActive) return;

            if (error) {
                console.warn("Could not load trip-member friend statuses:", error);
                setFriendshipsByUserId({});
                return;
            }

            const candidateSet = new Set(friendCandidateIds);
            const next: Record<string, FriendshipRow> = {};

            ((data || []) as FriendshipRow[]).forEach((friendship) => {
                const otherUserId =
                    friendship.requester_user_id === currentUserId
                        ? friendship.addressee_user_id
                        : friendship.requester_user_id;

                if (!otherUserId || !candidateSet.has(otherUserId)) return;

                next[otherUserId] = friendship;
            });

            setFriendshipsByUserId(next);
        }

        loadFriendships();

        return () => {
            isActive = false;
        };
    }, [currentUserId, friendCandidateIds]);

    if (
        members.length === 0 &&
        familyMembers.length === 0 &&
        invitations.length === 0
    ) {
        return null;
    }

    const visibleInvitations = invitations.filter(
        (invitation) => !cancelledTripInviteIds.includes(invitation.id)
    );

    const canRemoveSelectedMember =
        Boolean(selectedMember) &&
        currentUserId === tripOwnerId &&
        selectedMember?.user_id !== currentUserId &&
        selectedMember?.user_id !== tripOwnerId;

    async function sendFriendInvite(member: TripHeaderMember) {
        const identifier = getFriendIdentifier(member);

        if (!identifier) {
            setFriendActionError(
                "This trip member does not have a username available for friend invites."
            );
            return;
        }

        setSavingFriendUserId(member.user_id);
        setFriendActionError("");

        const supabase = createClient();
        const { data, error } = await supabase.rpc("create_friend_invitation", {
            invitee_identifier: identifier,
        });

        setSavingFriendUserId(null);

        if (error) {
            setFriendActionError(
                error.message || "Could not send this friend invite."
            );
            return;
        }

        if (data) {
            setFriendshipsByUserId((current) => ({
                ...current,
                [member.user_id]: {
                    id: String(data),
                    requester_user_id: currentUserId,
                    addressee_user_id: member.user_id,
                    status: "pending",
                },
            }));
        }

        setConfirmingFriend(null);
    }

    async function handleRemoveMember(formData: FormData) {
        setIsRemovingMember(true);
        setRemoveMemberError("");

        try {
            await removeMemberAction(formData);
            setConfirmingDelete(false);
            setSelectedMember(null);
            router.refresh();
        } catch (error) {
            setRemoveMemberError(
                error instanceof Error
                    ? error.message
                    : "Could not remove this trip member."
            );
        } finally {
            setIsRemovingMember(false);
        }
    }

    async function handleRemoveFamilyMember(formData: FormData) {
        if (!removeFamilyMemberAction) return;

        setIsRemovingFamilyMember(true);
        setRemoveFamilyMemberError("");

        try {
            await removeFamilyMemberAction(formData);
            setSelectedFamilyMember(null);
            router.refresh();
        } catch (error) {
            setRemoveFamilyMemberError(
                error instanceof Error
                    ? error.message
                    : "Could not remove this family member from the trip."
            );
        } finally {
            setIsRemovingFamilyMember(false);
        }
    }

    async function rescindFriendInvite(member: TripHeaderMember) {
        const friendship = friendshipsByUserId[member.user_id];
        if (!friendship?.id || friendship.requester_user_id !== currentUserId) return;

        setSavingFriendUserId(member.user_id);
        setFriendActionError("");

        const supabase = createClient();
        const { error } = await supabase.rpc("respond_to_friend_invitation", {
            friendship_id: friendship.id,
            next_status: "cancelled",
        });

        setSavingFriendUserId(null);

        if (error) {
            setFriendActionError(
                error.message || "Could not rescind this friend invite."
            );
            return;
        }

        setFriendshipsByUserId((current) => {
            const next = { ...current };
            delete next[member.user_id];
            return next;
        });
        setCancelFriendInviteTarget(null);
    }

    async function cancelTripInvitation(invitation: TripHeaderInvitation) {
        setIsCancellingTripInvite(true);
        setTripInviteCancelError("");

        const supabase = createClient();
        const { error } = await supabase.rpc("cancel_trip_invitation", {
            invitation_id: invitation.id,
        });

        setIsCancellingTripInvite(false);

        if (error) {
            setTripInviteCancelError(
                error.message || "Could not cancel this trip invitation."
            );
            return;
        }

        setCancelledTripInviteIds((current) => [...current, invitation.id]);
        setCancelTripInviteTarget(null);
        router.refresh();
    }

    return (
        <>
            <div className="flex min-h-30 flex-wrap items-center gap-4 border-t border-white/10 pt-4 sm:min-h-32 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                <div className="shrink-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-lime-300">
                        Invited
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setIsShareModalOpen(true)}
                            className="group/member flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] py-1.5 pl-1.5 pr-3 text-left text-white shadow-xl shadow-black/10 transition hover:border-lime-300/30 hover:bg-white/[0.1]"
                            aria-label="Invite someone to this trip"
                            title="Invite someone"
                        >
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-lime-300/30 bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.20)] transition group-hover/member:bg-lime-200">
                                <Plus className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <span className="text-sm font-black text-white">
                                Invite
                            </span>
                        </button>
                        {visibleInvitations.map((invitation) => {
                            const canCancelInvitation =
                                invitation.invited_by === currentUserId ||
                                tripOwnerId === currentUserId;

                            if (canCancelInvitation) {
                                return (
                                    <span
                                        key={invitation.id}
                                        className="relative inline-flex"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTripInviteCancelError("");
                                                setCancelTripInviteTarget(invitation);
                                            }}
                                            className="relative inline-flex !h-11 !min-h-11 w-11 items-center justify-center rounded-full border-2 border-white/15 bg-white/[0.08] text-sm font-black uppercase text-lime-200 shadow-[0_0_24px_rgba(0,0,0,0.22)] transition hover:border-red-200/40 hover:bg-red-400/10 focus:outline-none focus:ring-2 focus:ring-red-200/50 sm:hidden"
                                            title="Cancel pending invitation"
                                            aria-label={`Cancel pending trip invitation for ${invitation.label}`}
                                        >
                                            {getInvitationInitial(invitation)}
                                        </button>

                                        <span
                                            className="group/invite relative hidden h-11 w-11 items-center justify-center rounded-full border-2 border-white/15 bg-white/[0.08] text-sm font-black uppercase text-lime-200 shadow-[0_0_24px_rgba(0,0,0,0.22)] sm:inline-flex"
                                            title="Pending invitation"
                                            aria-label="Pending trip invitation"
                                        >
                                            {getInvitationInitial(invitation)}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setTripInviteCancelError("");
                                                    setCancelTripInviteTarget(invitation);
                                                }}
                                                className="absolute -right-1 -top-1 flex !h-5 !min-h-5 !w-5 !min-w-5 items-center justify-center rounded-full border border-red-200/30 bg-slate-950 p-0 text-[10px] font-black leading-none text-red-100 opacity-0 shadow-xl shadow-black/35 transition hover:bg-red-400/20 group-hover/invite:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-200/50"
                                                aria-label="Cancel pending trip invitation"
                                                title="Cancel invite"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    </span>
                                );
                            }

                            return (
                                <span
                                    key={invitation.id}
                                    className="group/invite relative inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/15 bg-white/[0.08] text-sm font-black uppercase text-lime-200 shadow-[0_0_24px_rgba(0,0,0,0.22)]"
                                    title="Pending invitation"
                                    aria-label="Pending trip invitation"
                                >
                                    {getInvitationInitial(invitation)}
                                </span>
                            );
                        })}
                    </div>
                </div>

                <div className="min-w-0 sm:border-l sm:border-white/10 sm:pl-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-lime-300">
                        Going
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {members.map((member) => {
                            const friendship = friendshipsByUserId[member.user_id];
                            const isCurrentUser = member.user_id === currentUserId;
                            const isAcceptedFriend =
                                friendship?.status === "accepted";
                            const isBlockedFriendship =
                                friendship?.status === "blocked";
                            const isOutgoingPending =
                                friendship?.requester_user_id === currentUserId &&
                                (friendship.status === "pending" ||
                                    friendship.status === "declined");
                            const isIncomingPending =
                                friendship?.addressee_user_id === currentUserId &&
                                friendship.status === "pending";
                            const showAddFriend =
                                !isCurrentUser &&
                                !isAcceptedFriend &&
                                !isBlockedFriendship &&
                                !isOutgoingPending &&
                                !isIncomingPending;
                            const showPending = isOutgoingPending || isIncomingPending;
                            const isSavingFriend =
                                savingFriendUserId === member.user_id;

                            return (
                                <span
                                    key={member.user_id}
                                    className="group/member relative inline-flex min-w-0"
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedMember(member);
                                            setConfirmingDelete(false);
                                        }}
                                        className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] py-1.5 pl-1.5 pr-3 text-left text-white shadow-xl shadow-black/10 transition hover:border-lime-300/30 hover:bg-white/[0.1]"
                                    >
                                        <span
                                            className={
                                                showPending
                                                    ? "relative pb-4"
                                                    : "relative flex h-11 items-center"
                                            }
                                        >
                                            <MemberAvatar member={member} />
                                            <span className="absolute inset-x-0 top-0 flex h-11 items-center justify-center rounded-full bg-slate-950/70 opacity-0 transition group-hover/member:opacity-100">
                                                <Pencil
                                                    className="h-4 w-4 text-lime-200"
                                                    aria-hidden="true"
                                                />
                                            </span>
                                            {showPending ? (
                                                <span className="absolute -bottom-0.5 left-1/2 z-20 -translate-x-1/2 rounded-full border border-lime-300/25 bg-slate-950 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-lime-200 shadow-xl shadow-black/30">
                                                    Pending
                                                </span>
                                            ) : null}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block max-w-28 truncate text-sm font-black">
                                                {getDisplayName(member)}
                                            </span>
                                            {member.username ? (
                                                <span className="block max-w-28 truncate text-xs font-semibold text-slate-400">
                                                    @{member.username}
                                                </span>
                                            ) : null}
                                        </span>
                                    </button>

                                    {showAddFriend ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFriendActionError("");
                                                setConfirmingFriend(member);
                                            }}
                                            className="absolute bottom-3 left-8 z-30 inline-flex !h-5 !max-h-5 !min-h-5 !w-5 !min-w-5 !max-w-5 aspect-square shrink-0 items-center justify-center rounded-full border border-slate-950 bg-lime-300 p-0 text-slate-950 leading-none shadow-xl shadow-black/40 transition hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-200"
                                            aria-label={`Add ${getDisplayName(member)} as a friend`}
                                            title={`Add ${getDisplayName(member)} as a friend`}
                                        >
                                            <Plus className="h-3 w-3" aria-hidden="true" />
                                        </button>
                                    ) : null}

                                    {isOutgoingPending ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFriendActionError("");
                                                setCancelFriendInviteTarget(member);
                                            }}
                                            disabled={isSavingFriend}
                                            className="absolute -bottom-5 left-1 z-30 rounded-full border border-white/10 bg-slate-950/95 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-lime-200 opacity-0 shadow-xl shadow-black/35 transition hover:border-red-300/40 hover:text-red-100 group-hover/member:opacity-100 focus:opacity-100"
                                            aria-label={`Rescind friend invite to ${getDisplayName(member)}`}
                                            title="Rescind invite"
                                        >
                                            {isSavingFriend ? "..." : "X"}
                                        </button>
                                    ) : null}
                                </span>
                            );
                        })}
                        {familyMembers.map((member) => (
                            <button
                                key={member.family_member_id}
                                type="button"
                                onClick={() => setSelectedFamilyMember(member)}
                                className="group/member flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] py-1.5 pl-1.5 pr-3 text-left text-white shadow-xl shadow-black/10 transition hover:border-lime-300/30 hover:bg-white/[0.1]"
                                title="Family member · Managed by you"
                            >
                                <span className="relative">
                                    <FamilyAvatar member={member} />
                                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/70 opacity-0 transition group-hover/member:opacity-100">
                                        <Pencil
                                            className="h-4 w-4 text-lime-200"
                                            aria-hidden="true"
                                        />
                                    </span>
                                </span>
                                <span className="min-w-0">
                                    <span className="block max-w-28 truncate text-sm font-black">
                                        {member.name}
                                    </span>
                                    <span className="block max-w-28 truncate text-xs font-semibold text-lime-200/80">
                                        Managed by you
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <ShareTripModal
                tripId={tripId}
                tripTitle={tripTitle}
                open={isShareModalOpen}
                onOpenChange={setIsShareModalOpen}
                onInviteSent={() => router.refresh()}
                familyMembers={familyMembers}
                availableFamilyMembers={availableFamilyMembers}
                addFamilyMemberAction={addFamilyMemberAction}
            />

            {confirmingFriend ? (
                <Portal>
                    <div
                        className="vaivia-modal-backdrop"
                        onClick={() => {
                            if (!savingFriendUserId) setConfirmingFriend(null);
                        }}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="friend-add-title"
                            className="vaivia-modal-panel max-w-md"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="vaivia-modal-header flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <MemberAvatar member={confirmingFriend} />
                                    <div>
                                        <p className="vaivia-modal-eyebrow">
                                            Add friend
                                        </p>
                                        <h2
                                            id="friend-add-title"
                                            className="vaivia-modal-title"
                                        >
                                            Add {getDisplayName(confirmingFriend)}?
                                        </h2>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setConfirmingFriend(null)}
                                    disabled={Boolean(savingFriendUserId)}
                                    className="vaivia-modal-close"
                                    aria-label="Close friend invite confirmation"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>
                            <div className="vaivia-modal-body space-y-4">
                                <p className="text-sm font-semibold leading-6 text-slate-700">
                                    VAIVIA will send them a friend request. They can
                                    accept or decline before either of you can see each
                                    other’s friend-only profile details.
                                </p>

                                {friendActionError ? (
                                    <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
                                        {friendActionError}
                                    </p>
                                ) : null}

                                <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setConfirmingFriend(null)}
                                        disabled={Boolean(savingFriendUserId)}
                                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => sendFriendInvite(confirmingFriend)}
                                        disabled={Boolean(savingFriendUserId)}
                                        className="inline-flex items-center gap-2 rounded-xl bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {savingFriendUserId ? (
                                            <Loader2
                                                className="h-4 w-4 animate-spin"
                                                aria-hidden="true"
                                            />
                                        ) : (
                                            <UserPlus
                                                className="h-4 w-4"
                                                aria-hidden="true"
                                            />
                                        )}
                                        Send invite
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </Portal>
            ) : null}

            {cancelFriendInviteTarget ? (
                <Portal>
                    <div
                        className="vaivia-modal-backdrop"
                        onClick={() => {
                            if (!savingFriendUserId) setCancelFriendInviteTarget(null);
                        }}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="friend-invite-cancel-title"
                            className="vaivia-modal-panel max-w-md"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="vaivia-modal-header flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <MemberAvatar member={cancelFriendInviteTarget} />
                                    <div>
                                        <p className="vaivia-modal-eyebrow">
                                            Pending friend invite
                                        </p>
                                        <h2
                                            id="friend-invite-cancel-title"
                                            className="vaivia-modal-title"
                                        >
                                            Cancel this friend invite?
                                        </h2>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setCancelFriendInviteTarget(null)}
                                    disabled={Boolean(savingFriendUserId)}
                                    className="vaivia-modal-close"
                                    aria-label="Close friend invitation cancellation"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>
                            <div className="vaivia-modal-body space-y-4">
                                <p className="text-sm font-semibold leading-6 text-slate-700">
                                    This will rescind the pending friend request to{" "}
                                    {getDisplayName(cancelFriendInviteTarget)}.
                                </p>

                                {friendActionError ? (
                                    <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
                                        {friendActionError}
                                    </p>
                                ) : null}

                                <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setCancelFriendInviteTarget(null)}
                                        disabled={Boolean(savingFriendUserId)}
                                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                    >
                                        Keep invite
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            rescindFriendInvite(cancelFriendInviteTarget)
                                        }
                                        disabled={Boolean(savingFriendUserId)}
                                        className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-black text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {savingFriendUserId ? (
                                            <Loader2
                                                className="h-4 w-4 animate-spin"
                                                aria-hidden="true"
                                            />
                                        ) : null}
                                        Cancel invite
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </Portal>
            ) : null}

            {cancelTripInviteTarget ? (
                <Portal>
                    <div
                        className="vaivia-modal-backdrop"
                        onClick={() => {
                            if (!isCancellingTripInvite) setCancelTripInviteTarget(null);
                        }}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="trip-invite-cancel-title"
                            className="vaivia-modal-panel max-w-md"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="vaivia-modal-header flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white/15 bg-slate-950 text-sm font-black uppercase text-lime-200 shadow-[0_0_24px_rgba(0,0,0,0.26)]">
                                        {getInvitationInitial(cancelTripInviteTarget)}
                                    </span>
                                    <div>
                                        <p className="vaivia-modal-eyebrow">
                                            Pending invite
                                        </p>
                                        <h2
                                            id="trip-invite-cancel-title"
                                            className="vaivia-modal-title"
                                        >
                                            Cancel this trip invite?
                                        </h2>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setCancelTripInviteTarget(null)}
                                    disabled={isCancellingTripInvite}
                                    className="vaivia-modal-close"
                                    aria-label="Close trip invitation cancellation"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>
                            <div className="vaivia-modal-body space-y-4">
                                <p className="text-sm font-semibold leading-6 text-slate-700">
                                    This will rescind the pending invite
                                    {cancelTripInviteTarget.label
                                        ? ` for ${cancelTripInviteTarget.label}`
                                        : ""}
                                    . They will no longer be able to accept it.
                                </p>

                                {tripInviteCancelError ? (
                                    <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
                                        {tripInviteCancelError}
                                    </p>
                                ) : null}

                                <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setCancelTripInviteTarget(null)}
                                        disabled={isCancellingTripInvite}
                                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                    >
                                        Keep invite
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            cancelTripInvitation(cancelTripInviteTarget)
                                        }
                                        disabled={isCancellingTripInvite}
                                        className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-black text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isCancellingTripInvite ? (
                                            <Loader2
                                                className="h-4 w-4 animate-spin"
                                                aria-hidden="true"
                                            />
                                        ) : null}
                                        Cancel invite
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </Portal>
            ) : null}

            {selectedMember ? (
                <Portal>
                    <div
                        className="vaivia-modal-backdrop"
                        onClick={() => setSelectedMember(null)}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="trip-member-title"
                            className="vaivia-modal-panel max-w-md"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="vaivia-modal-header flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <MemberAvatar member={selectedMember} />
                                    <div>
                                        <p className="vaivia-modal-eyebrow">
                                            Trip member
                                        </p>
                                        <h2
                                            id="trip-member-title"
                                            className="vaivia-modal-title"
                                        >
                                            {getDisplayName(selectedMember)}
                                        </h2>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedMember(null)}
                                    className="vaivia-modal-close"
                                    aria-label="Close member details"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>

                            <div className="vaivia-modal-body space-y-5">
                                <dl className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                        <dt className="text-xs font-black uppercase tracking-wide text-slate-500">
                                            First name
                                        </dt>
                                        <dd className="mt-1 text-sm font-semibold text-slate-900">
                                            {selectedMember.first_name || "Not set"}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-black uppercase tracking-wide text-slate-500">
                                            Last name
                                        </dt>
                                        <dd className="mt-1 text-sm font-semibold text-slate-900">
                                            {selectedMember.last_name || "Not set"}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-black uppercase tracking-wide text-slate-500">
                                            Username
                                        </dt>
                                        <dd className="mt-1 text-sm font-semibold text-slate-900">
                                            {selectedMember.username
                                                ? `@${selectedMember.username}`
                                                : "Not set"}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-black uppercase tracking-wide text-slate-500">
                                            Joined trip
                                        </dt>
                                        <dd className="mt-1 text-sm font-semibold text-slate-900">
                                            {formatJoinedDate(selectedMember.joined_at)}
                                        </dd>
                                    </div>
                                </dl>

                                {confirmingDelete ? (
                                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                                        <p className="font-black">
                                            Remove this person from the trip?
                                        </p>
                                        <p className="mt-1 text-red-800">
                                            They will lose access to shared trip details.
                                        </p>
                                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setConfirmingDelete(false)}
                                                className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-800 transition hover:bg-red-100"
                                            >
                                                Cancel
                                            </button>
                                            <form action={handleRemoveMember}>
                                                <input
                                                    type="hidden"
                                                    name="trip_id"
                                                    value={tripId}
                                                />
                                                <input
                                                    type="hidden"
                                                    name="member_user_id"
                                                    value={selectedMember.user_id}
                                                />
                                                <button
                                                    type="submit"
                                                    disabled={isRemovingMember}
                                                    className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800"
                                                >
                                                    {isRemovingMember ? (
                                                        <Loader2
                                                            className="h-4 w-4 animate-spin"
                                                            aria-hidden="true"
                                                        />
                                                    ) : (
                                                        <Trash2
                                                            className="h-4 w-4"
                                                            aria-hidden="true"
                                                        />
                                                    )}
                                                    {isRemovingMember ? "Removing" : "Delete"}
                                                </button>
                                            </form>
                                        </div>
                                        {removeMemberError ? (
                                            <p className="mt-3 text-sm font-semibold text-red-700">
                                                {removeMemberError}
                                            </p>
                                        ) : null}
                                    </div>
                                ) : null}

                                <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
                                    {canRemoveSelectedMember ? (
                                        <button
                                            type="button"
                                            onClick={() => setConfirmingDelete(true)}
                                            className="inline-flex items-center gap-2 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                                        >
                                            <Trash2
                                                className="h-4 w-4"
                                                aria-hidden="true"
                                            />
                                            Delete
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={() => setSelectedMember(null)}
                                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </Portal>
            ) : null}

            {selectedFamilyMember ? (
                <Portal>
                    <div
                        className="vaivia-modal-backdrop"
                        onClick={() => setSelectedFamilyMember(null)}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="trip-family-member-title"
                            className="vaivia-modal-panel max-w-md"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="vaivia-modal-header flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <FamilyAvatar member={selectedFamilyMember} />
                                    <div>
                                        <p className="vaivia-modal-eyebrow">
                                            Managed by you
                                        </p>
                                        <h2
                                            id="trip-family-member-title"
                                            className="vaivia-modal-title"
                                        >
                                            {selectedFamilyMember.name}
                                        </h2>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedFamilyMember(null)}
                                    className="vaivia-modal-close"
                                    aria-label="Close family member details"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>

                            <div className="vaivia-modal-body space-y-5">
                                <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <FamilyAvatar member={selectedFamilyMember} />
                                    <div className="min-w-0">
                                        <p className="truncate text-lg font-black text-slate-950">
                                            {selectedFamilyMember.name}
                                        </p>
                                        <p className="mt-1 text-sm font-semibold text-slate-500">
                                            Managed by you
                                        </p>
                                        {selectedFamilyMember.relationship ? (
                                            <p className="mt-1 text-sm font-semibold text-slate-700">
                                                {selectedFamilyMember.relationship}
                                            </p>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
                                    {removeFamilyMemberAction ? (
                                        <form action={handleRemoveFamilyMember}>
                                            <input
                                                type="hidden"
                                                name="trip_id"
                                                value={tripId}
                                            />
                                            <input
                                                type="hidden"
                                                name="family_member_id"
                                                value={
                                                    selectedFamilyMember.family_member_id
                                                }
                                            />
                                            <button
                                                type="submit"
                                                disabled={isRemovingFamilyMember}
                                                className="inline-flex items-center gap-2 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                                            >
                                                {isRemovingFamilyMember ? (
                                                    <Loader2
                                                        className="h-4 w-4 animate-spin"
                                                        aria-hidden="true"
                                                    />
                                                ) : (
                                                    <Trash2
                                                        className="h-4 w-4"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                                {isRemovingFamilyMember
                                                    ? "Removing"
                                                    : "Delete"}
                                            </button>
                                        </form>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={() => setSelectedFamilyMember(null)}
                                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                    >
                                        Close
                                    </button>
                                </div>
                                {removeFamilyMemberError ? (
                                    <p className="text-sm font-semibold text-red-700">
                                        {removeFamilyMemberError}
                                    </p>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </Portal>
            ) : null}
        </>
    );
}
