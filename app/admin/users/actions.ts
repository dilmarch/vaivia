"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
    getUsernameValidationError,
    isUsernameConflictError,
    normalizeUsername,
} from "@/lib/usernames";

const editableRoles = ["basic_user", "event_organizer", "super_admin"] as const;
const frozenBanDuration = "876000h";

export type AdminUserActionState = {
    ok: boolean;
    message: string;
};

type SupabaseRpcError = {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
};

type AdminUserRpcClient = {
    rpc(
        functionName: "admin_update_user_profile",
        args: {
            target_user_id: string;
            target_first_name: string;
            target_last_name: string;
            target_username: string;
            target_email: string;
            target_role: string;
        }
    ): Promise<{ error: SupabaseRpcError | null }>;
    rpc(
        functionName: "get_admin_users"
    ): Promise<{
        data:
            | Array<{
                  id: string;
                  role: string | null;
              }>
            | null;
        error: SupabaseRpcError | null;
    }>;
};

function getString(formData: FormData, key: string) {
    return String(formData.get(key) || "").trim();
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
    );
}

function isFutureDate(value?: string | null) {
    if (!value) return false;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) && timestamp > Date.now();
}

async function requireSuperAdmin() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (profile?.role !== "super_admin") {
        throw new Error("Only super admins can update users.");
    }

    return { supabase, user };
}

export async function updateAdminUser(
    _previousState: AdminUserActionState,
    formData: FormData
): Promise<AdminUserActionState> {
    try {
        const { supabase, user } = await requireSuperAdmin();
        const userId = getString(formData, "user_id");
        const currentRole = getString(formData, "current_role") || "basic_user";
        const role = getString(formData, "role") || "basic_user";
        const username = normalizeUsername(getString(formData, "username"));
        const usernameError = getUsernameValidationError(username);

        if (usernameError) {
            return { ok: false, message: usernameError };
        }

        if (!editableRoles.includes(role as (typeof editableRoles)[number])) {
            return {
                ok: false,
                message: "Choose a valid user role.",
            };
        }

        if (role === "super_admin" && currentRole !== "super_admin") {
            const password = getString(formData, "admin_password");

            if (!password) {
                return {
                    ok: false,
                    message:
                        "Enter your password to confirm assigning super admin access.",
                };
            }

            if (!user.email) {
                return {
                    ok: false,
                    message:
                        "Your account does not have a password email available for confirmation.",
                };
            }

            const { error: passwordError } =
                await supabase.auth.signInWithPassword({
                    email: user.email,
                    password,
                });

            if (passwordError) {
                return {
                    ok: false,
                    message:
                        "Password confirmation failed. The user role was not changed.",
                };
            }
        }

        const adminRpc = supabase as unknown as AdminUserRpcClient;
        const { error } = await adminRpc.rpc("admin_update_user_profile", {
            target_user_id: userId,
            target_first_name: getString(formData, "first_name"),
            target_last_name: getString(formData, "last_name"),
            target_username: username,
            target_email: getString(formData, "email"),
            target_role: role,
        });

        if (error) {
            console.error("Could not update admin user:", {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
                userId,
            });

            return {
                ok: false,
                message: isUsernameConflictError(error)
                    ? "That username is already taken."
                    : "Could not update user.",
            };
        }

        const { data: adminUsers, error: verifyError } =
            await adminRpc.rpc("get_admin_users");
        const savedProfile = adminUsers?.find(
            (adminUser) => adminUser.id === userId
        );

        if (verifyError) {
            console.error("Could not verify admin user role update:", {
                message: verifyError.message,
                code: verifyError.code,
                details: verifyError.details,
                hint: verifyError.hint,
                userId,
                requestedRole: role,
            });

            return {
                ok: false,
                message:
                    "The user save ran, but VAIVIA could not confirm the updated role. Please refresh and check again.",
            };
        }

        if (savedProfile?.role !== role) {
            console.error("Admin user role verification mismatch:", {
                userId,
                requestedRole: role,
                savedRole: savedProfile?.role,
            });

            return {
                ok: false,
                message:
                    "Supabase did not save the requested role. Please try again.",
            };
        }

        revalidatePath("/admin/users");
        revalidatePath("/admin");

        return {
            ok: true,
            message: "User updated.",
        };
    } catch (error) {
        return {
            ok: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Could not update user.",
        };
    }
}

export async function setAdminUserFrozen(
    _previousState: AdminUserActionState,
    formData: FormData
): Promise<AdminUserActionState> {
    try {
        const { user } = await requireSuperAdmin();
        const userId = getString(formData, "user_id");
        const shouldFreeze = getString(formData, "freeze") === "true";

        if (!isUuid(userId)) {
            return {
                ok: false,
                message: "Choose a valid user account.",
            };
        }

        if (userId === user.id) {
            return {
                ok: false,
                message: "You cannot freeze your own administrator account.",
            };
        }

        const adminSupabase = createServiceRoleClient();
        const { error: updateError } =
            await adminSupabase.auth.admin.updateUserById(userId, {
                ban_duration: shouldFreeze ? frozenBanDuration : "none",
            });

        if (updateError) {
            console.error("Could not update user freeze status:", {
                message: updateError.message,
                code: updateError.code,
                userId,
                shouldFreeze,
            });
            return {
                ok: false,
                message: `Could not ${shouldFreeze ? "freeze" : "unfreeze"} user: ${updateError.message}`,
            };
        }

        const { data: savedUserData, error: verifyError } =
            await adminSupabase.auth.admin.getUserById(userId);
        const savedIsFrozen = isFutureDate(savedUserData.user?.banned_until);

        if (verifyError || savedIsFrozen !== shouldFreeze) {
            console.error("Could not verify user freeze status:", {
                message: verifyError?.message,
                code: verifyError?.code,
                userId,
                shouldFreeze,
                savedIsFrozen,
            });
            return {
                ok: false,
                message:
                    "The account update ran, but VAIVIA could not confirm the new login status. Please refresh and check again.",
            };
        }

        revalidatePath("/admin/users");
        revalidatePath("/admin");

        return {
            ok: true,
            message: shouldFreeze
                ? "User frozen. Supabase Auth will reject new sign-ins and session refreshes."
                : "User unfrozen. They can sign in again.",
        };
    } catch (error) {
        return {
            ok: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Could not update the user login status.",
        };
    }
}
