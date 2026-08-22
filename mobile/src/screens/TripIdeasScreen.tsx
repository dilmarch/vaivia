import { useEffect, useRef, useState } from "react";
import { IdeaReactionBarPresentation } from "@/components/ideas/IdeaReactionBarPresentation";
import {
  IdeaEditorPresentation,
  IdeaToItineraryPresentation,
} from "@/components/ideas/IdeaMutationPresentation";
import {
  TripIdeaCardPresentation,
  TripIdeaPlaceCoverPlaceholder,
} from "@/components/ideas/TripIdeaCardPresentation";
import {
  TripIdeasLoadingPresentation,
  TripIdeasPresentation,
} from "@/components/ideas/TripIdeasPresentation";
import TripNotepadComposer from "@/components/TripNotepadComposer";
import {
  TripHeaderPresentation,
  TripHeaderTitlePresentation,
} from "@/components/trips/TripHeaderPresentation";
import type {
  MobileIdeaMutationInput,
  MobileTripDetailResponse,
} from "@/lib/mobileApi/contracts";
import { splitNotepadLines } from "@/lib/notepadEntries";
import type { IdeaReactionType } from "@/lib/tripIdeas";
import { ScreenMessage } from "../components/ScreenMessage";
import { MobileApiError, type MobileApiClient } from "../lib/apiClient";

