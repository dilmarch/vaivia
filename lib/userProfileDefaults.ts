type AuthUserLike = {
    id: string;
    email?: string | null;
    created_at?: string | null;
    user_metadata?: Record<string, unknown> | null;
};

export type UserProfileDefaults = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    email: string | null;
    avatar_url: string | null;
    join_date: string | null;
};

function getMetadataString(
    metadata: Record<string, unknown> | null | undefined,
    keys: string[]
) {
    for (const key of keys) {
        const value = metadata?.[key];
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }

    return "";
}

function splitFullName(fullName: string) {
    const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
    if (!nameParts.length) return { firstName: "", lastName: "" };

    return {
        firstName: nameParts[0] || "",
        lastName: nameParts.slice(1).join(" "),
    };
}

export function getUserProfileDefaults(user: AuthUserLike): UserProfileDefaults {
    const metadata = user.user_metadata;
    const fullName = getMetadataString(metadata, [
        "full_name",
        "name",
        "display_name",
    ]);
    const splitName = splitFullName(fullName);
    const firstName =
        getMetadataString(metadata, ["given_name", "first_name"]) ||
        splitName.firstName;
    const lastName =
        getMetadataString(metadata, ["family_name", "last_name"]) ||
        splitName.lastName;
    const username = getMetadataString(metadata, [
        "preferred_username",
        "user_name",
        "nickname",
    ]);
    const avatarUrl = getMetadataString(metadata, [
        "avatar_url",
        "picture",
        "image",
    ]);

    return {
        id: user.id,
        first_name: firstName || null,
        last_name: lastName || null,
        username: username || null,
        email: user.email || null,
        avatar_url: avatarUrl || null,
        join_date: user.created_at || null,
    };
}

export function mergeProfileWithAuthDefaults<
    TProfile extends Partial<UserProfileDefaults> | null | undefined,
>(profile: TProfile, defaults: UserProfileDefaults) {
    return {
        ...(profile || {}),
        id: profile?.id || defaults.id,
        first_name: profile?.first_name || defaults.first_name,
        last_name: profile?.last_name || defaults.last_name,
        username: profile?.username || defaults.username,
        email: profile?.email || defaults.email,
        avatar_url: profile?.avatar_url || defaults.avatar_url,
        join_date: profile?.join_date || defaults.join_date,
    };
}
