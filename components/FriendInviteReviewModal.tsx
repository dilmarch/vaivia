"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import AnimatedModal from "@/components/AnimatedModal";
import Portal from "@/components/Portal";
import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/components/AppTopActionBar";

type FriendInviteReviewModalProps = {
    notification: AppNotification | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onHandled?: () => void;
};

type FriendshipDetails = {
    id: string;
    status: string | null;
    addressee_identifier: string | null;
    requester_user_id: string | null;
};

function getFriendshipId(notification: AppNotification | null) {
    const value = notification?.metadata?.friendshipId;
    return typeof value === "string" ? value : "";
}

export default function FriendInviteReviewModal({
    notification,
    open,
    onOpenChange,
    onHandled,
}: FriendInviteReviewModalProps) {
    const [friendship, setFriendship] = useState<FriendshipDetails | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        if (!open || !notification) return;
        const friendshipId = getFriendshipId(notification);
        if (!friendshipId) return;

        async function loadFriendship() {
            const supabase = createClient();
            setIsLoading(true);
            setErrorMessage("");

            const { data, error } = await (supabase.from as any)("user_friendships")
                .select("id,status,addressee_identifier,requester_user_id")
                .eq("id", friendshipId)
                .maybeSingle();

            if (error) {
                setErrorMessage("Could not load this friend request.");
            } else {
                setFriendship(data as unknown as FriendshipDetails | null);
            }

            setIsLoading(false);
        }

        void loadFriendship();
    }, [notification, open]);

    if (!open || !notification) return null;

    async function handleFriendRequest(nextStatus: "accepted" | "declined") {
        const friendshipId = friendship?.id || getFriendshipId(notification);
        const notificationId = notification?.id;
        if (!friendshipId || !notificationId) return;

        const supabase = createClient();
        setIsSubmitting(true);
        setErrorMessage("");

        const { error } = await supabase.rpc("respond_to_friend_invitation", {
            friendship_id: friendshipId,
            next_status: nextStatus,
        });

        if (error) {
            setErrorMessage("Could not update this friend request. Please try again.");
        } else {
            await supabase.rpc("mark_app_alert_read", {
                alert_id: notificationId,
            });
            onHandled?.();
            onOpenChange(false);
        }

        setIsSubmitting(false);
    }

    return (
        <Portal>
            <AnimatedModal
                onClose={() => onOpenChange(false)}
                panelClassName="max-w-lg"
                labelledBy="friend-invite-review-title"
            >
                {({ requestClose }) => (
                    <>
                        <div className="vaivia-modal-header flex items-start justify-between gap-4">
                            <div>
                                <p className="vaivia-modal-eyebrow">Friends</p>
                                <h2
                                    id="friend-invite-review-title"
                                    className="vaivia-modal-title"
                                >
                                    Friend request
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={requestClose}
                                className="vaivia-modal-close"
                                aria-label="Close friend request"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>

                        <div className="vaivia-modal-body space-y-5">
                            {isLoading ? (
                                <p className="text-sm text-slate-600">
                                    Loading friend request...
                                </p>
                            ) : friendship?.status && friendship.status !== "pending" ? (
                                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                                    This friend request has already been handled.
                                </p>
                            ) : (
                                <>
                                    <p className="text-sm leading-6 text-slate-600">
                                        {notification.body ||
                                            "Someone added you as a friend on VAIVIA."}
                                    </p>

                                    {errorMessage ? (
                                        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                                            {errorMessage}
                                        </p>
                                    ) : null}

                                    <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
                                        <button
                                            type="button"
                                            onClick={() => handleFriendRequest("declined")}
                                            disabled={isSubmitting}
                                            className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            Decline
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleFriendRequest("accepted")}
                                            disabled={isSubmitting}
                                            className="rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isSubmitting ? "Saving..." : "Accept"}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </>
                )}
            </AnimatedModal>
        </Portal>
    );
}
