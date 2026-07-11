import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import TripCountdown from "@/components/TripCountdown";
import TripDestinationLine from "@/components/TripDestinationLine";
import TripDocumentTitle from "@/components/TripDocumentTitle";
import TripHeaderCover from "@/components/TripHeaderCover";
import TripMembersPanel, {
    type TripHeaderFamilyMember,
    type TripHeaderInvitation,
    type TripHeaderMember,
} from "@/components/TripMembersPanel";
import { createClient } from "@/lib/supabase/server";

type TripPageHeroProps = {
    tripId: string;
    pageLabel?: string;
    revalidatePathname?: string;
    summaryContent?: ReactNode;
};

type TripUpdatePayload = {
    title: string;
    destination: string;
    start_date: string | null;
    end_date: string | null;
    cover_image_url?: string | null;
    notes: string;
};

function getPendingInvitationLabel(invitation: Record<string, unknown>) {
    const labelCandidates = [
        invitation.invitee_identifier,
        invitation.invitee_email,
        invitation.invitee_username,
        invitation.email,
        invitation.username,
        invitation.target_email,
        invitation.target_username,
    ];

    const directLabel = labelCandidates.find(
        (candidate): candidate is string =>
            typeof candidate === "string" && candidate.trim().length > 0
    );

    return directLabel?.trim() || "Invited guest";
}

function formatTripDate(dateString?: string | null) {
    if (!dateString) return "Not set";
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "Not set";

    return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

function isMissingTripCoverColumnError(error: { code?: string; message?: string }) {
    const message = error.message?.toLowerCase() || "";

    return (
        error.code === "42703" ||
        error.code === "PGRST204" ||
        (message.includes("column") &&
            (message.includes("cover_image_url") ||
                message.includes("schema cache")))
    );
}

function removeTripCoverColumn(payload: TripUpdatePayload) {
    const { cover_image_url: _coverImageUrl, ...fallbackPayload } = payload;
    void _coverImageUrl;
    return fallbackPayload;
}

async function updateTrip(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const revalidatePathname = String(formData.get("revalidate_path") || "");
    const coverImageUrl = String(formData.get("cover_image_url") || "").trim();
    const payload: TripUpdatePayload = {
        title: String(formData.get("title") || ""),
        destination: String(formData.get("destination") || ""),
        start_date: String(formData.get("start_date") || "") || null,
        end_date: String(formData.get("end_date") || "") || null,
        cover_image_url: coverImageUrl || null,
        notes: String(formData.get("notes") || ""),
    };

    let { error } = await supabase.from("trips").update(payload).eq("id", tripId);

    if (error && isMissingTripCoverColumnError(error)) {
        ({ error } = await supabase
            .from("trips")
            .update(removeTripCoverColumn(payload))
            .eq("id", tripId));
    }

    if (error) {
        console.error("Error updating trip from shared trip hero:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
        });
        throw new Error("Could not update trip");
    }

    revalidatePath(revalidatePathname || `/trips/${tripId}`);
}

async function deleteTrip(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");

    const { error } = await supabase
        .from("trips")
        .delete()
        .eq("id", tripId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error deleting trip from shared trip hero:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
        });
        throw new Error("Could not delete trip");
    }

    redirect("/");
}

async function removeTripMember(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const memberUserId = String(formData.get("member_user_id") || "");
    const revalidatePathname = String(formData.get("revalidate_path") || "");

    if (!tripId || !memberUserId || memberUserId === user.id) {
        throw new Error("Could not remove trip member");
    }

    const { error } = await supabase
        .from("trip_members")
        .delete()
        .eq("trip_id", tripId)
        .eq("user_id", memberUserId);

    if (error) {
        console.error("Error removing trip member:", error);
        throw new Error("Could not remove trip member");
    }

    revalidatePath(revalidatePathname || `/trips/${tripId}`);
}

async function addTripFamilyMember(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const revalidatePathname = String(formData.get("revalidate_path") || "");
    const familyMemberIds = Array.from(
        new Set(
            formData
                .getAll("family_member_id")
                .map((value) => String(value || "").trim())
                .filter(Boolean)
        )
    );

    if (familyMemberIds.length === 0) return;

    const { error } = await supabase.from("trip_family_members").upsert(
        familyMemberIds.map((familyMemberId) => ({
            trip_id: tripId,
            family_member_id: familyMemberId,
            added_by: user.id,
            status: "going",
            updated_at: new Date().toISOString(),
        })),
        { onConflict: "trip_id,family_member_id" }
    );

    if (error) {
        console.error("Error adding family member to trip:", error);
        throw new Error("Could not add family member to trip");
    }

    revalidatePath(revalidatePathname || `/trips/${tripId}`);
}

