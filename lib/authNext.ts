export function normalizeAuthNext(value?: string | null) {
    if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";

    try {
        const parsed = new URL(value, "https://vaivia.local");
        return parsed.origin === "https://vaivia.local"
            ? `${parsed.pathname}${parsed.search}${parsed.hash}`
            : "/";
    } catch {
        return "/";
    }
}
