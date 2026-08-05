import "server-only";

export type AssistantDiagnosticStage =
  | "request_lifecycle"
  | "authentication"
  | "trip_context"
  | "conversation_history"
  | "quota_reservation"
  | "user_message_persistence"
  | "gemini_generate_content"
  | "gemini_tool_loop"
  | "retrieval_routing"
  | "places_tool"
  | "places_http"
  | "search_grounding"
  | "assistant_message_persistence"
  | "request_finalization";

export type AssistantDiagnostic = {
  stage: AssistantDiagnosticStage;
  code: string;
  apiVersion?: string;
  model?: string;
  providerStatus?: number | null;
  providerCode?: string | null;
  providerMessage?: string | null;
  finishReason?: string | null;
  promptBlockReason?: string | null;
  promptTokenCount?: number | null;
  candidateTokenCount?: number | null;
  thoughtsTokenCount?: number | null;
  totalTokenCount?: number | null;
  elapsedMs?: number;
  contextCharacters?: number;
  historyMessageCount?: number;
  externalToolCalls?: number;
  externalPlaceResults?: number;
  googleSearchOperations?: number;
  googleSearchQueries?: number;
  retrievalMode?: "none" | "places" | "current_web" | "auto";
  groundedFollowUp?: boolean;
  partTypes?: string[];
  requestedFunction?: string;
  argumentValidation?: "valid" | "invalid" | "unknown_tool";
  toolExecution?: "started" | "completed" | "failed" | "skipped";
  finalResponseType?: "text" | "function_call" | "mixed" | "empty";
  toolCallCount?: number;
  toolCallIteration?: number;
  sanitizedError?: string | null;
  intent?: string;
  modelTier?: "fast" | "strong";
  generationIndex?: number;
};

/**
 * Emits metadata-only diagnostics in every environment. The typed payload
 * intentionally has no fields for prompts, messages, trip data, credentials,
 * cookies, headers, user IDs or trip IDs.
 */
export function logAssistantDiagnostic(diagnostic: AssistantDiagnostic) {
  if (process.env.NODE_ENV === "test") return;

  // Provider messages are intentionally excluded: an upstream error may echo
  // prompt or grounding data even when the application never supplied a log field.
  const metadataOnlyDiagnostic = { ...diagnostic };
  delete metadataOnlyDiagnostic.providerMessage;

  console.info(
    "[VAIVIA assistant]",
    JSON.stringify(metadataOnlyDiagnostic)
  );
}
