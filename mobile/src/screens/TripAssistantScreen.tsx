import { useCallback } from "react";
import TripAssistantPresentation, {
  type AssistantRequest,
} from "@/components/assistant/TripAssistantPresentation";
import type { MobileApiClient } from "../lib/apiClient";

export function TripAssistantScreen({
  apiClient,
  tripId,
  tripTitle,
}: {
  apiClient: MobileApiClient;
  tripId: string;
  tripTitle: string;
}) {
  const request = useCallback<AssistantRequest>(
    (input, init) => {
      if (typeof input !== "string") {
        return Promise.reject(new TypeError("Mobile Concierge requires a path"));
      }
      return apiClient.requestAuthenticated(input, init, { timeoutMs: null });
    },
    [apiClient],
  );

  return (
    <main className="vaivia-page-bg h-[calc(100dvh-var(--safe-area-top)-8.5rem-var(--safe-area-bottom))] min-h-0 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(var(--vaivia-neon-rgb),0.08),transparent_35%),#030712] px-3 py-3 text-white">
      <TripAssistantPresentation
        tripId={tripId}
        tripTitle={tripTitle}
        request={request}
        placeActionsEnabled={false}
        blockInteractionsOnLoadError
        renderSavedTarget={({ label, className }) => (
          <span className={className}>{label}</span>
        )}
      />
    </main>
  );
}
