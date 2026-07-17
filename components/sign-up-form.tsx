"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Camera,
  ImagePlus,
  TrainFront,
  Upload,
} from "lucide-react";
import {
  completeOnboarding,
  dismissOnboarding,
  ensureNewUserOnboardingProgress,
  markOnboardingStepCompleted,
} from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  getUsernameValidationError,
  isUsernameConflictError,
  normalizeUsername,
} from "@/lib/usernames";

type SignupStep = "account" | "photo" | "confirm" | "invites" | "start";

type OnboardingTripInvitation = {
  id: string;
  trip_id: string;
  trip_title: string;
  trip_slug: string | null;
  trip_start_date: string | null;
  trip_end_date: string | null;
  invited_by: string;
  inviter_name: string;
  invitation_scope: string | null;
  invited_start_date: string | null;
  invited_end_date: string | null;
};

type OnboardingInviteClient = {
  rpc: (
    functionName: "claim_pending_trip_invitations_for_current_user"
  ) => Promise<{ data: OnboardingTripInvitation[] | null; error: Error | null }>;
} & {
  rpc: (
    functionName: "accept_trip_invitation_with_scope",
    args: {
      target_invitation_id: string;
      target_confirmed_start_date: string | null;
      target_confirmed_end_date: string | null;
      target_personal_start_date: string | null;
      target_personal_end_date: string | null;
      target_joining_leg_ids: string[] | null;
    }
  ) => Promise<{ data: string | null; error: Error | null }>;
} & {
  rpc: (
    functionName: "decline_trip_invitation",
    args: { invitation_id: string }
  ) => Promise<{ data: null; error: Error | null }>;
};

type SignupConsentClient = {
  rpc: (
    functionName: "accept_current_terms"
  ) => Promise<{ data: string | null; error: Error | null }>;
};

function getAvatarExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension && /^[a-z0-9]+$/.test(extension)) return extension;

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function getPasswordValidationError({
  password,
  email,
  username,
}: {
  password: string;
  email: string;
  username: string;
}) {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one capital letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password)) return "Password must include at least one number.";
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must include at least one special character.";
  }
  if (/\s/.test(password)) return "Password cannot contain spaces.";

  const normalizedPassword = password.toLowerCase();
  if (username && normalizedPassword.includes(username.toLowerCase())) {
    return "Password cannot contain your username.";
  }
  const emailName = email.split("@")[0]?.toLowerCase() || "";
  if (emailName && normalizedPassword.includes(emailName)) {
    return "Password cannot contain the first part of your email address.";
  }

  return "";
}

