"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const suggestionTypes = new Set(["feature", "bug", "feedback"]);

function cleanOptional(value: FormDataEntryValue | null) {
    const text = String(value || "").trim();
    return text || null;
}

export async function createFeatureSuggestion(formData: FormData) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const rawType = String(formData.get("suggestion_type") || "feature");
    const suggestionType = suggestionTypes.has(rawType) ? rawType : "feature";
    const message = String(formData.get("message") || "").trim();

    if (!message) {
        throw new Error("Tell us what you would like VAIVIA to improve.");
    }

    const headerStore = await headers();
    const payload = {
        user_id: user.id,
        suggestion_type: suggestionType,
        title: cleanOptional(formData.get("title")),
        message,
        current_path: cleanOptional(formData.get("current_path")),
        contact_email: cleanOptional(formData.get("contact_email")) || user.email || null,
        user_agent: headerStore.get("user-agent"),
        metadata: {
            source: "global_quick_add",
        },
        updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("feature_suggestions").insert(payload);

    if (error) {
        console.error("Error creating feature suggestion:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            userId: user.id,
            payload: {
                ...payload,
                message: "[redacted]",
            },
        });
        throw new Error("Could not send suggestion. Please try again.");
    }
}
