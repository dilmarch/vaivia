"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import AnimatedModal from "@/components/AnimatedModal";
import Portal from "@/components/Portal";
import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/components/AppTopActionBar";

type TripInviteReviewModalProps = {
    notification: AppNotification | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onHandled?: () => void;
};

type InvitationDetails = {
    id: string;
    status: string | null;
    created_at: string | null;
    trip_id: string | null;
    invitation_scope?: "whole_trip" | "custom_dates" | "selected_legs" | null;
    invited_start_date?: string | null;
    invited_end_date?: string | null;
    trips:
        | {
              id: string;
              title: string | null;
              destination: string | null;
              start_date: string | null;
              end_date: string | null;
              cover_image_url: string | null;
          }
        | {
              id: string;
              title: string | null;
              destination: string | null;
              start_date: string | null;
              end_date: string | null;
              cover_image_url: string | null;
          }[]
        | null;
};

function formatDateRange(start?: string | null, end?: string | null) {
    return [start, end].filter(Boolean).join(" - ") || "Dates not set";
}

function getTrip(invitation: InvitationDetails | null) {
    if (!invitation?.trips) return null;
    return Array.isArray(invitation.trips)
        ? invitation.trips[0] || null
        : invitation.trips;
}

export default function TripInviteReviewModal({
    notification,
    open,
    onOpenChange,
    onHandled,
}: TripInviteReviewModalProps) {
    const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const trip = getTrip(invitation);

    useEffect(() => {
        if (!open || !notification?.invitation_id) return;
        const invitationId = notification.invitation_id;

        async function loadInvitation() {
            const supabase = createClient();
            setIsLoading(true);
            setErrorMessage("");

            const { data, error } = await supabase
                .from("trip_invitations")
                .select(
                    `
                    id,
                    status,
                    created_at,
                    trip_id,
                    invitation_scope,
                    invited_start_date,
                    invited_end_date,
                    trips (
                        id,
                        title,
                        destination,
                        start_date,
                        end_date,
                        cover_image_url
                    )
                `
                )
                .eq("id", invitationId)
                .single();

            if (error) {
                setErrorMessage("Could not load this trip invitation.");
            } else {
                setInvitation(data as InvitationDetails);
            }

            setIsLoading(false);
        }

        void loadInvitation();
    }, [notification?.invitation_id, open]);

    if (!open || !notification) return null;

    async function handleInvite(action: "accept" | "decline") {
        if (!invitation || !notification) return;
        const notificationId = notification.id;

        const supabase = createClient();
        setIsSubmitting(true);
        setErrorMessage("");

        const { error } =
            action === "accept"
                ? await supabase.rpc("accept_trip_invitation_with_scope", {
                      target_invitation_id: invitation.id,
                      target_confirmed_start_date:
                          invitation.invited_start_date || null,
                      target_confirmed_end_date: invitation.invited_end_date || null,
                      target_personal_start_date:
                          invitation.invited_start_date || null,
                      target_personal_end_date: invitation.invited_end_date || null,
                      target_joining_leg_ids: null,
                  })
                : await supabase.rpc("decline_trip_invitation", {
                      invitation_id: invitation.id,
                  });

        if (error) {
            setErrorMessage(
                error.message ||
                    (action === "accept"
                        ? "Could not accept this invite. Please try again."
                        : "Could not decline this invite. Please try again.")
            );
        } else {
            await supabase.rpc("mark_app_alert_read", {
                alert_id: notificationId,
            });
            onHandled?.();
            onOpenChange(false);
            window.location.reload();
        }

        setIsSubmitting(false);
    }

    return (
        <Portal>
            <AnimatedModal
                onClose={() => onOpenChange(false)}
                panelClassName="max-w-lg"
                labelledBy="trip-invite-review-title"
            >
                {({ requestClose }) => (
                    <>
                    <div className="vaivia-modal-header flex items-start justify-between gap-4">
                        <div>
                            <p className="vaivia-modal-eyebrow">Invitation</p>
                            <h2
                                id="trip-invite-review-title"
                                className="vaivia-modal-title"
                            >
                                Trip invitation
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="vaivia-modal-close"
                            aria-label="Close invitation"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>

                    <div className="vaivia-modal-body space-y-5">
                        {isLoading ? (
                            <p className="text-sm text-slate-600">
                                Loading invitation...
                            </p>
                        ) : invitation?.status && invitation.status !== "pending" ? (
                            <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                                This invitation has already been accepted or declined.
                            </p>
                        ) : (
                            <>
                                <p className="text-sm leading-6 text-slate-600">
                                    You’ve been invited to join this trip.
                                </p>

                                {trip ? (
                                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                                        {trip.cover_image_url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={trip.cover_image_url}
                                                alt=""
                                                className="h-36 w-full object-cover"
                                            />
                                        ) : null}
                                        <div className="p-4">
                                            <h3 className="text-lg font-black text-slate-950">
                                                {trip.title || "Untitled trip"}
                                            </h3>
                                            <p className="mt-1 text-sm text-slate-600">
                                                {trip.destination || "Destination not set"}
                                            </p>
                                            <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                                {formatDateRange(
                                                    trip.start_date,
                                                    trip.end_date
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                ) : null}
                            </>
                        )}

                        {errorMessage ? (
                            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                                {errorMessage}
                            </p>
                        ) : null}

                        <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
                            <button
                                type="button"
                                onClick={() => onOpenChange(false)}
                                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                                Close
                            </button>
                            {invitation?.status === "pending" ? (
                                <>
                                    <button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => handleInvite("decline")}
                                        className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                                    >
                                        Decline
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => handleInvite("accept")}
                                        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                                    >
                                        Accept invite
                                    </button>
                                </>
                            ) : null}
                        </div>
                    </div>
                    </>
                )}
            </AnimatedModal>
        </Portal>
    );
}