export function SignUpForm({
  className,
  initialEmail = "",
  initialInvitationId = "",
  initialInviteType = "",
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  initialEmail?: string;
  initialInvitationId?: string;
  initialInviteType?: string;
}) {
  const router = useRouter();
  const isTripInviteSignup =
    initialInviteType === "trip_invite" || Boolean(initialInvitationId);
  const [step, setStep] = useState<SignupStep>("account");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [pendingInvitations, setPendingInvitations] = useState<
    OnboardingTripInvitation[]
  >([]);
  const [acceptedInvitation, setAcceptedInvitation] =
    useState<OnboardingTripInvitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const displayName = useMemo(() => {
    const name = [firstName, lastName].filter(Boolean).join(" ").trim();
    return name || username || "Traveller";
  }, [firstName, lastName, username]);
  const passwordCriteria = useMemo(
    () => [
      {
        label: "At least 8 characters",
        met: password.length >= 8,
      },
      {
        label: "1 capital letter",
        met: /[A-Z]/.test(password),
      },
      {
        label: "1 lowercase letter",
        met: /[a-z]/.test(password),
      },
      {
        label: "1 number",
        met: /[0-9]/.test(password),
      },
      {
        label: "1 special character",
        met: /[^A-Za-z0-9]/.test(password),
      },
      {
        label: "No spaces or obvious account details",
        met:
          password.length > 0 &&
          !/\s/.test(password) &&
          !(
            username.trim() &&
            password.toLowerCase().includes(username.trim().toLowerCase())
          ) &&
          !(
            email.trim().split("@")[0] &&
            password
              .toLowerCase()
              .includes(email.trim().split("@")[0].toLowerCase())
          ),
      },
    ],
    [email, password, username]
  );

  async function seedProfile({
    nextUserId,
    avatarUrl = null,
    onboardingCompleted = false,
  }: {
    nextUserId: string;
    avatarUrl?: string | null;
    onboardingCompleted?: boolean;
  }) {
    const now = new Date().toISOString();
    const supabase = createClient();
    const { error: profileError } = await supabase.from("user_profiles").upsert(
      {
        id: nextUserId,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        username: normalizeUsername(username),
        email: email.trim() || null,
        avatar_url: avatarUrl,
        join_date: now,
        terms_accepted_at: now,
        marketing_emails_consent: marketingConsent,
        marketing_emails_consented_at: marketingConsent ? now : null,
        marketing_emails_consent_decided_at: now,
        onboarding_completed_at: onboardingCompleted ? now : null,
        updated_at: now,
      },
      { onConflict: "id" }
    );

    if (profileError) throw profileError;

    const { error: termsError } = await (
      supabase as unknown as SignupConsentClient
    ).rpc("accept_current_terms");
    if (termsError) throw termsError;

    if (!onboardingCompleted) {
      const { error: onboardingError } = await ensureNewUserOnboardingProgress(
        supabase,
        nextUserId
      );
      if (onboardingError) throw onboardingError;
    }
  }

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatusMessage(null);

    const cleanEmail = email.trim();
    const cleanUsername = normalizeUsername(username);
    const passwordError = getPasswordValidationError({
      password,
      email: cleanEmail,
      username: cleanUsername,
    });
    const usernameError = getUsernameValidationError(cleanUsername);

    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (usernameError) {
      setError(usernameError);
      return;
    }

    if (password !== repeatPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!acceptedTerms) {
      setError("Please accept the terms and conditions to continue.");
      return;
    }

    setIsLoading(true);

    try {
      const now = new Date().toISOString();
      const cleanFirstName = firstName.trim();
      const cleanLastName = lastName.trim();
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            first_name: cleanFirstName,
            last_name: cleanLastName,
            full_name: [cleanFirstName, cleanLastName].filter(Boolean).join(" "),
            preferred_username: cleanUsername,
            username: cleanUsername,
            marketing_emails_consent: marketingConsent,
            marketing_emails_consented_at: marketingConsent ? now : null,
            marketing_emails_consent_decided_at: now,
            terms_accepted_at: now,
          },
        },
      });

      if (signUpError) throw signUpError;

      const nextUserId = data.user?.id || null;
      let hasSession = Boolean(data.session);

      if (nextUserId && !hasSession) {
        const { data: signInData, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });

        if (!signInError && signInData.session) {
          hasSession = true;
        }
      }

      setUserId(nextUserId);
      setHasActiveSession(hasSession);

      if (nextUserId && hasSession) {
        await seedProfile({ nextUserId });
      }
      setStatusMessage(null);

      setStep("photo");
    } catch (error) {
      setError(
        isUsernameConflictError(error)
          ? "That username is already taken. Try another one."
          : getErrorMessage(error)
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleAvatarFileChange(file: File | null) {
    setAvatarFile(file);
    setAvatarPreviewUrl(file ? URL.createObjectURL(file) : "");
  }

  async function uploadAvatarIfNeeded() {
    if (!avatarFile || !userId || !hasActiveSession) return null;

    const supabase = createClient();
    const extension = getAvatarExtension(avatarFile);
    const path = `${userId}/avatar.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, avatarFile, {
        cacheControl: "3600",
        contentType: avatarFile.type || undefined,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl || null;
  }

  async function loadPendingTripInvitations() {
    if (!hasActiveSession) return [];

    const supabase = createClient();
    const { data, error } = await (supabase as unknown as OnboardingInviteClient).rpc(
      "claim_pending_trip_invitations_for_current_user"
    );

    if (error) throw error;
    return data || [];
  }

  async function advanceAfterPhoto() {
    if (!hasActiveSession) {
      setStep("confirm");
      return;
    }

    const invitations = await loadPendingTripInvitations();
    const sortedInvitations = initialInvitationId
      ? [...invitations].sort((a, b) => {
          if (a.id === initialInvitationId) return -1;
          if (b.id === initialInvitationId) return 1;
          return 0;
        })
      : invitations;

    setPendingInvitations(sortedInvitations);
    setAcceptedInvitation(null);
    setStep(sortedInvitations.length > 0 ? "invites" : "start");
  }

  async function handlePhotoNext() {
    setError(null);
    setIsLoading(true);

    try {
      const avatarUrl = await uploadAvatarIfNeeded();
      if (userId && hasActiveSession) {
        await seedProfile({
          nextUserId: userId,
          avatarUrl,
        });
      }
      await advanceAfterPhoto();
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePhotoSkip() {
    setError(null);
    setIsLoading(true);

    try {
      await advanceAfterPhoto();
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAcceptInvitation(invitation: OnboardingTripInvitation) {
    setError(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await (supabase as unknown as OnboardingInviteClient).rpc(
        "accept_trip_invitation_with_scope",
        {
          target_invitation_id: invitation.id,
          target_confirmed_start_date: invitation.invited_start_date || null,
          target_confirmed_end_date: invitation.invited_end_date || null,
          target_personal_start_date: invitation.invited_start_date || null,
          target_personal_end_date: invitation.invited_end_date || null,
          target_joining_leg_ids: null,
        }
      );

      if (error) throw error;

      if (userId) {
        if (isTripInviteSignup) {
          await completeOnboarding(supabase, userId);
        } else {
          await markOnboardingStepCompleted({
            supabase,
            userId,
            step: "welcome",
            nextStep: "create_trip",
          });
          await markOnboardingStepCompleted({
            supabase,
            userId,
            step: "create_trip",
            nextStep: "add_first_item",
          });
        }
      }

      setAcceptedInvitation(invitation);
      setPendingInvitations((current) =>
        current.filter((item) => item.id !== invitation.id)
      );
      setStatusMessage(`You joined ${invitation.trip_title}.`);

      if (isTripInviteSignup) {
        router.refresh();
        router.push(getTripHref(invitation));
      }
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeclineInvitation(invitationId: string) {
    setError(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await (supabase as unknown as OnboardingInviteClient).rpc(
        "decline_trip_invitation",
        { invitation_id: invitationId }
      );

      if (error) throw error;

      setPendingInvitations((current) =>
        current.filter((item) => item.id !== invitationId)
      );
      setStatusMessage("Invite declined.");
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  function formatTripDates(invitation: OnboardingTripInvitation) {
    const start = invitation.invited_start_date || invitation.trip_start_date;
    const end = invitation.invited_end_date || invitation.trip_end_date;
    if (start && end) return `${start} - ${end}`;
    if (start) return start;
    return "Dates to be confirmed";
  }

  function getTripHref(invitation: OnboardingTripInvitation) {
    return `/trips/${encodeURIComponent(invitation.trip_slug || invitation.trip_id)}`;
  }

  function goToAcceptedTrip(invitation: OnboardingTripInvitation) {
    void goTo(`${getTripHref(invitation)}?tab=itinerary&onboarding=first-item`);
  }

  async function handlePlanFirstTrip() {
    setError(null);
    setIsLoading(true);

    try {
      const hasSession = await ensureOnboardingSession();
      if (!hasSession) {
        setError(
          "Your account was created, but VAIVIA needs you to sign in once before opening that page."
        );
        return;
      }

      if (userId) {
        const supabase = createClient();
        const { error } = await markOnboardingStepCompleted({
          supabase,
          userId,
          step: "welcome",
          nextStep: "create_trip",
        });
        if (error) throw error;
      }

      router.refresh();
      router.push("/trips/new?onboarding=1");
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExploreOnOwn() {
    setError(null);
    setIsLoading(true);

    try {
      const hasSession = await ensureOnboardingSession();
      if (!hasSession) {
        setError(
          "Your account was created, but VAIVIA needs you to sign in once before opening that page."
        );
        return;
      }

      if (userId) {
        const supabase = createClient();
        await dismissOnboarding(supabase, userId);
      }

      router.refresh();
      router.push("/");
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function ensureOnboardingSession() {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      setHasActiveSession(true);
      return true;
    }

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) return false;

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error || !data.session) return false;

    setHasActiveSession(true);
    setUserId(data.user?.id || userId);
    return true;
  }

  async function goTo(path: string) {
    setError(null);
    setIsLoading(true);

    try {
      const hasSession = await ensureOnboardingSession();
      if (!hasSession) {
        setError(
          "Your account was created, but VAIVIA needs you to sign in once before opening that page."
        );
        return;
      }

      router.refresh();
      router.push(path);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  const onboardingStation =
    step === "account" ? 0 : step === "photo" ? 1 : 2;

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#080511] text-white shadow-2xl shadow-black/40">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_10%_0%,rgba(var(--vaivia-neon-rgb),0.14),transparent_30%),linear-gradient(135deg,rgba(124,60,255,0.16),transparent_58%)] p-6">
          <p className="text-xs font-black uppercase tracking-[0.34em] text-lime-200/80">
            VAIVIA onboarding
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">
            {step === "account"
              ? "Create your account"
              : step === "photo"
                ? "Add your profile photo"
                : step === "confirm"
                  ? "Confirm your email"
                  : step === "invites"
                    ? "Trip invitation"
                    : "Get started in VAIVIA"}
          </h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
            {step === "account"
              ? "Tell us who you are so your trips feel personal from day one."
                : step === "photo"
                  ? "Add a profile photo now, or skip it and come back later."
                  : step === "confirm"
                    ? "Check your email to confirm your account before continuing."
                    : step === "invites"
                      ? isTripInviteSignup
                        ? "Accept your trip invitation to open the trip."
                        : "Review trips you were invited to before choosing where to begin."
                      : `Welcome, ${displayName}. Pick where you want to begin.`}
          </p>
        </div>

        <div className="p-6">
          {step !== "start" ? (
          <div className="mb-6 rounded-[1.75rem] border border-white/10 bg-white/[0.05] px-5 py-5">
            <div className="relative mx-auto h-14 max-w-md">
              <div className="absolute left-4 right-4 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-lime-300 shadow-[0_0_18px_rgba(var(--vaivia-neon-rgb),0.42)] transition-all duration-700 ease-out"
                  style={{ width: `${onboardingStation * 50}%` }}
                />
              </div>
              <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between">
                {[0, 1, 2].map((station) => (
                  <span
                    key={station}
                    className={`h-4 w-4 rounded-full border transition ${
                      station <= onboardingStation
                        ? "border-lime-200 bg-lime-300 shadow-[0_0_18px_rgba(var(--vaivia-neon-rgb),0.45)]"
                        : "border-white/20 bg-slate-950"
                    }`}
                    aria-hidden="true"
                  />
                ))}
              </div>
              <div
                className="absolute top-1/2 z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-lime-300/40 bg-slate-950 text-lime-200 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.32)] transition-all duration-700 ease-out"
                style={{ left: `${onboardingStation * 50}%` }}
                aria-label={`Onboarding step ${onboardingStation + 1} of 3`}
              >
                <TrainFront className="h-5 w-5" aria-hidden="true" />
              </div>
            </div>
          </div>
          ) : null}

          {step === "account" ? (
            <form onSubmit={handleCreateAccount} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-lime-200/90">
                    First name
                  </span>
                  <input
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    required
                    className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-lime-300/55"
                    autoComplete="given-name"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-lime-200/90">
                    Last name
                  </span>
                  <input
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    required
                    className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-lime-300/55"
                    autoComplete="family-name"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-lime-200/90">
                  Username
                </span>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  onBlur={() => setUsername((current) => normalizeUsername(current))}
                  required
                  className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-lime-300/55"
                  placeholder="dilmarch"
                  autoComplete="username"
                />
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-lime-200/90">
                  Email
                </span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-lime-300/55"
                  placeholder="name@example.com"
                  autoComplete="email"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-lime-200/90">
                    Password
                  </span>
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={8}
                    type="password"
                    className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-lime-300/55"
                    autoComplete="new-password"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-lime-200/90">
                    Confirm password
                  </span>
                  <input
                    value={repeatPassword}
                    onChange={(event) => setRepeatPassword(event.target.value)}
                    required
                    minLength={8}
                    type="password"
                    className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-lime-300/55"
                    autoComplete="new-password"
                  />
                </label>
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 sm:col-span-2">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-lime-200/80">
                    Password must include
                  </p>
                  <div className="mt-3 grid gap-2 text-xs font-bold sm:grid-cols-2">
                    {passwordCriteria.map((criterion) => (
                      <div
                        key={criterion.label}
                        className={
                          criterion.met
                            ? "text-lime-100"
                            : "text-slate-500"
                        }
                      >
                        <span aria-hidden="true">
                          {criterion.met ? "✓" : "•"}
                        </span>{" "}
                        {criterion.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <label className="flex items-start gap-3 text-sm font-semibold text-slate-200">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(event) => setAcceptedTerms(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-white/20 accent-lime-300"
                  />
                  <span>
                    I agree to VAIVIA&apos;s{" "}
                    <Link
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-black text-lime-100 underline decoration-lime-300/50 underline-offset-4"
                    >
                      terms and conditions
                    </Link>
                    .
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm font-semibold text-slate-300">
                  <input
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={(event) => setMarketingConsent(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-white/20 accent-lime-300"
                  />
                  <span>
                    Send me marketing emails about promotions and app updates.
                  </span>
                </label>
              </div>

              {error ? <p className="text-sm font-bold text-red-200">{error}</p> : null}

              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-lime-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Creating account..." : "Next"}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          ) : null}

          {step === "photo" ? (
            <div className="space-y-5">
              {statusMessage ? (
                <p className="rounded-2xl border border-lime-300/20 bg-lime-300/10 p-4 text-sm font-bold text-lime-100">
                  {statusMessage}
                </p>
              ) : null}

              <div className="flex flex-col items-center rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-6 text-center">
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-lime-300/35 bg-slate-950 text-4xl font-black text-lime-200 shadow-[0_0_32px_rgba(var(--vaivia-neon-rgb),0.18)]">
                  {avatarPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarPreviewUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Camera className="h-10 w-10" aria-hidden="true" />
                  )}
                </div>
                <h2 className="mt-5 text-xl font-black">Profile photo</h2>
                <p className="mt-2 max-w-sm text-sm font-semibold leading-6 text-slate-300">
                  Your photo appears beside trip votes, shared trips, and your
                  VAIVIA profile.
                </p>
                <label className="mt-5 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-5 text-sm font-black text-slate-100 transition hover:bg-white/[0.14]">
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  Choose photo
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) =>
                      handleAvatarFileChange(event.target.files?.[0] || null)
                    }
                  />
                </label>
              </div>

              {error ? <p className="text-sm font-bold text-red-200">{error}</p> : null}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handlePhotoNext}
                  disabled={isLoading}
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-lime-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  {avatarFile ? "Save photo" : "Next"}
                </button>
                <button
                  type="button"
                  onClick={handlePhotoSkip}
                  disabled={isLoading}
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] px-6 text-sm font-black text-slate-100 transition hover:bg-white/[0.14]"
                >
                  Skip
                </button>
              </div>
            </div>
          ) : null}

          {step === "confirm" ? (
            <div className="space-y-5 rounded-[1.75rem] border border-lime-300/20 bg-lime-300/[0.08] p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200">
                  Email confirmation
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight">
                  Check your inbox before continuing.
                </h2>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
                  We sent a confirmation link to{" "}
                  <span className="font-black text-white">{email.trim()}</span>.
                  Open that email and confirm your account, then sign in to keep
                  setting up VAIVIA.
                </p>
              </div>

              <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/60 p-4 text-sm font-semibold leading-6 text-slate-300">
                If you were invited to a trip, VAIVIA will show that invite after
                you confirm your email and sign in.
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/auth/login"
                  className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-lime-300 px-6 text-sm font-black text-slate-950 transition hover:bg-lime-200"
                >
                  Go to login
                </Link>
              </div>
            </div>
          ) : null}

          {step === "invites" ? (
            <div className="space-y-4">
              {statusMessage ? (
                <p className="rounded-2xl border border-lime-300/20 bg-lime-300/10 p-4 text-sm font-bold text-lime-100">
                  {statusMessage}
                </p>
              ) : null}

              {acceptedInvitation ? (
                <div className="rounded-[1.5rem] border border-lime-300/30 bg-lime-300/10 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                    You’re going
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-white">
                    {acceptedInvitation.trip_title}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-slate-300">
                    {formatTripDates(acceptedInvitation)}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => goToAcceptedTrip(acceptedInvitation)}
                      className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-lime-300 px-6 text-sm font-black text-slate-950 transition hover:bg-lime-200"
                    >
                      Go to trip
                    </button>
                    {!isTripInviteSignup ? (
                      <button
                        type="button"
                        onClick={() => setStep("start")}
                        className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] px-6 text-sm font-black text-slate-100 transition hover:bg-white/[0.14]"
                      >
                        Later
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {pendingInvitations.length > 0 ? (
                pendingInvitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5"
                  >
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                      Trip invite
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-white">
                      {invitation.trip_title}
                    </h2>
                    <p className="mt-1 text-sm font-semibold text-slate-300">
                      {formatTripDates(invitation)}
                    </p>
                    <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">
                      {invitation.inviter_name} invited you to join this trip.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleAcceptInvitation(invitation)}
                        className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-lime-300 px-6 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleDeclineInvitation(invitation.id)}
                        className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] px-6 text-sm font-black text-slate-100 transition hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))
              ) : !acceptedInvitation ? (
                <p className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm font-bold text-slate-300">
                  No pending trip invites left.
                </p>
              ) : null}

              {error ? <p className="text-sm font-bold text-red-200">{error}</p> : null}

              {!isTripInviteSignup ? (
                <button
                  type="button"
                  onClick={() => setStep("start")}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-white/10 bg-white/[0.08] px-6 text-sm font-black text-slate-100 transition hover:bg-white/[0.14]"
                >
                  Continue to other options
                </button>
              ) : null}
            </div>
          ) : null}

          {step === "start" ? (
            <div className="space-y-5 rounded-[1.75rem] border border-lime-300/20 bg-lime-300/[0.08] p-5">
              {statusMessage ? (
                <p className="rounded-2xl border border-lime-300/20 bg-lime-300/10 p-4 text-sm font-bold text-lime-100">
                  {statusMessage}
                </p>
              ) : null}
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200">
                  Welcome to VAIVIA
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight">
                  Your whole trip, finally in one place.
                </h2>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
                  Save ideas, build the plan, keep bookings together, and travel
                  with your people.
                </p>
              </div>

              {acceptedInvitation ? (
                <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/60 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/80">
                    Trip invite accepted
                  </p>
                  <h3 className="mt-2 text-xl font-black text-white">
                    {acceptedInvitation.trip_title}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-slate-400">
                    {formatTripDates(acceptedInvitation)}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={
                    acceptedInvitation
                      ? () => goToAcceptedTrip(acceptedInvitation)
                      : handlePlanFirstTrip
                  }
                  disabled={isLoading}
                  className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-lime-300 px-6 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:opacity-60"
                >
                  {acceptedInvitation ? "Review trip invite" : "Plan my first trip"}
                </button>
                <button
                  type="button"
                  onClick={handleExploreOnOwn}
                  disabled={isLoading}
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] px-6 text-sm font-black text-slate-100 transition hover:bg-white/[0.14] disabled:opacity-60"
                >
                  Explore on my own
                </button>
              </div>

              {error ? <p className="text-sm font-bold text-red-200">{error}</p> : null}
            </div>
          ) : null}

          <div className="mt-6 text-center text-sm font-semibold text-slate-400">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-lime-200 underline underline-offset-4">
              Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