export function TripIdeasScreen({
  apiClient,
  tripId,
  editorAction,
  onEditorAction,
  onEditorClose,
}: {
  apiClient: MobileApiClient;
  tripId: string;
  editorAction?: string;
  onEditorAction?: (action: string) => void;
  onEditorClose?: () => void;
}) {
  const [data, setData] = useState<MobileTripDetailResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [coverLoadError, setCoverLoadError] = useState("");
  const submittingRef = useRef(false);
  const mutationKeyRef = useRef(crypto.randomUUID());

  useEffect(() => {
    mutationKeyRef.current = crypto.randomUUID();
    setMutationError("");
    setFieldErrors(undefined);
  }, [editorAction]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setErrorMessage("");
    setCoverLoadError("");
    void apiClient
      .getTrip(tripId, controller.signal)
      .then(setData)
      .catch((error) => {
        if (controller.signal.aborted) return;
        setErrorMessage(error instanceof Error ? error.message : "Could not load trip ideas.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [apiClient, reloadKey, tripId]);

  async function mutate(operation: () => Promise<unknown>, closeEditor = true) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setMutationError("");
    setFieldErrors(undefined);
    try {
      await operation();
      setReloadKey((key) => key + 1);
      if (closeEditor) onEditorClose?.();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "The idea change could not be saved.");
      if (error instanceof MobileApiError) setFieldErrors(error.fieldErrors);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen overflow-x-clip bg-[#0c0115] pb-10 pt-0 text-white">
        <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
          <div className="vaivia-trip-header-cover vaivia-trip-header-cover-fallback min-h-72 animate-pulse bg-white/[0.05] motion-reduce:animate-none" role="status" aria-label="Loading trip ideas" />
        </header>
        <div className="mx-auto max-w-7xl px-4 sm:px-6"><TripIdeasLoadingPresentation /></div>
      </main>
    );
  }

  if (errorMessage || !data) {
    return (
      <main className="min-h-screen overflow-x-clip bg-[#0c0115] px-5 pb-10 pt-28 text-white">
        <ScreenMessage title="Trip Ideas unavailable" message={errorMessage || "These trip ideas could not be found."} actionLabel="Try again" onAction={() => setReloadKey((key) => key + 1)} />
      </main>
    );
  }

  const selectedIdeaId = editorAction?.startsWith("edit:") || editorAction?.startsWith("itinerary:")
    ? editorAction.split(":")[1]
    : null;
  const selectedIdea = selectedIdeaId ? data.ideas.find((idea) => idea.id === selectedIdeaId) || null : null;
  const defaultDate = data.trip.start_date || new Date().toISOString().slice(0, 10);
  const canReact = data.trip.membershipRole === "owner";

  function submitIdea(input: MobileIdeaMutationInput) {
    void mutate(() => selectedIdea
      ? apiClient.updateIdea(tripId, selectedIdea.id, input, { idempotencyKey: mutationKeyRef.current })
      : apiClient.createIdea(tripId, input, { idempotencyKey: mutationKeyRef.current }));
  }

  async function createNotepadCards(formData: FormData) {
    const entries = splitNotepadLines(String(formData.get("entries") || ""));
    let locations: Array<Record<string, unknown>> = [];
    try {
      const parsed = JSON.parse(String(formData.get("locations") || "[]"));
      if (Array.isArray(parsed)) locations = parsed;
    } catch {
      setMutationError("The selected trip locations could not be read.");
      return;
    }
    await mutate(() => apiClient.createIdeasFromNotepad(tripId, entries, locations, { idempotencyKey: crypto.randomUUID() }), false);
  }

  return (
    <main className="min-h-screen overflow-x-clip bg-[#0c0115] pb-10 pt-0 text-white">
      <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
        <TripHeaderPresentation coverImageUrl={data.trip.cover_image_url} imageErrorMessage={coverLoadError} onImageLoad={() => setCoverLoadError("")} onImageError={() => setCoverLoadError("This image could not be loaded.")}>
          <TripHeaderTitlePresentation tripTitle={data.trip.title || "Untitled trip"} pageLabel="Trip Ideas" />
        </TripHeaderPresentation>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {mutationError && !editorAction ? <p role="alert" className="mb-4 rounded-xl border border-red-300/25 bg-red-950/80 p-3 text-sm font-bold text-red-100">{mutationError}</p> : null}
        <TripIdeasPresentation
          ideas={data.ideas}
          beforeContent={
            <TripNotepadComposer
              tripId={tripId}
              title="Trip notepad"
              description="Keep general thoughts here, or turn every non-empty line into a separate idea card."
              placeholder={"Visit Old Port\nKaraoke\nBar in the Village"}
              existingNote={data.trip.notes}
              locations={data.ideaNotepadLocations || []}
              createCardsAction={createNotepadCards}
              cardKind="idea"
            />
          }
          renderIdeaCard={(idea) => (
            <TripIdeaCardPresentation
              key={idea.id}
              idea={idea}
              cover={idea.google_place_id ? <TripIdeaPlaceCoverPlaceholder /> : null}
              onEdit={() => onEditorAction?.(`edit:${idea.id}`)}
              onAddToItinerary={() => onEditorAction?.(`itinerary:${idea.id}`)}
              renderAttendedControl={(props) => <button type="button" {...props} onClick={() => void mutate(() => apiClient.setIdeaAttended(tripId, idea.id, !idea.attended, { idempotencyKey: `attended:${idea.id}:${!idea.attended}` }), false)} />}
              reactionBar={
                <IdeaReactionBarPresentation
                  summaries={idea.reaction_summaries}
                  currentUserReaction={idea.current_user_reaction}
                  renderAction={(reaction: IdeaReactionType, props) => <button key={reaction} type="button" {...props} disabled={!canReact || isSubmitting} aria-label={canReact ? props.title : `${props.title}; unavailable to trip members`} onClick={() => void mutate(() => apiClient.toggleIdeaReaction(tripId, idea.id, reaction, { idempotencyKey: `reaction:${idea.id}:${reaction}` }), false)} />}
                />
              }
            />
          )}
        />
      </div>
      {editorAction === "new" || editorAction?.startsWith("edit:") ? (
        <IdeaEditorPresentation
          idea={selectedIdea}
          isSubmitting={isSubmitting}
          errorMessage={mutationError}
          fieldErrors={fieldErrors}
          onSubmit={submitIdea}
          onDelete={selectedIdea ? () => void mutate(() => apiClient.deleteIdea(tripId, selectedIdea.id, { idempotencyKey: `delete-idea:${selectedIdea.id}` })) : undefined}
          onClose={() => onEditorClose?.()}
        />
      ) : null}
      {editorAction?.startsWith("itinerary:") && selectedIdea ? (
        <IdeaToItineraryPresentation
          idea={selectedIdea}
          defaultDate={selectedIdea.availability_start_date || defaultDate}
          isSubmitting={isSubmitting}
          errorMessage={mutationError}
          onSubmit={(input) => void mutate(() => apiClient.addIdeaToItinerary(tripId, selectedIdea.id, input, { idempotencyKey: mutationKeyRef.current }))}
          onClose={() => onEditorClose?.()}
        />
      ) : null}
    </main>
  );
}
