"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import ShareTripModal from "@/components/ShareTripModal";
import type { TripHeaderFamilyMember } from "@/components/TripMembersPanel";

type MobileTripInviteLauncherProps = {
    tripId: string;
    tripTitle?: string | null;
    familyMembers?: TripHeaderFamilyMember[];
    availableFamilyMembers?: TripHeaderFamilyMember[];
    addFamilyMemberAction?: (formData: FormData) => Promise<void>;
};

export default function MobileTripInviteLauncher({
    tripId,
    tripTitle,
    familyMembers = [],
    availableFamilyMembers = [],
    addFamilyMemberAction,
}: MobileTripInviteLauncherProps) {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    setIsOpen(true);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-lime-300/30 bg-lime-300 px-4 py-2.5 text-sm font-black text-slate-950 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:bg-lime-200"
            >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Invite
            </button>

            <ShareTripModal
                tripId={tripId}
                tripTitle={tripTitle}
                open={isOpen}
                onOpenChange={setIsOpen}
                onInviteSent={() => router.refresh()}
                familyMembers={familyMembers}
                availableFamilyMembers={availableFamilyMembers}
                addFamilyMemberAction={addFamilyMemberAction}
            />
        </>
    );
}
