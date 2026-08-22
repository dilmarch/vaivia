import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isDateRangeOrdered } from "@/lib/dateRange";
import { removeTripMemberAsOwner } from "@/lib/tripMemberRemoval";
import type { Database } from "@/src/types/supabase";
import { TripLifecycleError } from "./lifecycle";

type TripSupabase = SupabaseClient<Database>;

function clean(value: unknown, max = 255) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function stringArray(value: unknown, max = 100) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => clean(item)).filter(Boolean))).slice(0, max)
    : [];
}

async function requireOwner(supabase: TripSupabase, tripId: string, userId: string) {
  const { data, error } = await supabase
    .from("trips")
    .select("id,user_id")
    .eq("id", tripId)
    .maybeSingle();
  if (error || !data) throw new TripLifecycleError("Trip not found.", "not_found", 404);
  if (data.user_id !== userId) {
    throw new TripLifecycleError("Only the trip owner can do that.", "forbidden", 403);
  }
  return data;
}

async function requireActiveMember(
  supabase: TripSupabase,
  tripId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("trip_members")
    .select("id,role,status")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) {
    throw new TripLifecycleError("You do not have access to this trip.", "forbidden", 403);
  }
  return data;
}

export async function loadTripCollaboration({
  supabase,
  userId,
  tripId,
}: {
  supabase: TripSupabase;
  userId: string;
  tripId: string;
}) {
  const membership = await requireActiveMember(supabase, tripId, userId);
  const [tripResult, membersResult, invitationsResult, familyLinksResult, familyResult, legsResult, assignmentsResult] =
    await Promise.all([
      supabase.from("trips").select("id,user_id,title").eq("id", tripId).single(),
      supabase
        .from("trip_members")
        .select("id,user_id,role,status,joined_at,personal_start_date,personal_end_date")
        .eq("trip_id", tripId)
        .eq("status", "active"),
      supabase
        .from("trip_invitations")
        .select("id,invited_user_id,invited_email,invited_username,status,created_at,invited_start_date,invited_end_date")
        .eq("trip_id", tripId)
        .eq("status", "pending"),
      supabase
        .from("trip_family_members")
        .select("id,family_member_id,status,created_at")
        .eq("trip_id", tripId)
        .neq("status", "removed"),
      supabase
        .from("user_family_members")
        .select("id,name,relationship,avatar_url,notes")
        .eq("user_id", userId),
      supabase
        .from("trip_legs")
        .select("id,name,start_date,end_date,country_code,google_place_id,sort_order")
        .eq("trip_id", tripId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("trip_member_legs")
        .select("id,trip_member_id,trip_leg_id,is_joining,start_date,end_date")
        .eq("trip_id", tripId),
    ]);
  const firstError = [tripResult, membersResult, invitationsResult, familyLinksResult, familyResult, legsResult, assignmentsResult]
    .map((result) => result.error)
    .find(Boolean);
  if (firstError || !tripResult.data) {
    throw new TripLifecycleError("Could not load trip collaboration.", "operation_failed", 500);
  }
  const userIds = (membersResult.data || []).map((member) => member.user_id);
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase
        .from("user_profiles")
        .select("id,first_name,last_name,username,email,avatar_url")
        .in("id", userIds)
    : { data: [], error: null };
  if (profilesError) {
    throw new TripLifecycleError("Could not load trip members.", "operation_failed", 500);
  }
  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const ownedFamilyById = new Map((familyResult.data || []).map((member) => [member.id, member]));
  return {
    trip: tripResult.data,
    permissions: {
      isOwner: tripResult.data.user_id === userId,
      canEdit: membership.status === "active",
      canInvite: membership.status === "active",
    },
    members: (membersResult.data || []).map((member) => ({
      ...member,
      profile: profilesById.get(member.user_id) || null,
    })),
    invitations: invitationsResult.data || [],
    familyMembers: (familyLinksResult.data || [])
      .map((link) => ({ ...link, profile: ownedFamilyById.get(link.family_member_id) || null }))
      .filter((link) => link.profile),
    availableFamilyMembers: familyResult.data || [],
    legs: legsResult.data || [],
    memberLegAssignments: assignmentsResult.data || [],
  };
}

export async function createTripInvitation({
  supabase,
  userId,
  tripId,
  input,
}: {
  supabase: TripSupabase;
  userId: string;
  tripId: string;
  input: Record<string, unknown>;
}) {
  await requireActiveMember(supabase, tripId, userId);
  const inviteeIdentifier = clean(input.inviteeIdentifier || input.invitee_identifier);
  if (!inviteeIdentifier) {
    throw new TripLifecycleError("Invitee email or username is required.", "validation_error", 422, {
      inviteeIdentifier: ["Enter an email or username."],
    });
  }
  if (input.consentConfirmed !== true && input.consent_confirmed !== true) {
    throw new TripLifecycleError("Confirm that you have permission to invite this person.", "validation_error", 422);
  }
  const { data, error } = await supabase.rpc("create_trip_invitation_with_assignments", {
    target_trip_id: tripId,
    invitee_identifier: inviteeIdentifier,
    consent_confirmed: true,
    target_leg_ids: stringArray(input.legIds || input.target_leg_ids),
    target_transportation_item_ids: stringArray(
      input.transportationItemIds || input.target_transportation_item_ids,
    ),
    target_accommodation_item_ids: stringArray(
      input.accommodationItemIds || input.target_accommodation_item_ids,
    ),
  });
  if (error || !data) {
    const text = error?.message?.toLowerCase() || "";
    throw new TripLifecycleError(
      text.includes("already") ? "This person already has a trip invitation." : "Could not send invitation.",
      text.includes("already") ? "conflict" : "operation_failed",
      text.includes("already") ? 409 : 500,
    );
  }
  return { invitationId: data };
}

export async function cancelTripInvitation({
  supabase,
  userId,
  tripId,
  invitationId,
}: {
  supabase: TripSupabase;
  userId: string;
  tripId: string;
  invitationId: string;
}) {
  await requireActiveMember(supabase, tripId, userId);
  const { data: invitation } = await supabase
    .from("trip_invitations")
    .select("id")
    .eq("id", invitationId)
    .eq("trip_id", tripId)
    .eq("status", "pending")
    .maybeSingle();
  if (!invitation) throw new TripLifecycleError("Invitation not found.", "not_found", 404);
  const { error } = await supabase.rpc("cancel_trip_invitation", { invitation_id: invitationId });
  if (error) throw new TripLifecycleError("Could not cancel invitation.", "operation_failed", 500);
  return { cancelled: true as const };
}

export async function updateInvitationLegs({
  supabase,
  userId,
  tripId,
  invitationId,
  legIds,
}: {
  supabase: TripSupabase;
  userId: string;
  tripId: string;
  invitationId: string;
  legIds: string[];
}) {
  await requireActiveMember(supabase, tripId, userId);
  const { data, error } = await supabase.rpc("update_trip_invitation_leg_assignments", {
    target_trip_id: tripId,
    target_invitation_id: invitationId,
    target_leg_ids: stringArray(legIds),
  });
  if (error) throw new TripLifecycleError("Could not update invitation destinations.", "operation_failed", 500);
  return { selectedLegCount: data || 0 };
}

export async function removeTripMember({
  supabase,
  userId,
  tripId,
  memberUserId,
}: {
  supabase: TripSupabase;
  userId: string;
  tripId: string;
  memberUserId: string;
}) {
  const trip = await requireOwner(supabase, tripId, userId);
  if (!memberUserId || memberUserId === userId || memberUserId === trip.user_id) {
    throw new TripLifecycleError("The trip owner cannot be removed.", "validation_error", 422);
  }
  await removeTripMemberAsOwner({ supabase, tripId, memberUserId });
  return { removed: true as const };
}

export async function setTripFamilyMember({
  supabase,
  userId,
  tripId,
  familyMemberId,
  included,
}: {
  supabase: TripSupabase;
  userId: string;
  tripId: string;
  familyMemberId: string;
  included: boolean;
}) {
  await requireActiveMember(supabase, tripId, userId);
  const { data: ownedFamily } = await supabase
    .from("user_family_members")
    .select("id")
    .eq("id", familyMemberId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!ownedFamily) {
    throw new TripLifecycleError("Family member not found.", "forbidden", 403);
  }
  const { error } = await supabase.from("trip_family_members").upsert(
    {
      trip_id: tripId,
      family_member_id: familyMemberId,
      added_by: userId,
      status: included ? "going" : "removed",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "trip_id,family_member_id" },
  );
  if (error) throw new TripLifecycleError("Could not update family member.", "operation_failed", 500);
  return { included };
}

export async function updateTripMemberScope({
  supabase,
  userId,
  tripId,
  tripMemberId,
  startDate,
  endDate,
  legIds,
}: {
  supabase: TripSupabase;
  userId: string;
  tripId: string;
  tripMemberId: string;
  startDate?: string | null;
  endDate?: string | null;
  legIds: string[];
}) {
  const actor = await requireActiveMember(supabase, tripId, userId);
  const { data: target, error: targetError } = await supabase
    .from("trip_members")
    .select("id,user_id,role")
    .eq("id", tripMemberId)
    .eq("trip_id", tripId)
    .eq("status", "active")
    .maybeSingle();
  if (targetError || !target) throw new TripLifecycleError("Trip member not found.", "not_found", 404);
  if (actor.role !== "owner" && target.user_id !== userId) {
    throw new TripLifecycleError("You cannot change another traveller's dates.", "forbidden", 403);
  }
  const cleanStart = clean(startDate, 10);
  const cleanEnd = clean(endDate, 10);
  if (!isDateRangeOrdered(cleanStart, cleanEnd)) {
    throw new TripLifecycleError("Traveller end date cannot be before start date.", "validation_error", 422);
  }
  const { error: memberError } = await supabase
    .from("trip_members")
    .update({ personal_start_date: cleanStart || null, personal_end_date: cleanEnd || null })
    .eq("id", tripMemberId)
    .eq("trip_id", tripId);
  if (memberError) throw new TripLifecycleError("Could not update traveller dates.", "operation_failed", 500);
  const selectedLegIds = stringArray(legIds);
  const { data: validLegs, error: legsError } = selectedLegIds.length
    ? await supabase.from("trip_legs").select("id").eq("trip_id", tripId).in("id", selectedLegIds)
    : { data: [], error: null };
  if (legsError || (validLegs || []).length !== selectedLegIds.length) {
    throw new TripLifecycleError("One or more trip destinations are invalid.", "validation_error", 422);
  }
  const { error: clearError } = await supabase
    .from("trip_member_legs")
    .delete()
    .eq("trip_id", tripId)
    .eq("trip_member_id", tripMemberId);
  if (clearError) throw new TripLifecycleError("Could not update traveller destinations.", "operation_failed", 500);
  if (selectedLegIds.length) {
    const { error: insertError } = await supabase.from("trip_member_legs").insert(
      selectedLegIds.map((legId) => ({
        trip_id: tripId,
        trip_member_id: tripMemberId,
        trip_leg_id: legId,
        is_joining: true,
        start_date: cleanStart || null,
        end_date: cleanEnd || null,
      })),
    );
    if (insertError) throw new TripLifecycleError("Could not update traveller destinations.", "operation_failed", 500);
  }
  return { updated: true as const };
}
