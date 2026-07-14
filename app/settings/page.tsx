import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import CountdownUnitToggle from "@/components/CountdownUnitToggle";
import MarketingConsentToggle from "@/components/MarketingConsentToggle";
import PinkModeToggle from "@/components/PinkModeToggle";
import type { VaiviaThemeMode } from "@/components/PinkModeProvider";
import SettingsCategoriesClient from "@/components/SettingsCategoriesClient";
import SettingsDataClient from "@/components/SettingsDataClient";
import SettingsFamilyMembersClient from "@/components/SettingsFamilyMembersClient";
import SettingsFinancialClient from "@/components/SettingsFinancialClient";
import SettingsNotificationsClient from "@/components/SettingsNotificationsClient";
import SettingsSecurityClient from "@/components/SettingsSecurityClient";
import { ALL_CURRENCY_OPTIONS, normalizeCurrencyCode } from "@/lib/currency";
import { isCountdownUnit, type CountdownUnit } from "@/lib/countdownDisplay";
import { mergeNotificationPreferences } from "@/lib/notificationTypes";
import { createClient } from "@/lib/supabase/server";
import {
    sortCategoriesByName,
    type CategoryColorOption,
    type UserCategory,
} from "@/lib/itineraryCategories";
import {
    getFamilyLimitMessage,
    normalizeFamilyMemberPayload,
    type FamilyMember,
} from "@/lib/travelers";

type SettingsPageProps = {
    searchParams?: Promise<{
        section?: string;
        message?: string;
    }>;
};

type NotificationPreferenceRow = {
    notification_type?: string | null;
    in_app_enabled?: boolean | null;
    push_enabled?: boolean | null;
    email_enabled?: boolean | null;
};

type SettingsUntypedClient = {
    rpc?: (
        functionName:
            | "set_marketing_email_consent"
            | "request_current_user_account_deletion",
        args: { consent: boolean }
    ) => Promise<{ data: null; error: { message?: string } | null }>;
    from: (table: "user_notification_preferences") => {
        select: (columns: string) => {
            eq: (
                column: string,
                value: string
            ) => Promise<{ data: NotificationPreferenceRow[] | null; error: unknown }>;
        };
    };
};

function friendlyCategoryMessage(message?: string) {
    if (message === "max-categories") return "You can have up to 20 categories.";
    if (message === "blank-name") return "Category name cannot be blank.";
    return "";
}

function friendlyFamilyMessage(message?: string) {
    if (message === "max-family-members") return "You can add up to 10 family members.";
    if (message === "blank-family-name") return "Family member name is required.";
    return "";
}

function isMaxCategoryError(error: { message?: string; code?: string }) {
    const message = error.message?.toLowerCase() || "";
    return message.includes("20") || message.includes("max") || error.code === "23514";
}

function isMaxFamilyMemberError(error: { message?: string; code?: string }) {
    return Boolean(getFamilyLimitMessage(error.message) || error.code === "23514");
}

function getAuthProviderLabel(provider?: string | null) {
    if (provider === "azure") return "Microsoft";
    if (provider === "google") return "Google";
    if (provider === "email") return "Email/password";
    return provider || "Unknown";
}

const THEME_MODES = new Set<VaiviaThemeMode>([
    "dark",
    "pink",
    "greyscale",
    "brat",
    "pride",
    "light",
]);

function normalizeThemeMode(value: unknown): VaiviaThemeMode {
    return typeof value === "string" && THEME_MODES.has(value as VaiviaThemeMode)
        ? (value as VaiviaThemeMode)
        : "dark";
}

function normalizeNewsFeedMode(value: unknown): "integrated" | "widget" {
    return value === "widget" ? "widget" : "integrated";
}

async function addFamilyMember(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const payload = normalizeFamilyMemberPayload(formData, user.id);
    if (!payload.name) redirect("/settings?section=family&message=blank-family-name");

    const { error } = await supabase.from("user_family_members").insert(payload);

    if (error) {
        console.error("Error adding family member:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload,
        });
        if (isMaxFamilyMemberError(error)) {
            redirect("/settings?section=family&message=max-family-members");
        }
        throw new Error(`Could not add family member: ${error.message}`);
    }

    revalidatePath("/settings");
    redirect("/settings?section=family");
}

