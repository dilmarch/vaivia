import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/supabase";

export const ONBOARDING_FLOW_VERSION = 1;

export type OnboardingStatus =
    | "not_started"
    | "in_progress"
    | "completed"
    | "dismissed";

export type OnboardingStep =
    | "welcome"
    | "create_trip"
    | "add_first_item"
    | "complete";

export type OnboardingProgress = {
    user_id: string;
    flow_version: number;
    status: OnboardingStatus;
    current_step: OnboardingStep | null;
    completed_steps: OnboardingStep[];
    started_at: string | null;
    completed_at: string | null;
    dismissed_at: string | null;
    updated_at: string | null;
};

type OnboardingSupabase = SupabaseClient<Database>;
type OnboardingProgressRow =
    Database["public"]["Tables"]["user_onboarding_progress"]["Row"];

const VALID_STEPS = new Set<OnboardingStep>([
    "welcome",
    "create_trip",
    "add_first_item",
    "complete",
]);

function normalizeStep(value: unknown): OnboardingStep | null {
    return typeof value === "string" && VALID_STEPS.has(value as OnboardingStep)
        ? (value as OnboardingStep)
        : null;
}

function normalizeProgress(row: OnboardingProgressRow | null): OnboardingProgress | null {
    if (!row || typeof row.user_id !== "string") return null;

    return {
        user_id: row.user_id,
        flow_version:
            typeof row.flow_version === "number"
                ? row.flow_version
                : ONBOARDING_FLOW_VERSION,
        status:
            row.status === "completed" ||
            row.status === "dismissed" ||
            row.status === "not_started"
                ? row.status
                : "in_progress",
        current_step: normalizeStep(row.current_step),
        completed_steps: Array.isArray(row.completed_steps)
            ? row.completed_steps
                  .map(normalizeStep)
                  .filter(
                      (step: OnboardingStep | null): step is OnboardingStep =>
                          Boolean(step)
                  )
            : [],
        started_at: row.started_at || null,
        completed_at: row.completed_at || null,
        dismissed_at: row.dismissed_at || null,
        updated_at: row.updated_at || null,
    };
}

export async function loadOnboardingProgress(
    supabase: OnboardingSupabase,
    userId: string
) {
    const { data, error } = await supabase
        .from("user_onboarding_progress")
        .select(
            "user_id,flow_version,status,current_step,completed_steps,started_at,completed_at,dismissed_at,updated_at"
        )
        .eq("user_id", userId)
        .maybeSingle();

    return {
        data: normalizeProgress(data),
        error,
    };
}

export async function ensureNewUserOnboardingProgress(
    supabase: OnboardingSupabase,
    userId: string
) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("user_onboarding_progress")
        .upsert(
            {
                user_id: userId,
                flow_version: ONBOARDING_FLOW_VERSION,
                status: "in_progress",
                current_step: "welcome",
                completed_steps: [],
                started_at: now,
                completed_at: null,
                dismissed_at: null,
                updated_at: now,
            },
            { onConflict: "user_id", ignoreDuplicates: true }
        )
        .select(
            "user_id,flow_version,status,current_step,completed_steps,started_at,completed_at,dismissed_at,updated_at"
        )
        .maybeSingle();

    return {
        data: normalizeProgress(data),
        error,
    };
}

export async function replayOnboarding(
    supabase: OnboardingSupabase,
    userId: string
) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("user_onboarding_progress")
        .upsert(
            {
                user_id: userId,
                flow_version: ONBOARDING_FLOW_VERSION,
                status: "in_progress",
                current_step: "welcome",
                completed_steps: [],
                started_at: now,
                completed_at: null,
                dismissed_at: null,
                updated_at: now,
            },
            { onConflict: "user_id" }
        )
        .select(
            "user_id,flow_version,status,current_step,completed_steps,started_at,completed_at,dismissed_at,updated_at"
        )
        .maybeSingle();

    return {
        data: normalizeProgress(data),
        error,
    };
}

export async function markOnboardingStepCompleted({
    supabase,
    userId,
    step,
    nextStep,
}: {
    supabase: OnboardingSupabase;
    userId: string;
    step: OnboardingStep;
    nextStep?: OnboardingStep;
}) {
    const { data: current, error: loadError } = await loadOnboardingProgress(
        supabase,
        userId
    );

    if (loadError || !current || current.status !== "in_progress") {
        return { data: current, error: loadError };
    }

    const now = new Date().toISOString();
    const completedSteps = Array.from(
        new Set([...current.completed_steps, step])
    );

    const { data, error } = await supabase
        .from("user_onboarding_progress")
        .update({
            completed_steps: completedSteps,
            current_step: nextStep || current.current_step,
            updated_at: now,
        })
        .eq("user_id", userId)
        .select(
            "user_id,flow_version,status,current_step,completed_steps,started_at,completed_at,dismissed_at,updated_at"
        )
        .maybeSingle();

    return {
        data: normalizeProgress(data),
        error,
    };
}

export async function completeOnboarding(
    supabase: OnboardingSupabase,
    userId: string
) {
    const { data: current } = await loadOnboardingProgress(supabase, userId);
    const now = new Date().toISOString();
    const completedSteps = Array.from(
        new Set([...(current?.completed_steps || []), "complete"])
    );

    const { data, error } = await supabase
        .from("user_onboarding_progress")
        .upsert(
            {
                user_id: userId,
                flow_version: ONBOARDING_FLOW_VERSION,
                status: "completed",
                current_step: "complete",
                completed_steps: completedSteps,
                started_at: current?.started_at || now,
                completed_at: now,
                dismissed_at: null,
                updated_at: now,
            },
            { onConflict: "user_id" }
        )
        .select(
            "user_id,flow_version,status,current_step,completed_steps,started_at,completed_at,dismissed_at,updated_at"
        )
        .maybeSingle();

    return {
        data: normalizeProgress(data),
        error,
    };
}

export async function dismissOnboarding(
    supabase: OnboardingSupabase,
    userId: string
) {
    const { data: current } = await loadOnboardingProgress(supabase, userId);
    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from("user_onboarding_progress")
        .upsert(
            {
                user_id: userId,
                flow_version: current?.flow_version || ONBOARDING_FLOW_VERSION,
                status: "dismissed",
                current_step: current?.current_step || "welcome",
                completed_steps: current?.completed_steps || [],
                started_at: current?.started_at || now,
                completed_at: current?.completed_at || null,
                dismissed_at: now,
                updated_at: now,
            },
            { onConflict: "user_id" }
        )
        .select(
            "user_id,flow_version,status,current_step,completed_steps,started_at,completed_at,dismissed_at,updated_at"
        )
        .maybeSingle();

    return {
        data: normalizeProgress(data),
        error,
    };
}
