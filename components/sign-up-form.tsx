"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  Home,
  ImagePlus,
  PlaneTakeoff,
  Stamp,
  Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type SignupStep = "account" | "photo" | "start";

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

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const router = useRouter();
  const [step, setStep] = useState<SignupStep>("account");
  const [email, setEmail] = useState("");
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
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const displayName = useMemo(() => {
    const name = [firstName, lastName].filter(Boolean).join(" ").trim();
    return name || username || "Traveller";
  }, [firstName, lastName, username]);

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
        username: username.trim() || null,
        email: email.trim() || null,
        avatar_url: avatarUrl,
        join_date: now,
        terms_accepted_at: now,
        marketing_emails_consent: marketingConsent,
        marketing_emails_consented_at: marketingConsent ? now : null,
        onboarding_completed_at: onboardingCompleted ? now : null,
        updated_at: now,
      },
      { onConflict: "id" }
    );

    if (profileError) throw profileError;
  }

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatusMessage(null);

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
      const cleanUsername = username.trim();
      const cleanEmail = email.trim();
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/`,
          data: {
            first_name: cleanFirstName,
            last_name: cleanLastName,
            full_name: [cleanFirstName, cleanLastName].filter(Boolean).join(" "),
            preferred_username: cleanUsername,
            username: cleanUsername,
            marketing_emails_consent: marketingConsent,
            marketing_emails_consented_at: marketingConsent ? now : null,
            terms_accepted_at: now,
          },
        },
      });

      if (signUpError) throw signUpError;

      const nextUserId = data.user?.id || null;
      setUserId(nextUserId);
      setHasActiveSession(Boolean(data.session));

      if (nextUserId && data.session) {
        await seedProfile({ nextUserId });
      } else {
        setStatusMessage(
          "Account created. Confirm your email to finish activating VAIVIA."
        );
      }

      setStep("photo");
    } catch (error) {
      setError(getErrorMessage(error));
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

  async function handlePhotoNext() {
    setError(null);
    setIsLoading(true);

    try {
      const avatarUrl = await uploadAvatarIfNeeded();
      if (userId && hasActiveSession) {
        await seedProfile({
          nextUserId: userId,
          avatarUrl,
          onboardingCompleted: true,
        });
      }
      setStep("start");
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  function goTo(path: string) {
    router.push(path);
  }

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
                : "Get started in VAIVIA"}
          </h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
            {step === "account"
              ? "Tell us who you are so your trips feel personal from day one."
              : step === "photo"
                ? "Add a profile photo now, or skip it and come back later."
                : `Welcome, ${displayName}. Pick where you want to begin.`}
          </p>
        </div>

        <div className="p-6">
          <div className="mb-6 grid grid-cols-3 gap-2">
            {["Account", "Photo", "Start"].map((label, index) => {
              const isActive =
                (step === "account" && index === 0) ||
                (step === "photo" && index === 1) ||
                (step === "start" && index === 2);
              const isDone =
                (step === "photo" && index === 0) ||
                (step === "start" && index < 2);

              return (
                <div
                  key={label}
                  className={`rounded-2xl border px-3 py-2 text-center text-xs font-black uppercase tracking-[0.12em] ${
                    isActive || isDone
                      ? "border-lime-300/35 bg-lime-300 text-slate-950"
                      : "border-white/10 bg-white/[0.06] text-slate-400"
                  }`}
                >
                  {isDone ? <Check className="mx-auto h-4 w-4" /> : label}
                </div>
              );
            })}
          </div>

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
                    minLength={6}
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
                    minLength={6}
                    type="password"
                    className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-lime-300/55"
                    autoComplete="new-password"
                  />
                </label>
              </div>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <label className="flex items-start gap-3 text-sm font-semibold text-slate-200">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(event) => setAcceptedTerms(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-white/20 accent-lime-300"
                    required
                  />
                  <span>
                    I agree to VAIVIA&apos;s terms and conditions.
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
                {!hasActiveSession ? (
                  <p className="mt-3 max-w-sm rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3 text-xs font-bold text-amber-100">
                    Confirm your email before uploading a photo. You can skip for
                    now and add it from My account later.
                  </p>
                ) : null}
                <label className="mt-5 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-5 text-sm font-black text-slate-100 transition hover:bg-white/[0.14]">
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  Choose photo
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={!hasActiveSession}
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
                  onClick={() => setStep("start")}
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] px-6 text-sm font-black text-slate-100 transition hover:bg-white/[0.14]"
                >
                  Skip
                </button>
              </div>
            </div>
          ) : null}

          {step === "start" ? (
            <div className="space-y-3">
              {statusMessage ? (
                <p className="rounded-2xl border border-lime-300/20 bg-lime-300/10 p-4 text-sm font-bold text-lime-100">
                  {statusMessage}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => goTo("/trips/new")}
                className="flex w-full items-center gap-4 rounded-[1.35rem] border border-lime-300/25 bg-lime-300 p-4 text-left text-slate-950 shadow-[0_0_30px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:-translate-y-0.5 hover:bg-lime-200"
              >
                <PlaneTakeoff className="h-6 w-6 shrink-0" aria-hidden="true" />
                <span>
                  <span className="block text-lg font-black">Setup your first trip</span>
                  <span className="text-sm font-bold text-slate-950/70">
                    Start with dates, places, and a cover photo.
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => goTo("/profile")}
                className="flex w-full items-center gap-4 rounded-[1.35rem] border border-white/10 bg-white/[0.08] p-4 text-left text-white transition hover:border-lime-300/30 hover:bg-white/[0.14]"
              >
                <Stamp className="h-6 w-6 shrink-0 text-lime-200" aria-hidden="true" />
                <span>
                  <span className="block text-lg font-black">
                    Add passport stamps
                  </span>
                  <span className="text-sm font-bold text-slate-400">
                    Mark places you have already visited.
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => goTo("/")}
                className="flex w-full items-center gap-4 rounded-[1.35rem] border border-white/10 bg-white/[0.08] p-4 text-left text-white transition hover:border-lime-300/30 hover:bg-white/[0.14]"
              >
                <Home className="h-6 w-6 shrink-0 text-lime-200" aria-hidden="true" />
                <span>
                  <span className="block text-lg font-black">
                    Take me to homepage
                  </span>
                  <span className="text-sm font-bold text-slate-400">
                    Go straight to your VAIVIA dashboard.
                  </span>
                </span>
              </button>
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