async function updateFamilyMember(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const familyMemberId = String(formData.get("family_member_id") || "");
    const payload = normalizeFamilyMemberPayload(formData, user.id);
    if (!payload.name) redirect("/settings?section=family&message=blank-family-name");

    const { user_id: _userId, ...updatePayload } = payload;
    void _userId;

    const { error } = await supabase
        .from("user_family_members")
        .update({ ...updatePayload, updated_at: new Date().toISOString() })
        .eq("id", familyMemberId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error updating family member:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload: updatePayload,
            familyMemberId,
        });
        throw new Error(`Could not update family member: ${error.message}`);
    }

    revalidatePath("/settings");
    redirect("/settings?section=family");
}

async function deleteFamilyMember(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const familyMemberId = String(formData.get("family_member_id") || "");
    const { error } = await supabase
        .from("user_family_members")
        .delete()
        .eq("id", familyMemberId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error deleting family member:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            familyMemberId,
        });
        throw new Error(`Could not delete family member: ${error.message}`);
    }

    revalidatePath("/settings");
    redirect("/settings?section=family");
}

async function addCategory(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const name = String(formData.get("name") || "").trim();
    const colorKey = String(formData.get("color_key") || "").trim();

    if (!name) redirect("/settings?section=categories&message=blank-name");

    const { error } = await supabase.from("user_categories").insert({
        user_id: user.id,
        name,
        color_key: colorKey || null,
    });

    if (error) {
        console.error("Error adding itinerary category:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload: { user_id: user.id, name, color_key: colorKey || null },
        });
        if (isMaxCategoryError(error)) {
            redirect("/settings?section=categories&message=max-categories");
        }
        throw new Error(`Could not add category: ${error.message}`);
    }

    revalidatePath("/settings");
    redirect("/settings?section=categories");
}

async function updateCategory(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const categoryId = String(formData.get("category_id") || "");
    const name = String(formData.get("name") || "").trim();
    const colorKey = String(formData.get("color_key") || "").trim();

    if (!name) redirect("/settings?section=categories&message=blank-name");

    const { error } = await supabase
        .from("user_categories")
        .update({
            name,
            color_key: colorKey || null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", categoryId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error updating itinerary category:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload: { categoryId, name, color_key: colorKey || null },
        });
        throw new Error(`Could not update category: ${error.message}`);
    }

    revalidatePath("/settings");
    redirect("/settings?section=categories");
}

async function deleteCategory(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const categoryId = String(formData.get("category_id") || "");
    const { error } = await supabase
        .from("user_categories")
        .delete()
        .eq("id", categoryId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error deleting itinerary category:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            categoryId,
        });
        throw new Error(`Could not delete category: ${error.message}`);
    }

    revalidatePath("/settings");
    redirect("/settings?section=categories");
}

async function updateFinanceSettings(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const homeCurrency = normalizeCurrencyCode(formData.get("home_currency"), "CAD");
    const payload = {
        user_id: user.id,
        home_currency: homeCurrency,
        updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
        .from("user_finance_settings")
        .upsert(payload, { onConflict: "user_id" });

    if (error) {
        console.error("Error updating financial settings:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload,
        });
        throw new Error(`Could not update financial settings: ${error.message}`);
    }

    revalidatePath("/settings");
    revalidatePath("/trips/[tripId]/budget", "page");
    revalidatePath("/trips/[tripId]/budget/expenses", "page");
    redirect("/settings?section=financial");
}