async function removeTripFamilyMember(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const tripId = String(formData.get("trip_id") || "");
    const familyMemberId = String(formData.get("family_member_id") || "");
    const revalidatePathname = String(formData.get("revalidate_path") || "");

    const { error } = await supabase
        .from("trip_family_members")
        .update({ status: "removed", updated_at: new Date().toISOString() })
        .eq("trip_id", tripId)
        .eq("family_member_id", familyMemberId);

    if (error) {
        console.error("Error removing family member from trip:", error);
        throw new Error("Could not remove family member from trip");
    }

    revalidatePath(revalidatePathname || `/trips/${tripId}`);
}

export default async function TripPageHero({
    tripId,
    pageLabel,
    revalidatePathname,
    summaryContent,
}: TripPageHeroProps) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("*")
        .eq("id", tripId)
        .single();

    if (tripError || !trip) notFound();

    const tripRecord = trip as {
        id: string;
        title: string;
        destination?: string | null;
        start_date?: string | null;
        end_date?: string | null;
        notes?: string | null;
        user_id?: string | null;
        created_at?: string | null;
    };

    const { data: tripMemberRows } = await supabase
        .from("trip_members")
        .select("id,user_id,role,status,created_at")
        .eq("trip_id", tripId)
        .eq("status", "active");

    const memberRows = (tripMemberRows || []) as Array<{
        id?: string | null;
        user_id?: string | null;
        role?: string | null;
        created_at?: string | null;
    }>;
    const memberRowsByUserId = new Map(
        memberRows
            .filter((member) => Boolean(member.user_id))
            .map((member) => [member.user_id as string, member])
    );
    const tripMemberUserIds = Array.from(
        new Set(
            [tripRecord.user_id, ...memberRows.map((member) => member.user_id)].filter(
                Boolean
            ) as string[]
        )
    );
    let tripMembers: TripHeaderMember[] = [];

    if (tripMemberUserIds.length > 0) {
        const { data: profileRows } = await supabase
            .from("user_profiles")
            .select("id,first_name,last_name,username,avatar_url")
            .in("id", tripMemberUserIds);

        const profilesById = new Map(
            ((profileRows || []) as Array<{
                id: string;
                first_name?: string | null;
                last_name?: string | null;
                username?: string | null;
                avatar_url?: string | null;
            }>).map((profile) => [profile.id, profile])
        );

        tripMembers = tripMemberUserIds.map((memberUserId) => {
            const profile = profilesById.get(memberUserId);
            const membership = memberRowsByUserId.get(memberUserId);

            return {
                user_id: memberUserId,
                first_name: profile?.first_name || null,
                last_name: profile?.last_name || null,
                username: profile?.username || null,
                avatar_url: profile?.avatar_url || null,
                joined_at:
                    membership?.created_at ||
                    (memberUserId === tripRecord.user_id
                        ? tripRecord.created_at || null
                        : null),
                role:
                    memberUserId === tripRecord.user_id
                        ? "owner"
                        : membership?.role || null,
            };
        });
    }

    const { data: userFamilyRows } = await supabase
        .from("user_family_members")
        .select("id,user_id,name,relationship,avatar_url,notes,created_at,updated_at")
        .eq("user_id", user.id)
        .order("name", { ascending: true });

    const { data: tripFamilyRows } = await supabase
        .from("trip_family_members")
        .select("id,trip_id,family_member_id,added_by,status,created_at,updated_at")
        .eq("trip_id", tripId)
        .eq("status", "going");

    const savedFamilyMembers = ((userFamilyRows || []) as Array<{
        id: string;
        name: string;
        relationship?: string | null;
        avatar_url?: string | null;
        notes?: string | null;
    }>).map(
        (member): TripHeaderFamilyMember => ({
            id: member.id,
            family_member_id: member.id,
            name: member.name,
            relationship: member.relationship || null,
            avatar_url: member.avatar_url || null,
            notes: member.notes || null,
            status: null,
        })
    );
    const savedFamilyById = new Map(
        savedFamilyMembers.map((member) => [member.family_member_id, member])
    );
    const tripFamilyMembers = ((tripFamilyRows || []) as Array<{
        id: string;
        family_member_id: string;
        created_at?: string | null;
        status?: string | null;
    }>)
        .map((row) => {
            const member = savedFamilyById.get(row.family_member_id);
            if (!member) return null;
            return {
                ...member,
                id: row.id,
                joined_at: row.created_at || null,
                status: row.status || "going",
            };
        })
        .filter(Boolean) as TripHeaderFamilyMember[];

    const { data: pendingInvitationRows } = await supabase
        .from("trip_invitations")
        .select("*")
        .eq("trip_id", tripId)
        .eq("status", "pending")
        .order("created_at", { ascending: true });

    const pendingInvitations: TripHeaderInvitation[] = (
        (pendingInvitationRows || []) as Array<Record<string, unknown>>
    ).map((invitation, index) => ({
        id:
            typeof invitation.id === "string"
                ? invitation.id
                : `${tripId}-pending-${index}`,
        label: getPendingInvitationLabel(invitation),
        created_at:
            typeof invitation.created_at === "string"
                ? invitation.created_at
                : null,
    }));

    return (
        <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
            <TripDocumentTitle
                title={tripRecord.title}
                destination={tripRecord.destination}
                startDate={tripRecord.start_date}
            />
            <TripHeaderCover
                trip={trip as Parameters<typeof TripHeaderCover>[0]["trip"]}
                updateTripAction={updateTrip}
                deleteTripAction={deleteTrip}
            >
                <div className="space-y-3">
                    {pageLabel ? (
                        <p className="w-fit rounded-full border border-lime-300/30 bg-lime-300 px-5 py-2 text-sm font-black uppercase tracking-[0.32em] text-slate-950 shadow-[0_0_32px_rgba(var(--vaivia-neon-rgb),0.28)]">
                            {pageLabel}
                        </p>
                    ) : null}
                    <h1 className="max-w-5xl text-5xl font-black tracking-tight text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.65)] sm:text-7xl lg:text-8xl">
                        {tripRecord.title || "Untitled trip"}
                    </h1>
                </div>
            </TripHeaderCover>

            <div className="mx-auto max-w-7xl p-5 sm:p-7">
                <div className="hidden sm:block">
                    {summaryContent ? (
                        <div className="flex flex-wrap items-center gap-4">
                            {summaryContent}
                            <span className="hidden h-14 w-px bg-white/10 lg:block" />
                            <TripMembersPanel
                                tripId={tripRecord.id}
                                tripTitle={tripRecord.title}
                                members={tripMembers}
                                familyMembers={tripFamilyMembers}
                                availableFamilyMembers={savedFamilyMembers}
                                invitations={pendingInvitations}
                                currentUserId={user.id}
                                tripOwnerId={tripRecord.user_id}
                                removeMemberAction={removeTripMember}
                                addFamilyMemberAction={addTripFamilyMember}
                                removeFamilyMemberAction={removeTripFamilyMember}
                            />
                        </div>
                    ) : (
                        <TripDestinationLine destination={tripRecord.destination}>
                        <TripMembersPanel
                            tripId={tripRecord.id}
                            tripTitle={tripRecord.title}
                            members={tripMembers}
                            familyMembers={tripFamilyMembers}
                            availableFamilyMembers={savedFamilyMembers}
                            invitations={pendingInvitations}
                            currentUserId={user.id}
                            tripOwnerId={tripRecord.user_id}
                            removeMemberAction={removeTripMember}
                            addFamilyMemberAction={addTripFamilyMember}
                            removeFamilyMemberAction={removeTripFamilyMember}
                        />
                        </TripDestinationLine>
                    )}
                </div>

                <div className="mt-6 hidden gap-4 sm:grid lg:grid-cols-[1fr_1fr_minmax(280px,0.9fr)] lg:items-stretch">
                    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/15">
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
                            Departing:
                        </p>
                        <p className="mt-2 text-2xl font-black tracking-tight text-white">
                            {formatTripDate(tripRecord.start_date)}
                        </p>
                    </div>
                    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/15">
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
                            Returning:
                        </p>
                        <p className="mt-2 text-2xl font-black tracking-tight text-white">
                            {formatTripDate(tripRecord.end_date)}
                        </p>
                    </div>
                    <div className="relative overflow-hidden rounded-[1.35rem] border border-lime-300/30 bg-lime-300 p-5 text-slate-950 shadow-[0_0_50px_rgba(var(--vaivia-neon-rgb),0.24)]">
                        <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/35 blur-2xl" />
                        <div className="absolute -bottom-12 left-8 h-24 w-24 rounded-full bg-fuchsia-400/20 blur-2xl" />
                        <TripCountdown startDate={tripRecord.start_date} />
                    </div>
                </div>

                {tripRecord.notes ? (
                    <p className="mt-5 rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 text-sm font-medium leading-6 text-slate-300">
                        {tripRecord.notes}
                    </p>
                ) : null}
            </div>
        </header>
    );
}
