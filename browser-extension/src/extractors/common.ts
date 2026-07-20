export type JsonLdNode = Record<string, unknown>;

export function cleanText(value: unknown, maxLength = 500) {
    return typeof value === "string"
        ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
        : "";
}

export function nullableText(value: unknown, maxLength = 500) {
    return cleanText(value, maxLength) || null;
}

export function getMeta(document: Document, ...names: string[]) {
    for (const name of names) {
        const escaped = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const element = document.querySelector<HTMLMetaElement>(
            `meta[property="${escaped}"], meta[name="${escaped}"]`
        );
        const content = cleanText(element?.content, 2000);
        if (content) return content;
    }
    return "";
}

export function getFirstText(document: Document, selectors: string[], maxLength = 500) {
    for (const selector of selectors) {
        const element = document.querySelector<HTMLElement>(selector);
        const text = cleanText(
            element instanceof HTMLInputElement ? element.value : element?.textContent,
            maxLength
        );
        if (text) return text;
    }
    return "";
}

function flattenJsonLd(value: unknown, results: JsonLdNode[]) {
    if (Array.isArray(value)) {
        value.forEach((item) => flattenJsonLd(item, results));
        return;
    }
    if (!value || typeof value !== "object") return;

    const record = value as JsonLdNode;
    results.push(record);
    if (Array.isArray(record["@graph"])) flattenJsonLd(record["@graph"], results);
}

export function getJsonLdNodes(document: Document) {
    const results: JsonLdNode[] = [];
    document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]').forEach(
        (script) => {
            try {
                flattenJsonLd(JSON.parse(script.textContent || ""), results);
            } catch {
                // Ignore malformed third-party structured data.
            }
        }
    );
    return results;
}

export function hasJsonLdType(node: JsonLdNode, types: string[]) {
    const rawType = node["@type"];
    const nodeTypes = Array.isArray(rawType) ? rawType : [rawType];
    return nodeTypes.some(
        (value) =>
            typeof value === "string" &&
            types.some((type) => value.toLowerCase() === type.toLowerCase())
    );
}

export function numberValue(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;

    const text = value.replace(/[^\d.,-]/g, "");
    if (!text) return null;
    const comma = text.lastIndexOf(",");
    const dot = text.lastIndexOf(".");
    let normalized = text;

    if (comma > dot) {
        normalized = text.replace(/\./g, "").replace(",", ".");
    } else {
        normalized = text.replace(/,/g, "");
    }

    const number = Number(normalized);
    return Number.isFinite(number) && number >= 0 ? number : null;
}

export function signedNumberValue(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;
    const number = Number(value.trim());
    return Number.isFinite(number) ? number : null;
}

export function currencyFromText(value: unknown) {
    const text = cleanText(value, 100).toUpperCase();
    const code = text.match(/\b(CAD|USD|EUR|GBP|AUD|NZD|JPY|KRW|TWD|VND|CHF|CNY|HKD|SGD)\b/)?.[1];
    if (code) return code;
    if (text.includes("CA$") || text.includes("C$")) return "CAD";
    if (text.includes("US$")) return "USD";
    if (text.includes("€")) return "EUR";
    if (text.includes("£")) return "GBP";
    if (text.includes("¥")) return "JPY";
    if (text.includes("$")) return "USD";
    return null;
}

export function isoDate(value: unknown) {
    const text = cleanText(value, 100);
    const match = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    return match?.[0] || "";
}

export function dateFromUrl(url: URL, names: string[]) {
    for (const name of names) {
        const value = isoDate(url.searchParams.get(name));
        if (value) return value;
    }
    return "";
}

export function integerFromUrl(url: URL, names: string[]) {
    for (const name of names) {
        const value = Number(url.searchParams.get(name));
        if (Number.isSafeInteger(value) && value > 0 && value < 100) return value;
    }
    return null;
}

export function siteNameFromUrl(url: URL) {
    return url.hostname.replace(/^www\./, "").split(".").slice(-2).join(".");
}

export function confirmationNumberFromText(text: string) {
    return (
        text.match(
            /(?:confirmation\s+(?:number|code|id)|booking\s+(?:number|code|reference|id)|reservation\s+(?:number|code|reference|id)|record locator|pnr|reference)\s*[:#-]?\s*([A-Z0-9]{5,14})\b/i
        )?.[1]?.toUpperCase() || null
    );
}

export function isConfirmationPage(url: URL, text: string) {
    const haystack = `${url.pathname} ${url.search} ${text.slice(0, 30000)}`.toLowerCase();
    const completionSignal = /(booking|reservation|flight|stay).{0,30}(confirmed|complete|successful)|thank you.{0,40}(booking|reservation)/i.test(
        haystack
    );
    const referenceSignal = /(confirmation|booking reference|reservation number|record locator|pnr)/i.test(
        haystack
    );
    return completionSignal && referenceSignal;
}

export function sourceFor(url: URL) {
    return {
        url: url.toString(),
        siteName: siteNameFromUrl(url),
        capturedAt: new Date().toISOString(),
    };
}