async function updateCountdownDisplayMode(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const rawMode = String(formData.get("countdown_display_mode") || "").trim();
    const countdownDisplayMode = isCountdownUnit(rawMode) ? rawMode : "days";
    const { data: existingPreferences } = await supabase
        .from("user_preferences")
        .select("clock_format,default_time_zone,itinerary_default_view")
        .eq("user_id", user.id)
        .maybeSingle();
    const payload = {
        user_id: user.id,
        clock_format:
            existingPreferences?.clock_format === "24h" ? "24h" : "12h",
        default_time_zone: existingPreferences?.default_time_zone || null,
        itinerary_default_view:
            existingPreferences?.itinerary_default_view === "day" ||
            existingPreferences?.itinerary_default_view === "week"
                ? existingPreferences.itinerary_default_view
                : "list",
        countdown_display_mode: countdownDisplayMode,
        updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
        .from("user_preferences")
        .upsert(payload, { onConflict: "user_id" });

    if (error) {
        console.error("Error updating countdown display mode:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload,
        });
        throw new Error(`Could not update countdown display mode: ${error.message}`);
    }

    revalidatePath("/settings");
    revalidatePath("/");
}

async function updateNewsFeedMode(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const newsFeedMode = normalizeNewsFeedMode(formData.get("news_feed_mode"));
    const { data: existingPreferences } = await supabase
        .from("user_preferences")
        .select(
            "clock_format,default_time_zone,itinerary_default_view,countdown_display_mode,theme_mode"
        )
        .eq("user_id", user.id)
        .maybeSingle();
    const rawCountdownDisplayMode =
        typeof existingPreferences?.countdown_display_mode === "string"
            ? existingPreferences.countdown_display_mode
            : null;
    const payload = {
        user_id: user.id,
        clock_format:
            existingPreferences?.clock_format === "24h" ? "24h" : "12h",
        default_time_zone: existingPreferences?.default_time_zone || null,
        itinerary_default_view:
            existingPreferences?.itinerary_default_view === "day" ||
            existingPreferences?.itinerary_default_view === "week"
                ? existingPreferences.itinerary_default_view
                : "list",
        countdown_display_mode: isCountdownUnit(rawCountdownDisplayMode)
            ? rawCountdownDisplayMode
            : "days",
        theme_mode: normalizeThemeMode(existingPreferences?.theme_mode),
        news_feed_mode: newsFeedMode,
        updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
        .from("user_preferences")
        .upsert(payload, { onConflict: "user_id" });

    if (error) {
        console.error("Error updating news feed mode:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload,
        });
        throw new Error(`Could not update news feed mode: ${error.message}`);
    }

    revalidatePath("/settings");
    revalidatePath("/news-feed");
    redirect("/settings");
}

async function updateTimeDatePreferences(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const clockFormat =
        String(formData.get("clock_format") || "") === "24h" ? "24h" : "12h";
    const defaultTimeZone =
        String(formData.get("default_time_zone") || "").trim() || null;
    const rawDefaultView = String(
        formData.get("itinerary_default_view") || ""
    ).trim();
    const itineraryDefaultView =
        rawDefaultView === "day" || rawDefaultView === "week"
            ? rawDefaultView
            : "list";
    const { data: existingPreferences } = await supabase
        .from("user_preferences")
        .select("countdown_display_mode")
        .eq("user_id", user.id)
        .maybeSingle();
    const rawCountdownDisplayMode =
        typeof existingPreferences?.countdown_display_mode === "string"
            ? existingPreferences.countdown_display_mode
            : null;
    const payload = {
        user_id: user.id,
        clock_format: clockFormat,
        default_time_zone: defaultTimeZone,
        itinerary_default_view: itineraryDefaultView,
        countdown_display_mode: isCountdownUnit(rawCountdownDisplayMode)
            ? rawCountdownDisplayMode
            : "days",
        updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
        .from("user_preferences")
        .upsert(payload, { onConflict: "user_id" });

    if (error) {
        console.error("Error updating time/date preferences:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload,
        });
        throw new Error(`Could not update time/date preferences: ${error.message}`);
    }

    revalidatePath("/settings");
    revalidatePath("/trips/[tripId]", "page");
    redirect("/settings?section=time-date");
}

