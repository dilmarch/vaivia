"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FriendInviteReviewModal from "@/components/FriendInviteReviewModal";
import PassportStampShareReviewModal from "@/components/PassportStampShareReviewModal";
import TripInviteReviewModal from "@/components/TripInviteReviewModal";
import type { AppNotification } from "@/components/AppTopActionBar";

type NotificationActionButtonProps = {
    notification: AppNotification;
};

export default function NotificationActionButton({
    notification,
}: NotificationActionButtonProps) {
    const router = useRouter();
    const [activeNotification, setActiveNotification] =
        useState<AppNotification | null>(null);

    function handleHandled() {
        setActiveNotification(null);
        router.refresh();
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setActiveNotification(notification)}
                className="inline-flex h-9 items-center rounded-full bg-lime-300 px-4 text-xs font-black uppercase tracking-[0.12em] text-slate-950 transition hover:bg-lime-200"
            >
                Review
            </button>
            <TripInviteReviewModal
                notification={
                    activeNotification?.type === "trip_invite_received"
                        ? activeNotification
                        : null
                }
                open={activeNotification?.type === "trip_invite_received"}
                onOpenChange={(open) => {
                    if (!open) setActiveNotification(null);
                }}
                onHandled={handleHandled}
            />
            <FriendInviteReviewModal
                notification={
                    activeNotification?.type === "friend_request_received"
                        ? activeNotification
                        : null
                }
                open={activeNotification?.type === "friend_request_received"}
                onOpenChange={(open) => {
                    if (!open) setActiveNotification(null);
                }}
                onHandled={handleHandled}
            />
            <PassportStampShareReviewModal
                notification={
                    activeNotification?.type === "passport_stamp_share_received"
                        ? activeNotification
                        : null
                }
                open={
                    activeNotification?.type ===
                    "passport_stamp_share_received"
                }
                onOpenChange={(open) => {
                    if (!open) setActiveNotification(null);
                }}
                onHandled={handleHandled}
            />
        </>
    );
}
