import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isCountdownUnit } from "@/lib/countdownDisplay";
import { normalizeCurrencyCode } from "@/lib/currency";
import {
  getUsernameValidationError,
  isUsernameConflictError,
  normalizeUsername,
} from "@/lib/usernames";
import {
  getUserProfileDefaults,
  mergeProfileWithAuthDefaults,
} from "@/lib/userProfileDefaults";
import type {
  MobileAccountResponse,
  MobileApiFieldErrors,
  MobileSettingsResponse,
} from "@/lib/mobileApi/contracts";
import type { Database } from "@/src/types/supabase";

type AccountClient = SupabaseClient<Database>;

export class AccountDomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
    readonly fieldErrors?: MobileApiFieldErrors,
  ) {
    super(message);
    this.name = "AccountDomainError";
  }
}

function authProviders(user: User) {
  const providers = new Set(
    (user.identities || [])
      .map((identity) => identity.provider)
      .filter((provider): provider is string => Boolean(provider)),
  );
  const fallback = user.app_metadata?.provider;
  if (typeof fallback === "string") providers.add(fallback);
  return providers;
}

function canChangeEmail(user: User) {
  return !Array.from(authProviders(user)).some((provider) => provider !== "email");
}

export async function ensureConfirmedAccountProfile(
  supabase: AccountClient,
  user: User,
) {
  const defaults = getUserProfileDefaults(user);
  const metadata = user.user_metadata || {};
  const now = new Date().toISOString();
  const termsAcceptedAt =
    typeof metadata.terms_accepted_at === "string"
      ? metadata.terms_accepted_at
      : now;
  const marketingConsent =
    metadata.marketing_emails_consent === true ||
    metadata.marketing_emails_consent === "true";
  const marketingConsentedAt =
    typeof metadata.marketing_emails_consented_at === "string"
      ? metadata.marketing_emails_consented_at
      : marketingConsent
        ? termsAcceptedAt
        : null;
  const marketingConsentDecidedAt =
    typeof metadata.marketing_emails_consent_decided_at === "string"
      ? metadata.marketing_emails_consent_decided_at
      : termsAcceptedAt;

  const { data: existingProfile, error: profileReadError } = await supabase
    .from("user_profiles")
    .select(
      "id,first_name,last_name,username,email,avatar_url,join_date,terms_accepted_at,marketing_emails_consent,marketing_emails_consented_at,marketing_emails_consent_decided_at,onboarding_completed_at",
    )
    .eq("id", user.id)
    .maybeSingle();
  const { error: profileUpsertError } = await supabase
    .from("user_profiles")
    .upsert(
      {
        ...mergeProfileWithAuthDefaults(existingProfile, defaults),
        join_date:
          existingProfile?.join_date || defaults.join_date || user.created_at || now,
        terms_accepted_at: existingProfile?.terms_accepted_at ?? termsAcceptedAt,
        marketing_emails_consent:
          existingProfile?.marketing_emails_consent ?? marketingConsent,
        marketing_emails_consented_at:
          existingProfile?.marketing_emails_consented_at ?? marketingConsentedAt,
        marketing_emails_consent_decided_at:
          existingProfile?.marketing_emails_consent_decided_at ??
          marketingConsentDecidedAt,
        onboarding_completed_at: existingProfile?.onboarding_completed_at ?? now,
        updated_at: now,
      },
      { onConflict: "id" },
    );
  const { error: termsError } = await supabase.rpc("accept_current_terms");
  if (profileReadError) throw profileReadError;
  if (profileUpsertError) throw profileUpsertError;
  if (termsError) throw termsError;
}