async function updateSecuritySettings(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const biometricLoginEnabled =
        String(formData.get("biometric_login_enabled") || "") === "true";
    const payload = {
        biometric_login_enabled: biometricLoginEnabled,
        biometric_login_enabled_at: biometricLoginEnabled
            ? new Date().toISOString()
            : null,
        updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
        .from("user_profiles")
        .update(payload)
        .eq("id", user.id);

    if (error) {
        console.error("Error updating password/security settings:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            userId: user.id,
            payload,
        });
        throw new Error(`Could not update security settings: ${error.message}`);
    }

    revalidatePath("/settings");
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
    const params = searchParams ? await searchParams : {};
    const activeSection =
        params.section === "categories"
            ? "categories"
            : params.section === "family"
              ? "family"
              : params.section === "financial"
                ? "financial"
                : params.section === "time-date"
                  ? "time-date"
                  : params.section === "security"
                    ? "security"
                    : params.section === "notifications" ||
                        params.section === "communications"
                      ? "communications"
                      : params.section === "data"
                        ? "data"
                      : "general";
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const [
        { data: categoryRows },
        { data: colorRows },
        { data: familyRows },
        { data: financeSettings },
        { data: userPreferences },
        { data: userProfile },
        { data: notificationPreferenceRows },
    ] =
        await Promise.all([
        supabase
            .from("user_categories")
            .select("id,user_id,name,color_key,is_default,created_at,updated_at")
            .eq("user_id", user.id),
        supabase
            .from("category_color_options")
            .select("key,label,hex,sort_order")
            .order("sort_order", { ascending: true }),
        supabase
            .from("user_family_members")
            .select("id,user_id,name,relationship,avatar_url,notes,created_at,updated_at")
            .eq("user_id", user.id)
            .order("name", { ascending: true }),
        supabase
            .from("user_finance_settings")
            .select("home_currency")
            .eq("user_id", user.id)
            .maybeSingle(),
        supabase
            .from("user_preferences")
            .select(
                "clock_format,default_time_zone,itinerary_default_view,countdown_display_mode,theme_mode,news_feed_mode"
            )
            .eq("user_id", user.id)
            .maybeSingle(),
        supabase
            .from("user_profiles")
            .select(
                "biometric_login_enabled,role,marketing_emails_consent,marketing_emails_consent_decided_at,account_deletion_requested_at,data_center_preference"
            )
            .eq("id", user.id)
            .maybeSingle(),
        (supabase as unknown as SettingsUntypedClient)
            .from("user_notification_preferences")
            .select(
                "notification_type,in_app_enabled,push_enabled,email_enabled"
            )
            .eq("user_id", user.id),
    ]);

    const categories = sortCategoriesByName((categoryRows || []) as UserCategory[]);
    const colors = ((colorRows || []) as CategoryColorOption[]).sort(
        (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
    );
    const familyMembers = ((familyRows || []) as FamilyMember[]).sort((a, b) =>
        a.name.localeCompare(b.name)
    );
    const currentCurrency =
        typeof financeSettings?.home_currency === "string"
            ? financeSettings.home_currency
            : null;
    const rawCountdownDisplayMode =
        typeof userPreferences?.countdown_display_mode === "string"
            ? userPreferences.countdown_display_mode
            : null;
    const countdownDisplayMode: CountdownUnit = isCountdownUnit(
        rawCountdownDisplayMode
    )
        ? rawCountdownDisplayMode
        : "days";
    const themeMode = normalizeThemeMode(userPreferences?.theme_mode);
    const isSuperAdmin = userProfile?.role === "super_admin";
    const newsFeedMode = normalizeNewsFeedMode(
        (userPreferences as { news_feed_mode?: unknown } | null)?.news_feed_mode
    );
    const notificationPreferences = mergeNotificationPreferences(
        notificationPreferenceRows || []
    );
    const currencyOptions = ALL_CURRENCY_OPTIONS.map((currency) => ({
        code: currency.code,
        name: currency.name,
        symbol: currency.symbol,
    }));
    const identityProviders = new Set(
        (user.identities || [])
            .map((identity) => identity.provider)
            .filter(Boolean)
    );
    const fallbackProvider =
        typeof user.app_metadata?.provider === "string"
            ? user.app_metadata.provider
            : "";
    if (fallbackProvider) identityProviders.add(fallbackProvider);
    const canChangePassword =
        identityProviders.has("email") || identityProviders.size === 0;
    const socialProviderLabels = Array.from(identityProviders)
        .filter((provider) => provider !== "email")
        .map(getAuthProviderLabel);
    const authProviderLabels =
        socialProviderLabels.length > 0
            ? socialProviderLabels
            : Array.from(identityProviders).map(getAuthProviderLabel);

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-8 pt-[calc(6.25rem+var(--safe-area-top))] text-white md:py-8 md:pl-28">
            <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[220px_1fr]">
                <aside className="rounded-[1.5rem] border border-white/10 bg-[#080511]/90 p-3 shadow-2xl shadow-black/30">
                    <p className="px-3 py-2 text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                        Settings
                    </p>
                    <nav className="mt-2 space-y-2" aria-label="Settings">
                        <Link
                            href="/settings"
                            className={`block rounded-full px-4 py-2 text-sm font-bold transition ${
                                activeSection === "general"
                                    ? "bg-lime-300 text-slate-950"
                                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            General
                        </Link>
                        <Link
                            href="/settings?section=time-date"
                            className={`block rounded-full px-4 py-2 text-sm font-bold transition ${
                                activeSection === "time-date"
                                    ? "bg-lime-300 text-slate-950"
                                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            Time/date
                        </Link>
                        <Link
                            href="/settings?section=security"
                            className={`block rounded-full px-4 py-2 text-sm font-bold transition ${
                                activeSection === "security"
                                    ? "bg-lime-300 text-slate-950"
                                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            Password & Security
                        </Link>
                        <Link
                            href="/settings?section=communications"
                            className={`block rounded-full px-4 py-2 text-sm font-bold transition ${
                                activeSection === "communications"
                                    ? "bg-lime-300 text-slate-950"
                                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            Communications
                        </Link>
                        <Link
                            href="/settings?section=data"
                            className={`block rounded-full px-4 py-2 text-sm font-bold transition ${
                                activeSection === "data"
                                    ? "bg-lime-300 text-slate-950"
                                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            Data
                        </Link>
                        <Link
                            href="/settings?section=categories"
                            className={`block rounded-full px-4 py-2 text-sm font-bold transition ${
                                activeSection === "categories"
                                    ? "bg-lime-300 text-slate-950"
                                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            Categories
                        </Link>
                        <Link
                            href="/settings?section=family"
                            className={`block rounded-full px-4 py-2 text-sm font-bold transition ${
                                activeSection === "family"
                                    ? "bg-lime-300 text-slate-950"
                                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            Family Members
                        </Link>
                        <Link
                            href="/settings?section=financial"
                            className={`block rounded-full px-4 py-2 text-sm font-bold transition ${
                                activeSection === "financial"
                                    ? "bg-lime-300 text-slate-950"
                                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            Financial
                        </Link>
                    </nav>
                </aside>

                <section className="rounded-[2rem] border border-white/10 bg-[#03030a]/90 p-6 shadow-2xl shadow-black/30">
                    {activeSection === "general" ? (
                        <div className="space-y-6">
                            <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                                General
                            </p>
                            <div>
                                <h1 className="mt-2 text-3xl font-black">
                                    General settings
                                </h1>
                                <p className="mt-2 text-slate-400">
                                    Personalize the look and feel of VAIVIA with
                                    a site-wide theme.
                                </p>
                            </div>
                            <PinkModeToggle
                                initialThemeMode={themeMode}
                            />
                            {isSuperAdmin ? (
                            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/80">
                                        News Feed
                                    </p>
                                    <h2 className="mt-2 text-2xl font-black text-white">
                                        Feed layout
                                    </h2>
                                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-400">
                                        Choose a single integrated feed or four dashboard-style widgets.
                                    </p>
                                </div>
                                <form
                                    action={updateNewsFeedMode}
                                    className="mt-5 grid gap-3 sm:grid-cols-2"
                                >
                                    {(["integrated", "widget"] as const).map((mode) => {
                                        const isSelected =
                                            newsFeedMode === mode;

                                        return (
                                            <button
                                                key={mode}
                                                type="submit"
                                                name="news_feed_mode"
                                                value={mode}
                                                aria-pressed={isSelected}
                                                className={`min-h-20 rounded-[1.25rem] border p-4 text-left transition ${
                                                    isSelected
                                                        ? "border-lime-300/50 bg-lime-300 text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)]"
                                                        : "border-white/10 bg-slate-950/50 text-white hover:border-lime-300/30 hover:bg-white/[0.08]"
                                                }`}
                                            >
                                                <span className="block text-sm font-black">
                                                    {mode === "integrated"
                                                        ? "Integrated"
                                                        : "Widget"}
                                                </span>
                                                <span
                                                    className={`mt-1 block text-xs font-semibold leading-5 ${
                                                        isSelected
                                                            ? "text-slate-950/70"
                                                            : "text-slate-400"
                                                    }`}
                                                >
                                                    {mode === "integrated"
                                                        ? "One scrollable feed with post-type borders."
                                                        : "Four quadrants for friends, weather, advisories, and local news."}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </form>
                            </section>
                            ) : null}
                        </div>
                    ) : activeSection === "time-date" ? (
                        <div className="space-y-6">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                                    Time/date
                                </p>
                                <h1 className="mt-2 text-3xl font-black">
                                    Time and date preferences
                                </h1>
                                <p className="mt-2 text-slate-400">
                                    Set itinerary defaults, time display, timezone, and
                                    countdown style.
                                </p>
                            </div>
                            <form
                                action={updateTimeDatePreferences}
                                className="grid gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 sm:grid-cols-2"
                            >
                                <label className="block">
                                    <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                        Clock format
                                    </span>
                                    <select
                                        name="clock_format"
                                        defaultValue={
                                            userPreferences?.clock_format === "24h"
                                                ? "24h"
                                                : "12h"
                                        }
                                        className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-bold text-white"
                                    >
                                        <option value="12h">12-hour clock</option>
                                        <option value="24h">24-hour clock</option>
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                        Default itinerary view
                                    </span>
                                    <select
                                        name="itinerary_default_view"
                                        defaultValue={
                                            userPreferences?.itinerary_default_view ===
                                                "day" ||
                                            userPreferences?.itinerary_default_view ===
                                                "week"
                                                ? userPreferences.itinerary_default_view
                                                : "list"
                                        }
                                        className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-bold text-white"
                                    >
                                        <option value="list">List</option>
                                        <option value="day">Day</option>
                                        <option value="week">Week</option>
                                    </select>
                                </label>
                                <label className="block sm:col-span-2">
                                    <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                        Default time zone
                                    </span>
                                    <input
                                        name="default_time_zone"
                                        defaultValue={
                                            userPreferences?.default_time_zone || ""
                                        }
                                        placeholder="Device timezone"
                                        className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-bold text-white placeholder:text-slate-500"
                                    />
                                </label>
                                <div className="sm:col-span-2">
                                    <button
                                        type="submit"
                                        className="rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:bg-lime-200"
                                    >
                                        Save time/date preferences
                                    </button>
                                </div>
                            </form>
                            <CountdownUnitToggle
                                initialUnit={countdownDisplayMode}
                                updateAction={updateCountdownDisplayMode}
                            />
                        </div>
                    ) : activeSection === "security" ? (
                        <div className="space-y-6">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                                    Password & Security
                                </p>
                                <h1 className="mt-2 text-3xl font-black">
                                    Password & Security
                                </h1>
                                <p className="mt-2 text-slate-400">
                                    Manage Face ID preferences and sign-in
                                    credentials for your VAIVIA account.
                                </p>
                            </div>
                            <SettingsSecurityClient
                                canChangePassword={canChangePassword}
                                authProviderLabels={authProviderLabels}
                                biometricEnabled={Boolean(
                                    userProfile?.biometric_login_enabled
                                )}
                                updateBiometricAction={updateSecuritySettings}
                            />
                        </div>
                    ) : activeSection === "communications" ? (
                        <div className="space-y-6">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                                    Communications
                                </p>
                                <h1 className="mt-2 text-3xl font-black">
                                    Communication settings
                                </h1>
                                <p className="mt-2 text-slate-400">
                                    Manage marketing email consent and choose
                                    which VAIVIA notifications appear in-app, by
                                    push, or by email.
                                </p>
                            </div>
                            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5">
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-[0.2em] text-lime-200">
                                            Marketing consent
                                        </p>
                                        <h2 className="mt-2 text-2xl font-black">
                                            Promotions and app updates
                                        </h2>
                                        <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
                                            Receive occasional marketing emails
                                            about VAIVIA promotions, launches, and
                                            product updates. You can opt out any
                                            time.
                                        </p>
                                    </div>
                                    <MarketingConsentToggle
                                        initialEnabled={Boolean(
                                            userProfile?.marketing_emails_consent
                                        )}
                                    />
                                </div>
                            </section>
                            <SettingsNotificationsClient
                                preferences={notificationPreferences}
                                vapidPublicKey={
                                    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null
                                }
                            />
                        </div>
                    ) : activeSection === "data" ? (
                        <div className="space-y-6">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                                    Data
                                </p>
                                <h1 className="mt-2 text-3xl font-black">
                                    Data and privacy
                                </h1>
                                <p className="mt-2 text-slate-400">
                                    Choose the available data centre option,
                                    export your information, or request account
                                    deletion.
                                </p>
                            </div>
                            <SettingsDataClient
                                deletionRequestedAt={
                                    userProfile?.account_deletion_requested_at ||
                                    null
                                }
                                supabaseUrl={
                                    process.env.NEXT_PUBLIC_SUPABASE_URL || null
                                }
                            />
                        </div>
                    ) : activeSection === "categories" ? (
                        <div className="space-y-6">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                                    Categories
                                </p>
                                <h1 className="mt-2 text-3xl font-black">
                                    Itinerary categories
                                </h1>
                                <p className="mt-2 text-slate-400">
                                    Customize the categories and colours you use for
                                    itinerary items.
                                </p>
                            </div>
                            <SettingsCategoriesClient
                                categories={categories}
                                colors={colors}
                                addAction={addCategory}
                                updateAction={updateCategory}
                                deleteAction={deleteCategory}
                                message={friendlyCategoryMessage(params.message)}
                            />
                        </div>
                    ) : activeSection === "family" ? (
                        <div className="space-y-6">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                                    Family Members
                                </p>
                                <h1 className="mt-2 text-3xl font-black">
                                    Family members
                                </h1>
                                <p className="mt-2 text-slate-400">
                                    Add non-user family members or managed travellers
                                    so you can include them in trips and transportation
                                    plans.
                                </p>
                            </div>
                            <SettingsFamilyMembersClient
                                familyMembers={familyMembers}
                                addAction={addFamilyMember}
                                updateAction={updateFamilyMember}
                                deleteAction={deleteFamilyMember}
                                message={friendlyFamilyMessage(params.message)}
                            />
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                                    Financial
                                </p>
                                <h1 className="mt-2 text-3xl font-black">
                                    Financial settings
                                </h1>
                                <p className="mt-2 text-slate-400">
                                    Set your default reporting currency for budgets,
                                    expenses, and travel cost planning.
                                </p>
                            </div>
                            <SettingsFinancialClient
                                currentCurrency={currentCurrency}
                                currencyOptions={currencyOptions}
                                updateAction={updateFinanceSettings}
                            />
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
