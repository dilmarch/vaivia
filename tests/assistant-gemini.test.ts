import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdkMocks = vi.hoisted(() => ({
  construct: vi.fn(),
  generateContent: vi.fn(),
}));

vi.mock("@google/genai", () => {
  class MockApiError extends Error {
    status: number;

    constructor({ message, status }: { message: string; status: number }) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }

  class MockGoogleGenAI {
    models = { generateContent: sdkMocks.generateContent };

    constructor(options: unknown) {
      sdkMocks.construct(options);
    }
  }

  return {
    ApiError: MockApiError,
    FinishReason: {
      STOP: "STOP",
      MAX_TOKENS: "MAX_TOKENS",
      SAFETY: "SAFETY",
      RECITATION: "RECITATION",
      LANGUAGE: "LANGUAGE",
      BLOCKLIST: "BLOCKLIST",
      PROHIBITED_CONTENT: "PROHIBITED_CONTENT",
      SPII: "SPII",
    },
    GoogleGenAI: MockGoogleGenAI,
    ThinkingLevel: { LOW: "LOW" },
  };
});

import { ApiError } from "@google/genai";
import {
  GEMINI_ASSISTANT_API_VERSION,
  generateGeminiAssistantResponse,
  getGeminiAssistantGenerationConfig,
} from "@/lib/ai/gemini-assistant";
import { logAssistantDiagnostic } from "@/lib/ai/assistant-diagnostics";

const contents = [{ role: "user" as const, parts: [{ text: "Hello" }] }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GEMINI_ASSISTANT_API_KEY", "test-only-key");
  vi.stubEnv("GEMINI_ASSISTANT_MODEL", "gemini-3.5-flash");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Gemini assistant generation compatibility", () => {
  it("uses the system-instruction-compatible API and low-thinking config", async () => {
    sdkMocks.generateContent.mockResolvedValue({
      text: "Saved trip answer",
      modelVersion: "gemini-3.5-flash-001",
      candidates: [{ finishReason: "STOP" }],
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 20,
        thoughtsTokenCount: 30,
        totalTokenCount: 150,
      },
    });

    const config = getGeminiAssistantGenerationConfig();
    expect(GEMINI_ASSISTANT_API_VERSION).toBe("v1beta");
    expect(config).toEqual({
      maxOutputTokens: 4_096,
      thinkingConfig: { thinkingLevel: "LOW" },
    });

    const result = await generateGeminiAssistantResponse({
      contents,
      config: { ...config, systemInstruction: "Safe system instruction" },
    });

    expect(sdkMocks.construct).toHaveBeenCalledWith({
      apiKey: "test-only-key",
      apiVersion: "v1beta",
      enterprise: false,
    });
    expect(sdkMocks.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-3.5-flash",
        contents,
        config: expect.objectContaining({
          maxOutputTokens: 4_096,
          thinkingConfig: { thinkingLevel: "LOW" },
          systemInstruction: "Safe system instruction",
        }),
      })
    );
    expect(result).toMatchObject({
      status: "success",
      message: "Saved trip answer",
      tokenUsage: {
        promptTokenCount: 100,
        candidateTokenCount: 20,
        thoughtsTokenCount: 30,
        totalTokenCount: 150,
      },
      diagnostics: { finishReason: "STOP", promptBlockReason: null },
    });
  });

  it("distinguishes an empty STOP response from token exhaustion", async () => {
    sdkMocks.generateContent.mockResolvedValueOnce({
      text: undefined,
      candidates: [{ finishReason: "STOP" }],
      usageMetadata: {},
    });

    await expect(
      generateGeminiAssistantResponse({ contents })
    ).resolves.toMatchObject({
      status: "empty_output",
      diagnostics: { finishReason: "STOP" },
    });

    sdkMocks.generateContent.mockResolvedValueOnce({
      text: "Truncated response",
      candidates: [{ finishReason: "MAX_TOKENS" }],
      usageMetadata: {
        candidatesTokenCount: 48,
        thoughtsTokenCount: 1_148,
        totalTokenCount: 1_200,
      },
    });

    await expect(
      generateGeminiAssistantResponse({ contents })
    ).resolves.toMatchObject({
      status: "max_tokens",
      diagnostics: {
        finishReason: "MAX_TOKENS",
        tokenUsage: { thoughtsTokenCount: 1_148, totalTokenCount: 1_200 },
      },
    });
  });

  it("recognizes prompt feedback and candidate safety blocking", async () => {
    sdkMocks.generateContent.mockResolvedValueOnce({
      text: undefined,
      candidates: [],
      promptFeedback: { blockReason: "SAFETY" },
      usageMetadata: {},
    });

    await expect(
      generateGeminiAssistantResponse({ contents })
    ).resolves.toMatchObject({
      status: "blocked_output",
      diagnostics: { promptBlockReason: "SAFETY" },
    });

    sdkMocks.generateContent.mockResolvedValueOnce({
      text: undefined,
      candidates: [{ finishReason: "SAFETY" }],
      usageMetadata: {},
    });

    await expect(
      generateGeminiAssistantResponse({ contents })
    ).resolves.toMatchObject({
      status: "blocked_output",
      diagnostics: { finishReason: "SAFETY" },
    });
  });

  it("captures sanitized provider metadata without returning it as the message", async () => {
    sdkMocks.generateContent.mockRejectedValue(
      new ApiError({
        status: 400,
        message: JSON.stringify({
          error: {
            status: "INVALID_ARGUMENT",
            message:
              "Invalid JSON payload. key=AIza123456789012345678901234567890",
          },
        }),
      })
    );

    const result = await generateGeminiAssistantResponse({ contents });

    expect(result).toMatchObject({
      status: "service_failure",
      message: "The VAIVIA assistant is temporarily unavailable",
      diagnostics: {
        providerStatus: 400,
        providerCode: "INVALID_ARGUMENT",
      },
    });
    expect(result.diagnostics.providerMessage).toContain("[redacted]");
    expect(result.message).not.toContain("INVALID_ARGUMENT");
  });

  it("handles timeout and caller cancellation separately", async () => {
    vi.useFakeTimers();
    sdkMocks.generateContent.mockImplementation(
      ({ config }: { config: { abortSignal: AbortSignal } }) =>
        new Promise((_, reject) => {
          config.abortSignal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        })
    );

    const timedRequest = generateGeminiAssistantResponse({ contents });
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(timedRequest).resolves.toMatchObject({ status: "timeout" });

    const controller = new AbortController();
    controller.abort();
    await expect(
      generateGeminiAssistantResponse({ contents, signal: controller.signal })
    ).resolves.toMatchObject({ status: "aborted" });
  });

  it("logs metadata only in development and omits provider messages entirely", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const diagnostic = {
      stage: "gemini_generate_content" as const,
      code: "gemini_service_failure",
      providerStatus: 400,
      providerCode: "INVALID_ARGUMENT",
      providerMessage: "Invalid request key=super-secret-value",
      contextCharacters: 19_924,
      historyMessageCount: 2,
    };

    vi.stubEnv("NODE_ENV", "production");
    logAssistantDiagnostic(diagnostic);
    expect(errorSpy).not.toHaveBeenCalled();

    vi.stubEnv("NODE_ENV", "development");
    logAssistantDiagnostic(diagnostic);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls.flat().join(" ");
    expect(logged).toContain("INVALID_ARGUMENT");
    expect(logged).not.toContain("Invalid request");
    expect(logged).not.toContain("super-secret-value");
  });
});
