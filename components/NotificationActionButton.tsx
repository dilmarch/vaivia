"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FriendInviteReviewModal from "@/components/FriendInviteReviewModal";
import PassportStampShareReviewModal from "@/components/PassportStampShareReviewModal";
import TripInviteReviewModal from "@/components/TripInviteReviewModal";
import type { AppNotification } from "@/components/AppTopActionBar";
import { createClient } from "@/lib/supabase/client";

type NotificationActionButtonProps = {
    notification: AppNotification;
};

export default function NotificationActionButton({
    notification,
}: NotificationActionButtonProps) {
    const router = useRouter();
    const [activeNotification, setActiveNotification] =
        useState<AppNotification | null>(null);
    const [isRouting, setIsRouting] = useState(false);

    function handleHandled() {
        setActiveNotification(null);
        router.refresh();
    }

    async function handleRoutedAction() {
        const importId =
            typeof notification.metadata?.importId === "string"
                ? notification.metadata.importId
                : "";
        const href =
            notification.type === "travel_email_ready" ||
            notification.type === "travel_email_needs_review" ||
            notification.type === "travel_email_failed"
                ? importId
                    ? `/imports/${importId}`
                    : "/imports"
                : notification.type === "profile_onboarding_prompt"
                  ? "/profile#passport-stamps"
                  : notification.type === "theme_exploration_prompt"
                    ? "/settings"
                    : "";

        if (!href) {
            setActiveNotification(notification);
            return;
        }

        setIsRouting(true);
        const supabase = createClient();
        const { error } = await supabase.rpc("mark_app_alert_read", {
            alert_id: notification.id,
        });
        setIsRouting(false);

        if (error) {
            console.warn("Could not mark notification read:", {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
            });
            return;
        }

        router.push(href);
        router.refresh();
    }

    return (
        <>
            <button
                type="button"
                onClick={() => void handleRoutedAction()}
                disabled={isRouting}
                className="inline-flex h-9 items-center rounded-full bg-lime-300 px-4 text-xs font-black uppercase tracking-[0.12em] text-slate-950 transition hover:bg-lime-200"
            >
                {isRouting ? "Opening..." : "Review"}
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
