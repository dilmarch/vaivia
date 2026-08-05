import "server-only";

import {
  ApiError,
  FinishReason,
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type ContentListUnion,
  type FunctionCall,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type GroundingMetadata,
  type Part,
} from "@google/genai";
import { logAssistantDiagnostic } from "@/lib/ai/assistant-diagnostics";
import type { AssistantModelTier } from "@/lib/ai/assistant-routing";

const DEFAULT_GEMINI_ASSISTANT_FAST_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_GEMINI_ASSISTANT_STRONG_MODEL = "gemini-3.5-flash";
const DEFAULT_AI_DAILY_MESSAGE_LIMIT = 50;
const GEMINI_REQUEST_TIMEOUT_MS = 30_000;
export const GEMINI_ASSISTANT_API_VERSION = "v1beta";
export const GEMINI_ASSISTANT_MAX_OUTPUT_TOKENS = 4_096;
export const GEMINI_ASSISTANT_FAST_THINKING_LEVEL = ThinkingLevel.MINIMAL;
export const GEMINI_ASSISTANT_STRONG_THINKING_LEVEL = ThinkingLevel.LOW;

export const VAIVIA_ASSISTANT_UNAVAILABLE_MESSAGE =
  "The VAIVIA assistant is temporarily unavailable";

let assistantClient: GoogleGenAI | null = null;

export type GeminiAssistantTokenUsage = {
  promptTokenCount: number | null;
  candidateTokenCount: number | null;
  thoughtsTokenCount: number | null;
  totalTokenCount: number | null;
};

export type GeminiAssistantDiagnostics = {
  apiVersion: string;
  model: string;
  providerStatus: number | null;
  providerCode: string | null;
  providerMessage: string | null;
  finishReason: string | null;
  promptBlockReason: string | null;
  elapsedMs: number;
  tokenUsage: GeminiAssistantTokenUsage;
};

export type GeminiAssistantGenerationResult =
  | {
      status: "success";
      message: string;
      model: string;
      tokenUsage: GeminiAssistantTokenUsage;
      diagnostics: GeminiAssistantDiagnostics;
    }
  | {
      status:
        | "missing_configuration"
        | "timeout"
        | "rate_limited"
        | "service_failure"
        | "empty_output"
        | "max_tokens"
        | "blocked_output"
        | "aborted";
      message: string;
      diagnostics: GeminiAssistantDiagnostics;
    };

export type GeminiAssistantTurnResult =
  | {
      status: "success";
      message: string | null;
      responseContent: Content;
      functionCalls: FunctionCall[];
      groundingMetadata: GroundingMetadata | null;
      model: string;
      tokenUsage: GeminiAssistantTokenUsage;
      diagnostics: GeminiAssistantDiagnostics;
    }
  | Exclude<GeminiAssistantGenerationResult, { status: "success" }>;

type InspectedGeminiResponse = {
  responseContent: Content;
  message: string | null;
  functionCalls: FunctionCall[];
  partTypes: string[];
  responseType: "text" | "function_call" | "mixed" | "empty";
};

function getAssistantApiKey() {
  return process.env.GEMINI_ASSISTANT_API_KEY?.trim() || null;
}

export function getGeminiAssistantModel(tier: AssistantModelTier = "fast") {
  if (tier === "strong") {
    return (
      process.env.GEMINI_ASSISTANT_STRONG_MODEL?.trim() ||
      process.env.GEMINI_ASSISTANT_MODEL?.trim() ||
      DEFAULT_GEMINI_ASSISTANT_STRONG_MODEL
    );
  }
  return (
    process.env.GEMINI_ASSISTANT_FAST_MODEL?.trim() ||
    DEFAULT_GEMINI_ASSISTANT_FAST_MODEL
  );
}

export function getAiDailyMessageLimit() {
  const configuredLimit = Number(process.env.AI_DAILY_MESSAGE_LIMIT?.trim());

  return Number.isSafeInteger(configuredLimit) && configuredLimit > 0
    ? configuredLimit
    : DEFAULT_AI_DAILY_MESSAGE_LIMIT;
}

export function getGeminiAssistantGenerationConfig(
  tier: AssistantModelTier = "fast"
): GenerateContentConfig {
  return {
    maxOutputTokens: GEMINI_ASSISTANT_MAX_OUTPUT_TOKENS,
    thinkingConfig: {
      thinkingLevel:
        tier === "strong"
          ? GEMINI_ASSISTANT_STRONG_THINKING_LEVEL
          : GEMINI_ASSISTANT_FAST_THINKING_LEVEL,
    },
  };
}

export function isGeminiAssistantConfigured() {
  return Boolean(getAssistantApiKey());
}

export function getGeminiAssistantClient() {
  const apiKey = getAssistantApiKey();
  if (!apiKey) return null;

  if (!assistantClient) {
    try {
      assistantClient = new GoogleGenAI({
        apiKey,
        apiVersion: GEMINI_ASSISTANT_API_VERSION,
        enterprise: false,
      });
    } catch {
      return null;
    }
  }

  return assistantClient;
}

