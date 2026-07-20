import "server-only";

export type AssistantDiagnosticStage =
  | "trip_context"
  | "conversation_history"
  | "quota_reservation"
  | "user_message_persistence"
  | "gemini_generate_content"
  | "places_tool"
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
};

function sanitizeDiagnosticMessage(message: string | null | undefined) {
  if (!message) return null;

  return message
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]")
    .replace(
      /((?:api[_-]?key|key|authorization)\s*[=:]\s*)[^\s,;}]+/gi,
      "$1[redacted]"
    )
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 240);
}

/**
 * Emits metadata-only diagnostics during local development. The typed payload
 * intentionally has no fields for prompts, messages, trip data, credentials,
 * cookies, headers, user IDs or trip IDs.
 */
export function logAssistantDiagnostic(diagnostic: AssistantDiagnostic) {
  if (process.env.NODE_ENV !== "development") return;

  console.error(
    "[VAIVIA assistant]",
    JSON.stringify({
      ...diagnostic,
      providerMessage: sanitizeDiagnosticMessage(diagnostic.providerMessage),
    })
  );
}
