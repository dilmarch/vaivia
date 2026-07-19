import "server-only";

import {
  ApiError,
  GoogleGenAI,
  type ContentListUnion,
  type GenerateContentConfig,
} from "@google/genai";

const DEFAULT_GEMINI_ASSISTANT_MODEL = "gemini-3.5-flash";
const DEFAULT_AI_DAILY_MESSAGE_LIMIT = 50;
const GEMINI_REQUEST_TIMEOUT_MS = 30_000;

export const VAIVIA_ASSISTANT_UNAVAILABLE_MESSAGE =
  "The VAIVIA assistant is temporarily unavailable";

let assistantClient: GoogleGenAI | null = null;

export type GeminiAssistantTokenUsage = {
  promptTokenCount: number | null;
  candidateTokenCount: number | null;
  totalTokenCount: number | null;
};

export type GeminiAssistantGenerationResult =
  | {
      status: "success";
      message: string;
      model: string;
      tokenUsage: GeminiAssistantTokenUsage;
    }
  | {
      status:
        | "missing_configuration"
        | "timeout"
        | "rate_limited"
        | "service_failure"
        | "empty_output"
        | "aborted";
      message: string;
    };

function getAssistantApiKey() {
  return process.env.GEMINI_ASSISTANT_API_KEY?.trim() || null;
}

export function getGeminiAssistantModel() {
  return (
    process.env.GEMINI_ASSISTANT_MODEL?.trim() || DEFAULT_GEMINI_ASSISTANT_MODEL
  );
}

export function getAiDailyMessageLimit() {
  const configuredLimit = Number(process.env.AI_DAILY_MESSAGE_LIMIT?.trim());

  return Number.isSafeInteger(configuredLimit) && configuredLimit > 0
    ? configuredLimit
    : DEFAULT_AI_DAILY_MESSAGE_LIMIT;
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
        apiVersion: "v1",
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

/**
 * Generates one non-streaming, stateless response with the stable
 * models.generateContent API. VAIVIA supplies and persists all history. The
 * non-streaming choice keeps persistence atomic at the application boundary:
 * only complete model output is ever saved as an assistant message.
 */
export async function generateGeminiAssistantResponse({
  contents,
  config,
  signal,
}: {
  contents: ContentListUnion;
  config?: GenerateContentConfig;
  signal?: AbortSignal;
}): Promise<GeminiAssistantGenerationResult> {
  const client = getGeminiAssistantClient();
  if (!client) {
    return {
      status: "missing_configuration",
      message: VAIVIA_ASSISTANT_UNAVAILABLE_MESSAGE,
    };
  }

  if (signal?.aborted) {
    return { status: "aborted", message: "The assistant request was cancelled" };
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
    const response = await client.models.generateContent({
      model: getGeminiAssistantModel(),
      contents,
      config: {
        ...config,
        abortSignal: controller.signal,
        httpOptions: {
          ...config?.httpOptions,
          timeout: GEMINI_REQUEST_TIMEOUT_MS,
        },
      },
    });
    const message = response.text?.trim();

    if (!message) {
      return {
        status: "empty_output",
        message: "The assistant returned an empty response. Please try again.",
      };
    }

    return {
      status: "success",
      message,
      model: response.modelVersion?.trim() || getGeminiAssistantModel(),
      tokenUsage: {
        promptTokenCount: safeTokenCount(response.usageMetadata?.promptTokenCount),
        candidateTokenCount: safeTokenCount(
          response.usageMetadata?.candidatesTokenCount
        ),
        totalTokenCount: safeTokenCount(response.usageMetadata?.totalTokenCount),
      },
    };
  } catch (error) {
    if (timedOut || (error instanceof ApiError && error.status === 408)) {
      return {
        status: "timeout",
        message: "The assistant took too long to respond. Please try again.",
      };
    }
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      return { status: "aborted", message: "The assistant request was cancelled" };
    }
    if (error instanceof ApiError && error.status === 429) {
      return {
        status: "rate_limited",
        message: "Google Gemini is temporarily rate limited. Please try again shortly.",
      };
    }
    return {
      status: "service_failure",
      message: VAIVIA_ASSISTANT_UNAVAILABLE_MESSAGE,
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
