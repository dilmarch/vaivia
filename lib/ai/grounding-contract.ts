import type { GroundingMetadata } from "@google/genai";

export const ASSISTANT_MAX_GROUNDING_SOURCES = 20;
export const ASSISTANT_MAX_GROUNDING_SUPPORTS = 60;
export const ASSISTANT_MAX_WEB_SEARCH_QUERIES = 20;
export const ASSISTANT_MAX_SEARCH_ENTRY_POINT_LENGTH = 50_000;
export const ASSISTANT_MAX_GROUNDED_MESSAGE_LENGTH = 32_000;

export type AssistantGroundingSource = {
    id: string;
    title: string;
    url: string;
};

export type AssistantGroundingSupport = {
    startIndex: number;
    endIndex: number;
    sourceIds: string[];
};

/**
 * Ephemeral browser contract for one grounded response. This object must never
 * be written to VAIVIA persistence or diagnostics.
 */
export type AssistantWebGrounding = {
    sources: AssistantGroundingSource[];
    supports: AssistantGroundingSupport[];
    searchEntryPointHtml: string;
    queryCount: number;
};

function cleanTitle(value: unknown) {
    return typeof value === "string"
        ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 240)
        : "";
}

function safeHttpUrl(value: unknown) {
    if (typeof value !== "string" || value.length > 2_048) return null;
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:"
            ? url.toString()
            : null;
    } catch {
        return null;
    }
}

function validSearchEntryPoint(value: unknown) {
    if (typeof value !== "string") return null;
    const rendered = value.trim();
    if (
        !rendered ||
        rendered.length > ASSISTANT_MAX_SEARCH_ENTRY_POINT_LENGTH ||
        rendered.includes("\u0000")
    ) {
        return null;
    }
    return rendered;
}

function utf8Length(value: string) {
    return new TextEncoder().encode(value).length;
}

export function parseAssistantWebGrounding(
    message: string,
    metadata: GroundingMetadata | null | undefined
): AssistantWebGrounding | null {
    if (!message.trim() || message.length > ASSISTANT_MAX_GROUNDED_MESSAGE_LENGTH) {
        return null;
    }
    const searchEntryPointHtml = validSearchEntryPoint(
        metadata?.searchEntryPoint?.renderedContent
    );
    const rawQueries = metadata?.webSearchQueries;
    if (
        !searchEntryPointHtml ||
        !Array.isArray(rawQueries) ||
        rawQueries.length < 1 ||
        rawQueries.length > ASSISTANT_MAX_WEB_SEARCH_QUERIES ||
        !rawQueries.every(
            (query) =>
                typeof query === "string" && query.length > 0 && query.length <= 1_000
        )
    ) {
        return null;
    }

    const rawChunks = Array.isArray(metadata?.groundingChunks)
        ? metadata.groundingChunks.slice(0, ASSISTANT_MAX_GROUNDING_SOURCES)
        : [];
    const sources: AssistantGroundingSource[] = [];
    const sourceIdByChunkIndex = new Map<number, string>();
    const sourceIdByUrl = new Map<string, string>();

    rawChunks.forEach((chunk, chunkIndex) => {
        const url = safeHttpUrl(chunk.web?.uri);
        if (!url) return;
        let sourceId = sourceIdByUrl.get(url);
        if (!sourceId) {
            sourceId = `source-${sources.length + 1}`;
            sourceIdByUrl.set(url, sourceId);
            sources.push({
                id: sourceId,
                title: cleanTitle(chunk.web?.title) || `Source ${sources.length + 1}`,
                url,
            });
        }
        sourceIdByChunkIndex.set(chunkIndex, sourceId);
    });

    if (sources.length === 0) return null;

    const messageByteLength = utf8Length(message);
    const supports = (metadata?.groundingSupports || [])
        .slice(0, ASSISTANT_MAX_GROUNDING_SUPPORTS)
        .flatMap((support) => {
            const startIndex = support.segment?.startIndex;
            const endIndex = support.segment?.endIndex;
            const partIndex = support.segment?.partIndex;
            if (
                !Number.isSafeInteger(startIndex) ||
                !Number.isSafeInteger(endIndex) ||
                (startIndex as number) < 0 ||
                (endIndex as number) <= (startIndex as number) ||
                (endIndex as number) > messageByteLength ||
                (partIndex !== undefined && partIndex !== 0)
            ) {
                return [];
            }
            const sourceIds = Array.from(
                new Set(
                    (support.groundingChunkIndices || [])
                        .filter((index) => Number.isSafeInteger(index))
                        .map((index) => sourceIdByChunkIndex.get(index))
                        .filter((id): id is string => Boolean(id))
                )
            ).slice(0, 8);
            return sourceIds.length > 0
                ? [{ startIndex: startIndex as number, endIndex: endIndex as number, sourceIds }]
                : [];
        })
        .sort((left, right) => left.endIndex - right.endIndex)
        .filter(
            (support, index, all) =>
                index === 0 ||
                support.startIndex >= all[index - 1]!.endIndex
        );

    if (supports.length === 0) return null;

    return {
        sources,
        supports,
        searchEntryPointHtml,
        queryCount: rawQueries.length,
    };
}
