import { useEffect, useMemo, useRef, useState } from "react";
import {
  ItineraryItemEditorPresentation,
  type ItineraryEditorAudienceOption,
} from "@/components/itinerary/ItineraryItemEditorPresentation";
import type {
  MobileItineraryEditorResponse,
  MobileItineraryMutationInput,
} from "@/lib/mobileApi/contracts";
import { MobileApiError, type MobileApiClient } from "../lib/apiClient";
import { ScreenMessage } from "../components/ScreenMessage";

export function ItineraryItemEditorScreen({
  apiClient,
  tripId,
  itemId,
  onSaved,
  onCancel,
}: {
  apiClient: MobileApiClient;
  tripId: string;
  itemId?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [data, setData] = useState<MobileItineraryEditorResponse | null>(null);
  const [audienceOptions, setAudienceOptions] = useState<ItineraryEditorAudienceOption[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const submissionRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    Promise.all([
      apiClient.getItineraryEditor(tripId, itemId, controller.signal),
      apiClient.getTripCollaboration(tripId, controller.signal),
    ])
      .then(([editor, collaboration]) => {
        if (controller.signal.aborted) return;
        setData(editor);
        setAudienceOptions([
          ...collaboration.members.map((member) => ({
            kind: "member" as const,
            id: member.id,
            label:
              [member.profile?.first_name, member.profile?.last_name].filter(Boolean).join(" ") ||
              member.profile?.username || member.profile?.email || "Trip member",
            isCurrentUser: member.user_id === collaboration.members.find((candidate) => candidate.profile?.email)?.user_id,
          })),
          ...collaboration.invitations.map((invitation) => ({
            kind: "invitation" as const,
            id: invitation.id,
            label: invitation.invited_username || invitation.invited_email || "Invited traveler",
          })),
          ...collaboration.familyMembers.map((family) => ({
            kind: "family_member" as const,
            id: family.family_member_id,
            label: family.profile.name,
          })),
        ]);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setErrorMessage(error instanceof Error ? error.message : "Could not load the itinerary editor.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [apiClient, itemId, tripId]);

  const defaultDate = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (!data?.trip.start_date) return today;
    if (data.trip.end_date && today > data.trip.end_date) return data.trip.start_date;
    return today < data.trip.start_date ? data.trip.start_date : today;
  }, [data]);

  async function submit(input: MobileItineraryMutationInput) {
    if (submissionRef.current) return;
    submissionRef.current = true;
    setIsSubmitting(true);
    setErrorMessage("");
    setFieldErrors(undefined);
    const idempotencyKey = crypto.randomUUID();
    try {
      const response = itemId
        ? await apiClient.updateItineraryItem(tripId, itemId, input, { idempotencyKey })
        : await apiClient.createItineraryItem(tripId, input, { idempotencyKey });
      if (coverFile) {
        await apiClient.uploadItineraryCover(tripId, response.item.id, input, coverFile, {
          idempotencyKey: `${idempotencyKey}:cover`,
        });
      }
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save this itinerary item.");
      if (error instanceof MobileApiError) setFieldErrors(error.fieldErrors);
    } finally {
      submissionRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function remove() {
    if (!itemId || submissionRef.current) return;
    if (!window.confirm("Delete this itinerary item? This cannot be undone.")) return;
    submissionRef.current = true;
    setIsSubmitting(true);
    try {
      await apiClient.deleteItineraryItem(tripId, itemId, { idempotencyKey: crypto.randomUUID() });
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not delete this itinerary item.");
    } finally {
      submissionRef.current = false;
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <main className="min-h-screen bg-[#0c0115] px-5 pt-28 text-white"><div role="status" className="h-96 animate-pulse rounded-[2rem] border border-white/10 bg-white/[0.05]" /></main>;
  if (!data) return <main className="min-h-screen bg-[#0c0115] px-5 pt-28 text-white"><ScreenMessage title="Editor unavailable" message={errorMessage || "This item could not be loaded."} actionLabel="Back" onAction={onCancel} /></main>;
  return (
    <main className="min-h-screen overflow-x-clip bg-[#0c0115] px-4 pb-10 pt-8 text-white sm:px-6">
      <ItineraryItemEditorPresentation
        item={data.item}
        categories={data.categories}
        audienceOptions={audienceOptions}
        defaultDate={defaultDate}
        defaultTimezone={Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
        fieldErrors={fieldErrors}
        onSubmit={(input) => void submit(input)}
        onCancel={onCancel}
        onDelete={itemId ? () => void remove() : undefined}
        onCoverSelected={setCoverFile}
      />
    </main>
  );
}
