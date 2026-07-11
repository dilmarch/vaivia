"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, X } from "lucide-react";
import AnimatedModal from "@/components/AnimatedModal";
import Portal from "@/components/Portal";
import { createClient } from "@/lib/supabase/client";
import type { TripHeaderFamilyMember } from "@/components/TripMembersPanel";

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
    onInviteSent,
    familyMembers = [],
    availableFamilyMembers = [],
    addFamilyMemberAction,
}: ShareTripModalProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<"invite" | "family">("invite");
    const [invitee, setInvitee] = useState("");
    const [consentChecked, setConsentChecked] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAddingFamily, setIsAddingFamily] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [selectedFamilyIds, setSelectedFamilyIds] = useState<Set<string>>(
        () => new Set()
    );
    const canSubmit = invitee.trim() && consentChecked && !isSubmitting;
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
            onInviteSent?.();
        }

        setIsSubmitting(false);
    }

    async function addSelectedFamily(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
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
            onOpenChange(false);
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
                        <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1">
                            <button
                                type="button"
                                onClick={() => setActiveTab("invite")}
                                className={`rounded-full px-4 py-2 text-sm font-black transition ${
                                    activeTab === "invite"
                                        ? "bg-slate-950 text-white"
                                        : "text-slate-600 hover:text-slate-950"
                                }`}
                            >
                                Invite a Friend
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab("family")}
                                className={`rounded-full px-4 py-2 text-sm font-black transition ${
                                    activeTab === "family"
                                        ? "bg-slate-950 text-white"
                                        : "text-slate-600 hover:text-slate-950"
                                }`}
                            >
                                Add From Your Family
                            </button>
                        </div>

                        {activeTab === "invite" ? (
                            <form onSubmit={sendInvite} className="space-y-5">
                                <p className="text-sm leading-6 text-slate-600">
                                    Invite a friend to collaborate on this trip. They’ll
                                    be able to view and update trip details, except for
                                    activities marked private.
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
                                        I consent to sharing all trip details with this
                                        user, except for any activities marked private.
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
                                        <Send className="h-4 w-4" aria-hidden="true" />
                                        {isSubmitting ? "Sending..." : "Send invite"}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <form onSubmit={addSelectedFamily} className="space-y-5">
                                <p className="text-sm leading-6 text-slate-600">
                                    Select saved family members to add them to Going for
                                    this trip.
                                </p>

                                <div className="space-y-3">
                                    {selectableFamilyMembers.length > 0 ? (
                                        selectableFamilyMembers.map((member) => {
                                            const isSelected =
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
                                                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition ${
                                                        isSelected
                                                            ? "border-lime-300 bg-lime-50 text-slate-950"
                                                            : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                                                    }`}
                                                >
                                                    <span className="min-w-0">
                                                        <span className="block truncate text-sm font-black">
                                                            {member.name}
                                                        </span>
                                                        <span className="block truncate text-xs font-semibold text-slate-500">
                                                            {member.relationship ||
                                                                "Family member"}
                                                        </span>
                                                    </span>
                                                    <span
                                                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                                            isSelected
                                                                ? "border-slate-950 bg-slate-950"
                                                                : "border-slate-300 bg-white"
                                                        }`}
                                                    >
                                                        {isSelected ? (
                                                            <span className="h-2 w-2 rounded-full bg-lime-300" />
                                                        ) : null}
                                                    </span>
                                                </button>
                                            );
                                        })
                                    ) : (
                                        <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                                            All saved family members are already going,
                                            or you have not added any family members yet.
                                        </p>
                                    )}
                                </div>

                                {errorMessage ? (
                                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                                        {errorMessage}
                                    </p>
                                ) : null}

                                <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
                                    <button
                                        type="button"
                                        onClick={requestClose}
                                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!canAddFamily}
                                        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {isAddingFamily ? "Saving..." : "Save"}
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
