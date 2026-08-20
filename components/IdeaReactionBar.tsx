"use client";

import { IdeaReactionBarPresentation } from "@/components/ideas/IdeaReactionBarPresentation";
import type {
  IdeaReactionSummary,
  IdeaReactionType,
} from "@/lib/tripIdeas";

type IdeaReactionBarProps = {
  tripId: string;
  ideaId: string;
  summaries?: IdeaReactionSummary[];
  currentUserReaction?: IdeaReactionType | null;
  toggleReactionAction: (formData: FormData) => Promise<void>;
  compact?: boolean;
};

export default function IdeaReactionBar({
  tripId,
  ideaId,
  summaries = [],
  currentUserReaction,
  toggleReactionAction,
  compact = false,
}: IdeaReactionBarProps) {
  return (
    <IdeaReactionBarPresentation
      summaries={summaries}
      currentUserReaction={currentUserReaction}
      compact={compact}
      renderAction={(reaction, props) => (
        <form key={reaction} action={toggleReactionAction}>
          <input type="hidden" name="trip_id" value={tripId} />
          <input type="hidden" name="idea_id" value={ideaId} />
          <input type="hidden" name="reaction" value={reaction} />
          <button type="submit" {...props} />
        </form>
      )}
    />
  );
}
