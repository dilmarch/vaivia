"use client";

import { useState } from "react";
import { Send, X } from "lucide-react";
import Portal from "@/components/Portal";
import { createClient } from "@/lib/supabase/client";

type ShareTripModalProps = {
    tripId: string;
    tripTitle?: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

function getInviteErrorMessage(error: { message?: string } | null) {
    const message = error?.message?.toLowerCase() || "";

    if (message.includes("duplicate") || message.includes("already")) {
        return "An invitation is already pending for this user.";
    }

    return "Could not send invite. Please try again.";
}

export default function ShareTripModal({
    tripId,
    tripTitle,
    open,
    onOpenChange,
}: ShareTripModalProps) {
    const [invitee, setInvitee] = useState("");
    const [consentChecked, setConsentChecked] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const canSubmit = invitee.trim() && consentChecked && !isSubmitting;

    if (!open) return null;

    async function sendInvite(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!canSubmit) return;

        const supabase = createClient();
        setIsSubmitting(true);
        setErrorMessage("");
        setSuccessMessage("");

        const { error } = await supabase.rpc("create_trip_invitation", {
            target_trip_id: tripId,
            invitee_identifier: invitee.trim(),
            consent_confirmed: consentChecked,
        });

        if (error) {
            setErrorMessage(getInviteErrorMessage(error));
        } else {
            setInvitee("");
            setConsentChecked(false);
            setSuccessMessage(
                "If this user exists, they will receive an invitation to join your trip. If this user doesn't have an account, they will be invited to create one."
            );
        }

        setIsSubmitting(false);
    }

    return (
        <Portal>
            <div
                className="vaivia-modal-backdrop"
                onClick={() => onOpenChange(false)}
            >
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="share-trip-title"
                    className="vaivia-modal-panel max-w-lg"
                    onClick={(event) => event.stopPropagation()}
                >
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
                            onClick={() => onOpenChange(false)}
                            className="vaivia-modal-close"
                            aria-label="Close share trip"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>

                    <form onSubmit={sendInvite} className="vaivia-modal-body space-y-5">
                        <p className="text-sm leading-6 text-slate-600">
                            Invite a friend to collaborate on this trip. They’ll be able
                            to view and update trip details, except for activities marked
                            private.
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
                                onChange={(event) => setInvitee(event.target.value)}
                                placeholder="name@example.com or username"
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                                autoComplete="off"
                                data-form-type="other"
                                data-lpignore="true"
                                data-1p-ignore="true"
                            />
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
                                I consent to sharing all trip details with this user,
                                except for any activities marked private.
                            </span>
                        </label>

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
                            <button
                                type="button"
                                onClick={() => onOpenChange(false)}
                                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!canSubmit}
                                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Send className="h-4 w-4" aria-hidden="true" />
                                {isSubmitting ? "Sending..." : "Send invite"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Portal>
    );
}
