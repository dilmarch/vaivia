import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { MobileTripCollaborationResponse, MobileTripDetailResponse, MobileTripMutationInput } from "@/lib/mobileApi/contracts";
import {
  TripActionIcon,
  TripCollaborationActionsPresentation,
  TripDangerActionsPresentation,
  TripLifecycleCard,
  TripLifecycleFormPresentation,
  TripLifecycleShell,
  type TripLifecycleFormValues,
} from "@/components/trips/TripLifecycleFormPresentation";
import { MobileApiError, type MobileApiClient } from "../lib/apiClient";
import { ScreenMessage } from "../components/ScreenMessage";

const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm font-black disabled:opacity-50";

export function TripManageScreen({
  apiClient,
  tripId,
  onDeleted,
  onUpdated,
}: {
  apiClient: MobileApiClient;
  tripId: string;
  onDeleted: () => void;
  onUpdated: () => void;
}) {
  const [tripData, setTripData] = useState<MobileTripDetailResponse | null>(null);
  const [collaboration, setCollaboration] = useState<MobileTripCollaborationResponse | null>(null);
  const [values, setValues] = useState<TripLifecycleFormValues | null>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invitee, setInvitee] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [selectedInviteLegs, setSelectedInviteLegs] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [countdownTarget, setCountdownTarget] = useState("");

  const reload = useCallback(async (signal?: AbortSignal) => {
    const [trip, people] = await Promise.all([
      apiClient.getTrip(tripId, signal),
      apiClient.getTripCollaboration(tripId, signal),
    ]);
    setTripData(trip);
    setCollaboration(people);
    setValues({
      title: trip.trip.title || "",
      slug: trip.trip.slug || "",
      destination: trip.trip.destination || "",
      startDate: trip.trip.start_date || "",
      endDate: trip.trip.end_date || "",
      notes: trip.trip.notes || "",
      legs: people.legs.map((leg) => ({
        id: leg.id,
        name: leg.name,
        startDate: leg.start_date,
        endDate: leg.end_date,
        countryCode: leg.country_code,
        placeId: leg.google_place_id,
      })),
    });
    setCountdownTarget(
      trip.trip.countdown_target_type && trip.trip.countdown_target_id
        ? `${trip.trip.countdown_target_type}:${trip.trip.countdown_target_id}`
        : "",
    );
  }, [apiClient, tripId]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError("");
    void reload(controller.signal)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load trip management.");
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, [reload, reloadKey]);

  async function run(action: () => Promise<unknown>, after?: () => void) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    setFieldErrors(undefined);
    try {
      await action();
      after?.();
      if (!after) await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "VAIVIA could not complete that change.");
      if (cause instanceof MobileApiError) setFieldErrors(cause.fieldErrors);
    } finally {
      setIsSubmitting(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values) return;
    void run(() => apiClient.updateTrip(tripId, values as MobileTripMutationInput, { idempotencyKey: crypto.randomUUID() }), onUpdated);
  }

  const activeFamilyIds = useMemo(() => new Set(collaboration?.familyMembers.map((member) => member.family_member_id) || []), [collaboration]);
  if (isLoading) return <TripLifecycleShell eyebrow="Trip" title="Manage trip"><p role="status" className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 text-white/60">Loading trip settings…</p></TripLifecycleShell>;
  if (!values || !tripData || !collaboration) return <TripLifecycleShell eyebrow="Trip" title="Manage trip"><ScreenMessage title="Trip settings unavailable" message={error || "This trip could not be found."} actionLabel="Try again" onAction={() => setReloadKey((key) => key + 1)} /></TripLifecycleShell>;

  return (
    <TripLifecycleShell eyebrow={tripData.trip.title || "Trip"} title="Manage trip" description="Update trip details, cover, travellers and access.">
      <TripLifecycleFormPresentation values={values} onChange={setValues} onSubmit={submit} submitLabel="Save trip changes" isSubmitting={isSubmitting} error={error} fieldErrors={fieldErrors} />

      <TripLifecycleCard title="Trip cover" description="JPEG, PNG or WebP up to 10 MB.">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`${actionClass} cursor-pointer`}><TripActionIcon kind="cover" /> Change cover<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={isSubmitting} onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(() => apiClient.uploadTripCover(tripId, file, { idempotencyKey: crypto.randomUUID() })); }} /></label>
          <button type="button" className={actionClass} disabled={isSubmitting || !tripData.trip.cover_image_url} onClick={() => void run(() => apiClient.removeTripCover(tripId, { idempotencyKey: crypto.randomUUID() }))}>Remove cover</button>
        </div>
      </TripLifecycleCard>

      <TripLifecycleCard title="Countdown target" description="Choose the itinerary or transportation item used for the trip countdown.">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <select value={countdownTarget} onChange={(event) => setCountdownTarget(event.target.value)} className="min-h-11 rounded-xl border border-white/15 bg-[#160c20] px-3 text-base text-white">
            <option value="">Trip start date</option>
            {tripData.itinerary.map((item) => (
              <option key={`${item.source}:${item.source_id}`} value={`${item.source === "transportation" ? "transportation_item" : "itinerary_item"}:${item.source_id}`}>
                {item.title || item.category_name}
              </option>
            ))}
          </select>
          <button type="button" disabled={isSubmitting} className={actionClass} onClick={() => {
            const separator = countdownTarget.indexOf(":");
            const countdownTargetType = separator > 0 ? countdownTarget.slice(0, separator) as "itinerary_item" | "transportation_item" : null;
            const countdownTargetId = separator > 0 ? countdownTarget.slice(separator + 1) : null;
            void run(() => apiClient.updateTrip(tripId, { ...values, countdownTargetType, countdownTargetId }, { idempotencyKey: crypto.randomUUID() }));
          }}>Save countdown</button>
        </div>
      </TripLifecycleCard>

      <TripLifecycleCard title="Invite collaborators" description="The trip owner can invite by email or VAIVIA username and scope the invitation to destinations.">
        <TripCollaborationActionsPresentation>
          <input value={invitee} onChange={(event) => setInvitee(event.target.value)} placeholder="Email or username" className="min-h-11 rounded-xl border border-white/15 bg-black/25 px-3 text-base text-white outline-none" disabled={!collaboration.permissions.canInvite} />
          {collaboration.legs.length ? <div className="grid gap-2">{collaboration.legs.map((leg) => <label key={leg.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 px-3 text-sm font-bold"><input type="checkbox" checked={selectedInviteLegs.includes(leg.id)} onChange={(event) => setSelectedInviteLegs((current) => event.target.checked ? [...current, leg.id] : current.filter((id) => id !== leg.id))} />{leg.name}</label>)}</div> : null}
          <label className="flex min-h-11 items-start gap-3 rounded-xl border border-white/10 p-3 text-sm text-white/70"><input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} />I confirm I have permission to invite this person.</label>
          <button type="button" className={actionClass} disabled={isSubmitting || !collaboration.permissions.canInvite || !invitee.trim() || !consentConfirmed} onClick={() => void run(() => apiClient.inviteTripCollaborator(tripId, { inviteeIdentifier: invitee, consentConfirmed, legIds: selectedInviteLegs }, { idempotencyKey: crypto.randomUUID() }), () => { setInvitee(""); setConsentConfirmed(false); setSelectedInviteLegs([]); void reload(); })}><TripActionIcon kind="invite" /> Send invitation</button>
          {collaboration.invitations.map((invitation) => <div key={invitation.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm"><span className="min-w-0 flex-1 truncate font-bold">{invitation.invited_email || invitation.invited_username || "Pending invitation"}</span>{collaboration.permissions.isOwner ? <button type="button" disabled={isSubmitting} onClick={() => void run(() => apiClient.cancelTripInvitation(tripId, invitation.id, { idempotencyKey: crypto.randomUUID() }))} className="min-h-11 px-2 text-red-200">Cancel</button> : null}</div>)}
        </TripCollaborationActionsPresentation>
      </TripLifecycleCard>

      <TripLifecycleCard title="Travellers" description="Manage participant dates and destination scope.">
        <div className="grid gap-3">
          {collaboration.members.map((member) => {
            const name = [member.profile?.first_name, member.profile?.last_name].filter(Boolean).join(" ") || member.profile?.username || member.profile?.email || "Trip member";
            const assigned = collaboration.memberLegAssignments.filter((item) => item.trip_member_id === member.id && item.is_joining).map((item) => item.trip_leg_id);
            return <details key={member.id} className="rounded-xl border border-white/10 bg-black/20 p-3"><summary className="min-h-8 cursor-pointer font-bold">{name} <span className="text-xs text-white/45">· {member.role}</span></summary><MemberScopeForm member={member} legIds={assigned} legs={collaboration.legs} disabled={isSubmitting} onSave={(input) => run(() => apiClient.updateTripMemberScope(tripId, input, { idempotencyKey: crypto.randomUUID() }))} onRemove={collaboration.permissions.isOwner && member.role !== "owner" ? () => run(() => apiClient.removeTripMember(tripId, member.user_id, { idempotencyKey: crypto.randomUUID() })) : undefined} /></details>;
          })}
        </div>
      </TripLifecycleCard>

      <TripLifecycleCard title="Family members" description="Add or remove family members saved in Settings.">
        <div className="grid gap-2">{collaboration.availableFamilyMembers.length ? collaboration.availableFamilyMembers.map((member) => <label key={member.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 px-3 text-sm font-bold"><input type="checkbox" checked={activeFamilyIds.has(member.id)} disabled={isSubmitting} onChange={(event) => void run(() => apiClient.setTripFamilyMember(tripId, member.id, event.target.checked, { idempotencyKey: crypto.randomUUID() }))} /><TripActionIcon kind="family" />{member.name}<span className="ml-auto text-xs text-white/45">{member.relationship}</span></label>) : <p className="text-sm text-white/55">No saved family members.</p>}</div>
      </TripLifecycleCard>

      <TripLifecycleCard title="Archive or delete">
        <TripDangerActionsPresentation archived={Boolean(tripData.trip.archived_at)} isOwner={collaboration.permissions.isOwner} disabled={isSubmitting} onArchive={() => { if (window.confirm("Archive this trip?")) void run(() => apiClient.setTripArchived(tripId, true, { idempotencyKey: crypto.randomUUID() }), onDeleted); }} onRestore={() => void run(() => apiClient.setTripArchived(tripId, false, { idempotencyKey: crypto.randomUUID() }))} onDelete={() => { const confirmation = window.prompt("Type DELETE to permanently delete this trip.") || ""; if (confirmation === "DELETE") void run(() => apiClient.deleteTrip(tripId, confirmation, { idempotencyKey: crypto.randomUUID() }), onDeleted); }} />
      </TripLifecycleCard>
    </TripLifecycleShell>
  );
}

function MemberScopeForm({ member, legs, legIds: initialLegIds, disabled, onSave, onRemove }: { member: MobileTripCollaborationResponse["members"][number]; legs: MobileTripCollaborationResponse["legs"]; legIds: string[]; disabled: boolean; onSave: (input: { tripMemberId: string; startDate: string; endDate: string; legIds: string[] }) => Promise<unknown>; onRemove?: () => Promise<unknown> }) {
  const [startDate, setStartDate] = useState(member.personal_start_date || "");
  const [endDate, setEndDate] = useState(member.personal_end_date || "");
  const [legIds, setLegIds] = useState(initialLegIds);
  return <div className="mt-3 grid gap-2"><div className="grid grid-cols-2 gap-2"><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="min-h-11 rounded-xl border border-white/15 bg-black/25 px-2" /><input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} className="min-h-11 rounded-xl border border-white/15 bg-black/25 px-2" /></div>{legs.map((leg) => <label key={leg.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={legIds.includes(leg.id)} onChange={(event) => setLegIds((current) => event.target.checked ? [...current, leg.id] : current.filter((id) => id !== leg.id))} />{leg.name}</label>)}<button type="button" disabled={disabled} className={actionClass} onClick={() => void onSave({ tripMemberId: member.id, startDate, endDate, legIds })}>Save traveller scope</button>{onRemove ? <button type="button" disabled={disabled} className={`${actionClass} text-red-200`} onClick={() => { if (window.confirm("Remove this member from the trip?")) void onRemove(); }}>Remove member</button> : null}</div>;
}
