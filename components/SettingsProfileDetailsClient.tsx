"use client";

import { useMemo } from "react";

type SettingsProfileDetailsClientProps = {
  profile: {
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
  authEmail?: string | null;
  canChangeEmail: boolean;
  authProviderLabels: string[];
  message?: string;
  updateAction: (formData: FormData) => void | Promise<void>;
};

function getMessageText(message?: string) {
  if (message === "saved") return "Profile details saved.";
  if (message === "username-required") return "Please enter a username.";
  if (message === "username-taken") return "That username is already taken.";
  if (message === "username-invalid") {
    return "Use 3-30 lowercase letters, numbers, underscores, or hyphens. Start with a letter or number.";
  }
  if (message === "email-invalid") return "Enter a valid email address.";
  if (message === "email-unavailable") {
    return "Email changes are unavailable for this account.";
  }
  if (message === "error") return "Could not save profile details.";
  return "";
}

export default function SettingsProfileDetailsClient({
  profile,
  authEmail,
  canChangeEmail,
  authProviderLabels,
  message,
  updateAction,
}: SettingsProfileDetailsClientProps) {
  const messageText = getMessageText(message);
  const isSuccess = message === "saved";
  const providerSummary = useMemo(
    () =>
      authProviderLabels.length > 0
        ? authProviderLabels.join(", ")
        : "Email/password",
    [authProviderLabels]
  );

  return (
    <div className="space-y-5">
      {messageText ? (
        <p
          className={`rounded-[1.25rem] border px-4 py-3 text-sm font-bold ${
            isSuccess
              ? "border-lime-300/25 bg-lime-300/10 text-lime-100"
              : "border-red-300/25 bg-red-500/10 text-red-100"
          }`}
        >
          {messageText}
        </p>
      ) : null}

      <form
        action={updateAction}
        className="grid gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 sm:grid-cols-2"
      >
        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
            First name
          </span>
          <input
            name="first_name"
            defaultValue={profile?.first_name || ""}
            autoComplete="given-name"
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-lime-300/55"
          />
        </label>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
            Last name
          </span>
          <input
            name="last_name"
            defaultValue={profile?.last_name || ""}
            autoComplete="family-name"
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-lime-300/55"
          />
        </label>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
            Username
          </span>
          <div className="mt-2 flex h-11 items-center rounded-xl border border-white/10 bg-slate-950 px-3 focus-within:border-lime-300/55">
            <span className="mr-1 text-sm font-black text-lime-200">@</span>
            <input
              name="username"
              defaultValue={profile?.username || ""}
              autoComplete="username"
              required
              className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-slate-500"
            />
          </div>
        </label>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
            Email
          </span>
          <input
            name="email"
            type="email"
            defaultValue={profile?.email || authEmail || ""}
            autoComplete="email"
            disabled={!canChangeEmail}
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-lime-300/55 disabled:cursor-not-allowed disabled:opacity-55"
          />
          {!canChangeEmail ? (
            <span className="mt-2 block text-xs font-semibold leading-5 text-slate-400">
              Email is managed by {providerSummary} sign-in.
            </span>
          ) : null}
        </label>

        <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/55 p-4 sm:col-span-2">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
            Account role
          </p>
          <p className="mt-2 text-sm font-bold text-slate-200">
            {profile?.role || "user"}
          </p>
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:bg-lime-200"
          >
            Save profile details
          </button>
        </div>
      </form>
    </div>
  );
}
