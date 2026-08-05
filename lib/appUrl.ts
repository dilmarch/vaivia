import "server-only";

import {
    isLocalAppOrigin,
    isProductionAppOrigin,
    normalizeAppOrigin,
} from "@/lib/appOrigins";

export type AppUrlEnvironment = {
    NEXT_PUBLIC_APP_URL?: string;
    VERCEL_ENV?: string;
    VERCEL_URL?: string;
};

function runtimeEnvironment(): AppUrlEnvironment {
    return {
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        VERCEL_ENV: process.env.VERCEL_ENV,
        VERCEL_URL: process.env.VERCEL_URL,
    };
}

function getVercelOrigin(value: string | undefined) {
    return normalizeAppOrigin(value ? `https://${value.replace(/^https?:\/\//, "")}` : null);
}

export function getAppUrl(environment: AppUrlEnvironment = runtimeEnvironment()) {
    const configured = normalizeAppOrigin(environment.NEXT_PUBLIC_APP_URL);
    const vercel = getVercelOrigin(environment.VERCEL_URL);

    if (environment.VERCEL_ENV === "preview" && vercel) return vercel;
    if (configured) return configured;
    if (vercel) return vercel;
    return "http://localhost:3000";
}

export function isAllowedServerAppOrigin(
    value: string | null | undefined,
    environment: AppUrlEnvironment = runtimeEnvironment()
) {
    const origin = normalizeAppOrigin(value);
    if (!origin) return false;
    if (isProductionAppOrigin(origin)) return true;
    if (isLocalAppOrigin(origin)) {
        return environment.VERCEL_ENV !== "production";
    }

    const configured = normalizeAppOrigin(environment.NEXT_PUBLIC_APP_URL);
    const vercel = getVercelOrigin(environment.VERCEL_URL);

    return origin === configured || origin === vercel;
}

export function getTrustedRequestOrigin(
    value: string | null | undefined,
    environment: AppUrlEnvironment = runtimeEnvironment()
) {
    const origin = normalizeAppOrigin(value);
    return origin && isAllowedServerAppOrigin(origin, environment)
        ? origin
        : getAppUrl(environment);
}

export function getAbsoluteAppUrl(
    path: string,
    environment: AppUrlEnvironment = runtimeEnvironment()
) {
    return new URL(path, `${getAppUrl(environment)}/`).toString();
}