function safeTokenCount(value: number | undefined) {
  return Number.isSafeInteger(value) && (value || 0) >= 0 ? (value as number) : null;
}

function getTokenUsage(
  response?: GenerateContentResponse
): GeminiAssistantTokenUsage {
  return {
    promptTokenCount: safeTokenCount(response?.usageMetadata?.promptTokenCount),
    candidateTokenCount: safeTokenCount(
      response?.usageMetadata?.candidatesTokenCount
    ),
    thoughtsTokenCount: safeTokenCount(
      response?.usageMetadata?.thoughtsTokenCount
    ),
    totalTokenCount: safeTokenCount(response?.usageMetadata?.totalTokenCount),
  };
}

function parseProviderError(error: unknown) {
  if (!(error instanceof Error)) {
    return { providerCode: null, providerMessage: null };
  }

  let providerCode: string | null = error.name || null;
  let providerMessage = error.message || null;

  try {
    const parsed = JSON.parse(error.message) as {
      error?: { status?: unknown; message?: unknown };
    };
    if (typeof parsed.error?.status === "string") {
      providerCode = parsed.error.status.slice(0, 80);
    }
    if (typeof parsed.error?.message === "string") {
      providerMessage = parsed.error.message;
    }
  } catch {
    // Non-JSON SDK and network errors are already represented by Error fields.
  }

  return {
    providerCode,
    providerMessage: providerMessage
      ?.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]")
      .replace(/[\r\n\t]+/g, " ")
      .trim()
      .slice(0, 240) || null,
  };
}

function getResponseDiagnostics({
  response,
  model,
  elapsedMs,
}: {
  response?: GenerateContentResponse;
  model: string;
  elapsedMs: number;
}): GeminiAssistantDiagnostics {
  return {
    apiVersion: GEMINI_ASSISTANT_API_VERSION,
    model,
    providerStatus: null,
    providerCode: null,
    providerMessage: null,
    finishReason: response?.candidates?.[0]?.finishReason || null,
    promptBlockReason: response?.promptFeedback?.blockReason || null,
    elapsedMs,
    tokenUsage: getTokenUsage(response),
  };
}

function isBlockedFinishReason(finishReason: string | null) {
  return [
    FinishReason.SAFETY,
    FinishReason.RECITATION,
    FinishReason.LANGUAGE,
    FinishReason.BLOCKLIST,
    FinishReason.PROHIBITED_CONTENT,
    FinishReason.SPII,
  ].includes(finishReason as FinishReason);
}

function getGeminiPartType(part: Part) {
  if (part.functionCall) return "function_call";
  if (part.functionResponse) return "function_response";
  if (typeof part.text === "string") return part.thought ? "thought" : "text";
  if (part.inlineData) return "inline_data";
  if (part.fileData) return "file_data";
  if (part.executableCode) return "executable_code";
  if (part.codeExecutionResult) return "code_execution_result";
  if (part.toolCall) return "tool_call";
  if (part.toolResponse) return "tool_response";
  return "unknown";
}

/**
 * Reads the selected candidate's structured parts directly. Do not replace this
 * with GenerateContentResponse.text: that SDK convenience getter warns for
 * function calls and hides the distinction between text-only and tool turns.
 */
export function inspectGeminiAssistantResponse(
  response: GenerateContentResponse
): InspectedGeminiResponse {
  const responseContent = response.candidates?.[0]?.content || {
    role: "model",
    parts: [],
  };
  const parts = responseContent.parts || [];
  const partTypes = parts.map(getGeminiPartType);
  const functionCalls = parts.flatMap((part) =>
    part.functionCall ? [part.functionCall] : []
  );
  const message =
    parts
      .flatMap((part) =>
        typeof part.text === "string" && !part.thought ? [part.text] : []
      )
      .join("")
      .trim() || null;
  const responseType =
    functionCalls.length > 0 && message
      ? "mixed"
      : functionCalls.length > 0
        ? "function_call"
        : message
          ? "text"
          : "empty";

  return {
    responseContent,
    message,
    functionCalls,
    partTypes,
    responseType,
  };
}

/**
 * Generates one non-streaming, stateless response with the supported
 * models.generateContent API. VAIVIA supplies and persists all history. The
 * non-streaming choice keeps persistence atomic at the application boundary:
 * only complete model output is ever saved as an assistant message.
 */
