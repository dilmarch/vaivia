const DEFAULT_AUTH_CONFIRM_DESTINATION = "/";
const AUTH_CONFIRM_PATH = "/auth/confirm";

type MaybeAuthUser = {
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
} | null | undefined;

type MaybeAuthError = {
    code?: string | null;
    message?: string | null;
    status?: number | null;
} | null | undefined;

function isAuthConfirmPath(pathname: string) {
    return pathname === AUTH_CONFIRM_PATH || pathname.startsWith(`${AUTH_CONFIRM_PATH}/`);
}

function toSafeRelativePath(path: string) {
    if (!path.startsWith("/") || path.startsWith("//")) {
        return DEFAULT_AUTH_CONFIRM_DESTINATION;
    }

    try {
        const parsed = new URL(path, "https://vaivia.local");
        if (isAuthConfirmPath(parsed.pathname)) {
            return DEFAULT_AUTH_CONFIRM_DESTINATION;
        }

        return `${parsed.pathname}${parsed.search}${parsed.hash}` || DEFAULT_AUTH_CONFIRM_DESTINATION;
    } catch {
        return DEFAULT_AUTH_CONFIRM_DESTINATION;
    }
}

export function normalizeAuthConfirmNext(
    nextValue: string | null | undefined,
    requestOrigin: string
) {
    const trimmedNext = String(nextValue || "").trim();

    if (!trimmedNext || trimmedNext.startsWith("//")) {
        return DEFAULT_AUTH_CONFIRM_DESTINATION;
    }

    if (trimmedNext.startsWith("/")) {
        return toSafeRelativePath(trimmedNext);
    }

    try {
        const requestOriginUrl = new URL(requestOrigin);
        const nextUrl = new URL(trimmedNext);

        if (nextUrl.origin !== requestOriginUrl.origin) {
            return DEFAULT_AUTH_CONFIRM_DESTINATION;
        }

        return toSafeRelativePath(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    } catch {
        return DEFAULT_AUTH_CONFIRM_DESTINATION;
    }
}

export function isExpiredOrConsumedOtpError(error: MaybeAuthError) {
    const code = String(error?.code || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();

    return (
        code === "otp_expired" ||
        code === "otp_disabled" ||
        (error?.status === 403 &&
            (message.includes("expired") ||
                message.includes("invalid") ||
                message.includes("already")))
    );
}

export function isEmailConfirmedAuthUser(user: MaybeAuthUser) {
    return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}

export function getAlreadyConfirmedAuthRedirect({
    error,
    user,
}: {
    error: MaybeAuthError;
    user: MaybeAuthUser;
}) {
    return isExpiredOrConsumedOtpError(error) && isEmailConfirmedAuthUser(user)
        ? DEFAULT_AUTH_CONFIRM_DESTINATION
        : null;
}

export function getMissingTokenAuthenticatedRedirect(user: MaybeAuthUser) {
    return isEmailConfirmedAuthUser(user) ? DEFAULT_AUTH_CONFIRM_DESTINATION : null;
}