export async function loadAccount(
  supabase: AccountClient,
  user: User,
): Promise<MobileAccountResponse> {
  const [{ data: row, error }, { data: points }] = await Promise.all([
    supabase
      .from("user_profiles")
      .select(
        "id,first_name,last_name,username,email,avatar_url,join_date,role,terms_accepted_at,marketing_emails_consent,account_deletion_requested_at",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("user_points")
      .select("points,level,level_name")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (error) throw error;
  const profile = mergeProfileWithAuthDefaults(row, getUserProfileDefaults(user));
  return {
    profile: {
      id: user.id,
      firstName: profile.first_name,
      lastName: profile.last_name,
      username: profile.username,
      email: user.email || profile.email,
      avatarUrl: profile.avatar_url,
      joinedAt: profile.join_date,
      role: row?.role || "basic_user",
      termsAcceptedAt: row?.terms_accepted_at || null,
      marketingEmailsConsent: row?.marketing_emails_consent || false,
      accountDeletionRequestedAt: row?.account_deletion_requested_at || null,
      points: points?.points || 0,
      level: points?.level || 1,
      levelName: points?.level_name || "Explorer",
      canChangeEmail: canChangeEmail(user),
    },
  };
}

export type ProfileUpdateInput = {
  firstName?: unknown;
  lastName?: unknown;
  username?: unknown;
  email?: unknown;
};

export async function updateAccountProfile(
  supabase: AccountClient,
  user: User,
  input: ProfileUpdateInput,
  options: { emailRedirectTo?: string } = {},
) {
  const firstName = typeof input.firstName === "string" ? input.firstName.trim() : "";
  const lastName = typeof input.lastName === "string" ? input.lastName.trim() : "";
  const username = normalizeUsername(
    typeof input.username === "string" ? input.username : "",
  );
  const email = typeof input.email === "string" ? input.email.trim() : user.email || "";
  const usernameError = getUsernameValidationError(username);
  const fieldErrors: MobileApiFieldErrors = {};
  if (usernameError) fieldErrors.username = [usernameError];
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = ["Enter a valid email address."];
  }
  const emailUnavailable = !canChangeEmail(user) && email !== (user.email || "");
  if (emailUnavailable) {
    fieldErrors.email = ["Email changes are unavailable for this account."];
  }
  if (Object.keys(fieldErrors).length) {
    throw new AccountDomainError(
      "Check the highlighted profile fields.",
      emailUnavailable ? "email_unavailable" : "validation_error",
      422,
      fieldErrors,
    );
  }

  try {
    if (email && email !== user.email) {
      const { error } = await supabase.auth.updateUser(
        { email },
        options.emailRedirectTo
          ? { emailRedirectTo: options.emailRedirectTo }
          : undefined,
      );
      if (error) throw error;
    }
    const now = new Date().toISOString();
    const { error } = await supabase.from("user_profiles").upsert(
      {
        id: user.id,
        first_name: firstName || null,
        last_name: lastName || null,
        username,
        email: email || user.email || null,
        join_date: user.created_at || now,
        updated_at: now,
      },
      { onConflict: "id" },
    );
    if (error) throw error;
  } catch (error) {
    if (isUsernameConflictError(error)) {
      throw new AccountDomainError(
        "That username is already taken.",
        "username_taken",
        409,
        { username: ["That username is already taken."] },
      );
    }
    throw error;
  }
  return loadAccount(supabase, user);
}

export async function loadSettings(
  supabase: AccountClient,
  user: User,
): Promise<MobileSettingsResponse> {
  const [preferences, profile, finance, notificationRows, categories, family] =
    await Promise.all([
      supabase
        .from("user_preferences")
        .select(
          "theme_mode,countdown_display_mode,clock_format,default_time_zone,itinerary_default_view,news_feed_mode",
        )
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("user_profiles")
        .select("marketing_emails_consent")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("user_finance_settings")
        .select("home_currency")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("user_notification_preferences")
        .select(
          "notification_type,master_enabled,in_app_enabled,push_enabled,email_enabled",
        )
        .eq("user_id", user.id),
      supabase
        .from("user_categories")
        .select("id,name,color_key")
        .eq("user_id", user.id)
        .order("name"),
      supabase
        .from("user_family_members")
        .select("id,name,relationship")
        .eq("user_id", user.id)
        .order("name"),
    ]);
  for (const result of [preferences, profile, finance, notificationRows, categories, family]) {
    if (result.error) throw result.error;
  }
  return {
    preferences: {
      themeMode: preferences.data?.theme_mode || "dark",
      countdownDisplayMode: preferences.data?.countdown_display_mode || "days",
      clockFormat: preferences.data?.clock_format || "12h",
      defaultTimeZone: preferences.data?.default_time_zone || null,
      itineraryDefaultView: preferences.data?.itinerary_default_view || "list",
      newsFeedMode: preferences.data?.news_feed_mode || "integrated",
      homeCurrency: finance.data?.home_currency || "USD",
      marketingEmailsConsent: profile.data?.marketing_emails_consent || false,
    },
    notificationPreferences: (notificationRows.data || []).map((row) => ({
      notificationType: row.notification_type,
      masterEnabled: row.master_enabled,
      inAppEnabled: row.in_app_enabled,
      pushEnabled: row.push_enabled,
      emailEnabled: row.email_enabled,
    })),
    categories: (categories.data || []).map((row) => ({
      id: row.id,
      name: row.name,
      colorKey: row.color_key,
    })),
    familyMembers: (family.data || []).map((row) => ({
      id: row.id,
      name: row.name,
      relationship: row.relationship,
    })),
    capabilities: {
      profileEditing: true,
      passwordChange: canChangeEmail(user),
      avatarUpload: false,
      notificationMutation: false,
      categoryMutation: false,
      familyMutation: false,
    },
  };
}

export type SettingsUpdateInput = {
  themeMode?: unknown;
  countdownDisplayMode?: unknown;
  clockFormat?: unknown;
  defaultTimeZone?: unknown;
  itineraryDefaultView?: unknown;
  homeCurrency?: unknown;
  marketingEmailsConsent?: unknown;
};

const THEME_MODES = new Set(["dark", "pink", "greyscale", "brat", "pride", "light"]);
const ITINERARY_VIEWS = new Set(["list", "day", "week", "month"]);

export async function updateSettings(
  supabase: AccountClient,
  user: User,
  input: SettingsUpdateInput,
) {
  const current = await loadSettings(supabase, user);
  const themeMode = typeof input.themeMode === "string" ? input.themeMode : current.preferences.themeMode;
  const countdown = typeof input.countdownDisplayMode === "string" ? input.countdownDisplayMode : current.preferences.countdownDisplayMode;
  const clockFormat = input.clockFormat === "24h" ? "24h" : input.clockFormat === "12h" ? "12h" : current.preferences.clockFormat;
  const itineraryView = typeof input.itineraryDefaultView === "string" ? input.itineraryDefaultView : current.preferences.itineraryDefaultView;
  const timezone = input.defaultTimeZone === null || typeof input.defaultTimeZone === "string" ? (input.defaultTimeZone || null) : current.preferences.defaultTimeZone;
  const rawCurrency = typeof input.homeCurrency === "string" ? input.homeCurrency : current.preferences.homeCurrency;
  const currency = normalizeCurrencyCode(rawCurrency) || current.preferences.homeCurrency;
  const fieldErrors: MobileApiFieldErrors = {};
  if (!THEME_MODES.has(themeMode)) fieldErrors.themeMode = ["Choose a supported VAIVIA theme."];
  if (!isCountdownUnit(countdown)) fieldErrors.countdownDisplayMode = ["Choose a supported countdown unit."];
  if (!ITINERARY_VIEWS.has(itineraryView)) fieldErrors.itineraryDefaultView = ["Choose a supported itinerary view."];
  if (Object.keys(fieldErrors).length) {
    throw new AccountDomainError("Check the highlighted settings.", "validation_error", 422, fieldErrors);
  }
  const now = new Date().toISOString();
  const { error: preferencesError } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      theme_mode: themeMode,
      countdown_display_mode: countdown,
      clock_format: clockFormat,
      default_time_zone: timezone,
      itinerary_default_view: itineraryView,
      news_feed_mode: current.preferences.newsFeedMode,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
  if (preferencesError) throw preferencesError;
  const { error: financeError } = await supabase.from("user_finance_settings").upsert(
    { user_id: user.id, home_currency: currency, updated_at: now },
    { onConflict: "user_id" },
  );
  if (financeError) throw financeError;
  if (typeof input.marketingEmailsConsent === "boolean") {
    const { error } = await supabase.rpc("set_marketing_email_consent", {
      consent: input.marketingEmailsConsent,
    });
    if (error) throw error;
  }
  return loadSettings(supabase, user);
}

export async function requestAccountDeletion(
  supabase: AccountClient,
  userId: string,
) {
  const { error } = await supabase.rpc("request_current_user_account_deletion");
  if (error) throw error;
  const { data, error: readError } = await supabase
    .from("user_profiles")
    .select("account_deletion_requested_at")
    .eq("id", userId)
    .maybeSingle();
  if (readError) throw readError;
  if (!data?.account_deletion_requested_at) {
    throw new AccountDomainError(
      "VAIVIA could not verify the account deletion request.",
      "deletion_not_verified",
      500,
    );
  }
  return { requestedAt: data.account_deletion_requested_at };
}