export async function generateGeminiAssistantTurn({
  contents,
  config,
  model = getGeminiAssistantModel(),
  stream = false,
  onTextDelta,
  signal,
}: {
  contents: ContentListUnion;
  config?: GenerateContentConfig;
  model?: string;
  stream?: boolean;
  onTextDelta?: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<GeminiAssistantTurnResult> {
  const startedAt = Date.now();
  const client = getGeminiAssistantClient();
  if (!client) {
    return {
      status: "missing_configuration",
      message: VAIVIA_ASSISTANT_UNAVAILABLE_MESSAGE,
      diagnostics: getResponseDiagnostics({
        model,
        elapsedMs: Date.now() - startedAt,
      }),
    };
  }

  if (signal?.aborted) {
    return {
      status: "aborted",
      message: "The assistant request was cancelled",
      diagnostics: getResponseDiagnostics({
        model,
        elapsedMs: Date.now() - startedAt,
      }),
    };
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, GEMINI_REQUEST_TIMEOUT_MS);

  try {
    const request = {
      model,
      contents,
      config: {
        ...config,
        abortSignal: controller.signal,
        httpOptions: {
          ...config?.httpOptions,
          timeout: GEMINI_REQUEST_TIMEOUT_MS,
        },
      },
    };
    let response: GenerateContentResponse;
    if (stream) {
      const chunks = await client.models.generateContentStream(request);
      const parts: Part[] = [];
      let lastChunk: GenerateContentResponse | null = null;
      for await (const chunk of chunks) {
        lastChunk = chunk;
        for (const part of chunk.candidates?.[0]?.content?.parts || []) {
          parts.push(part);
          if (typeof part.text === "string" && !part.thought && part.text) {
            onTextDelta?.(part.text);
          }
        }
      }
      response = {
        ...(lastChunk || {}),
        candidates: [
          {
            ...(lastChunk?.candidates?.[0] || {}),
            content: { role: "model", parts },
          },
        ],
      } as GenerateContentResponse;
    } else {
      response = await client.models.generateContent(request);
    }
    const inspected = inspectGeminiAssistantResponse(response);
    const { message, functionCalls, responseContent, partTypes, responseType } =
      inspected;
    const diagnostics = getResponseDiagnostics({
      response,
      model,
      elapsedMs: Date.now() - startedAt,
    });
    logAssistantDiagnostic({
      stage: "gemini_generate_content",
      code: "gemini_response_parts",
      model: response.modelVersion?.trim() || model,
      finishReason: diagnostics.finishReason,
      partTypes,
      finalResponseType: responseType,
      toolCallCount: functionCalls.length,
      elapsedMs: diagnostics.elapsedMs,
    });

    if (diagnostics.finishReason === FinishReason.MAX_TOKENS) {
      return {
        status: "max_tokens",
        message: VAIVIA_ASSISTANT_UNAVAILABLE_MESSAGE,
        diagnostics,
      };
    }

    if (
      diagnostics.promptBlockReason ||
      isBlockedFinishReason(diagnostics.finishReason)
    ) {
      return {
        status: "blocked_output",
        message: VAIVIA_ASSISTANT_UNAVAILABLE_MESSAGE,
        diagnostics,
      };
    }

    if (!message && functionCalls.length === 0) {
      return {
        status: "empty_output",
        message: VAIVIA_ASSISTANT_UNAVAILABLE_MESSAGE,
        diagnostics,
      };
    }

    return {
      status: "success",
      message,
      responseContent,
      functionCalls,
      groundingMetadata: response.candidates?.[0]?.groundingMetadata || null,
      model: response.modelVersion?.trim() || model,
      tokenUsage: diagnostics.tokenUsage,
      diagnostics,
    };
  } catch (error) {
    const providerError = parseProviderError(error);
    const diagnostics: GeminiAssistantDiagnostics = {
      ...getResponseDiagnostics({
        model,
        elapsedMs: Date.now() - startedAt,
      }),
      providerStatus: error instanceof ApiError ? error.status : null,
      ...providerError,
    };

    if (timedOut || (error instanceof ApiError && error.status === 408)) {
      return {
        status: "timeout",
        message: "The assistant took too long to respond. Please try again.",
        diagnostics,
      };
    }
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      return {
        status: "aborted",
        message: "The assistant request was cancelled",
        diagnostics,
      };
    }
    if (error instanceof ApiError && error.status === 429) {
      return {
        status: "rate_limited",
        message: "Google Gemini is temporarily rate limited. Please try again shortly.",
        diagnostics,
      };
    }
    return {
      status: "service_failure",
      message: VAIVIA_ASSISTANT_UNAVAILABLE_MESSAGE,
      diagnostics,
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

/** One-shot compatibility wrapper used by non-tool assistant requests/tests. */
export async function generateGeminiAssistantResponse(
  options: Parameters<typeof generateGeminiAssistantTurn>[0]
): Promise<GeminiAssistantGenerationResult> {
  const result = await generateGeminiAssistantTurn(options);
  if (result.status !== "success") return result;
  if (!result.message) {
    return {
      status: "empty_output",
      message: VAIVIA_ASSISTANT_UNAVAILABLE_MESSAGE,
      diagnostics: result.diagnostics,
    };
  }
  return {
    status: "success",
    message: result.message,
    model: result.model,
    tokenUsage: result.tokenUsage,
    diagnostics: result.diagnostics,
  };
}
