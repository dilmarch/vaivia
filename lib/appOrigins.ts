export const PRODUCTION_APP_ORIGINS = [
    "https://vaivia.app",
    "https://app.thetravellinglinguist.com",
] as const;

const productionAppOrigins = new Set<string>(PRODUCTION_APP_ORIGINS);

export function normalizeAppOrigin(value: string | null | undefined) {
    const candidate = String(value || "").trim();
    if (!candidate) return null;

    try {
        const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
        const isLoopback =
            url.hostname === "localhost" ||
            url.hostname === "127.0.0.1" ||
            url.hostname === "[::1]";

        if (
            url.username ||
            url.password ||
            url.pathname !== "/" ||
            url.search ||
            url.hash ||
            (url.protocol !== "https:" && !(isLoopback && url.protocol === "http:"))
        ) {
            return null;
        }

        return url.origin;
    } catch {
        return null;
    }
}

export function isProductionAppOrigin(value: string | null | undefined) {
    const origin = normalizeAppOrigin(value);
    return Boolean(origin && productionAppOrigins.has(origin));
}

export function isLocalAppOrigin(value: string | null | undefined) {
    const origin = normalizeAppOrigin(value);
    if (!origin) return false;

    const url = new URL(origin);
    return (
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]"
    );
}

export function isVercelPreviewOrigin(value: string | null | undefined) {
    const origin = normalizeAppOrigin(value);
    if (!origin) return false;

    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.endsWith(".vercel.app");
}

export function getMigrationCompatibleAppOrigins(
    value: string | null | undefined
) {
    const origin = normalizeAppOrigin(value);
    if (!origin) return [];

    return isProductionAppOrigin(origin)
        ? [...PRODUCTION_APP_ORIGINS]
        : [origin];
}

export function getBrowserAppOrigin(currentOrigin: string) {
    const current = normalizeAppOrigin(currentOrigin);
    const configured = normalizeAppOrigin(process.env.NEXT_PUBLIC_APP_URL);

    if (
        current &&
        (isProductionAppOrigin(current) ||
            isLocalAppOrigin(current) ||
            isVercelPreviewOrigin(current) ||
            current === configured)
    ) {
        return current;
    }

    return configured || "http://localhost:3000";
}

export function getBrowserAbsoluteAppUrl(path: string, currentOrigin: string) {
    return new URL(path, `${getBrowserAppOrigin(currentOrigin)}/`).toString();
}
