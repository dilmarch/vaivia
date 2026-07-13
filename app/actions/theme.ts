"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const THEME_MODES = new Set([
    "dark",
    "pink",
    "greyscale",
    "brat",
    "pride",
    "light",
]);

export async function saveAccountThemeMode(themeMode: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user || !THEME_MODES.has(themeMode)) {
        return { ok: false };
    }

    const { data, error } = await supabase
        .from("user_preferences")
        .upsert(
            {
                user_id: user.id,
                theme_mode: themeMode,
            },
            { onConflict: "user_id" }
        )
        .select("theme_mode")
        .single();

    if (error) {
        console.error("Could not save account theme mode:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
        });
        return { ok: false };
    }

    if (!data || data.theme_mode !== themeMode) {
        console.error("Could not confirm saved account theme mode:", {
            requestedThemeMode: themeMode,
            savedThemeMode: data?.theme_mode,
            userId: user.id,
        });
        return { ok: false };
    }

    revalidatePath("/");
    revalidatePath("/settings");
    revalidatePath("/admin");
    revalidatePath("/admin/stats");
    revalidatePath("/admin/users");

    return { ok: true, themeMode: data.theme_mode };
}
