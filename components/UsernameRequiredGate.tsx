"use client";

import { type FormEvent, useEffect, useState } from "react";
import AnimatedModal from "@/components/AnimatedModal";
import { createClient } from "@/lib/supabase/client";
import {
  getUsernameValidationError,
  isUsernameConflictError,
  normalizeUsername,
} from "@/lib/usernames";

type UsernameRequiredGateProps = {
  userId: string;
  email?: string | null;
  initialUsername?: string | null;
};

export default function UsernameRequiredGate({
  userId,
  email,
  initialUsername,
}: UsernameRequiredGateProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadUsername() {
      if (initialUsername?.trim()) return;

      const supabase = createClient();
      const { data, error } = await supabase
        .from("user_profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle();

      if (!isMounted) return;

      if (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Could not check username requirement:", {
            message: error.message,
            code: error.code,
            details: error.details,
          });
        }
        setIsOpen(true);
        return;
      }

      setIsOpen(!data?.username?.trim());
    }

    void loadUsername();

    return () => {
      isMounted = false;
    };
  }, [initialUsername, userId]);

  async function saveUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const normalizedUsername = normalizeUsername(username);
    const validationError = getUsernameValidationError(normalizedUsername);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);

    try {
      const supabase = createClient();
      const now = new Date().toISOString();
      const { error } = await supabase.from("user_profiles").upsert(
        {
          id: userId,
          email: email || null,
          username: normalizedUsername,
          updated_at: now,
        },
        { onConflict: "id" }
      );

      if (error) throw error;

      setIsOpen(false);
      window.location.reload();
    } catch (error) {
      setError(
        isUsernameConflictError(error)
          ? "That username is already taken. Try another one."
          : error instanceof Error
            ? error.message
            : "Could not save your username."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <AnimatedModal
      onClose={() => undefined}
      closeOnBackdrop={false}
      closeOnEscape={false}
      panelClassName="max-w-lg overflow-hidden rounded-[2rem] border-white/10 bg-[#050712] text-white shadow-2xl shadow-black/70"
      labelledBy="username-required-title"
    >
      {() => (
        <form onSubmit={saveUsername}>
          <div className="space-y-5 p-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                Account setup
              </p>
              <h2 id="username-required-title" className="mt-2 text-3xl font-black">
                Create your VAIVIA username
              </h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
                Usernames help friends invite you without sharing private email
                addresses. Pick one to keep using your account.
              </p>
            </div>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-lime-200/90">
                Username
              </span>
              <div className="mt-2 flex items-center rounded-2xl border border-white/15 bg-slate-950/90 px-4 py-3 focus-within:border-lime-300/55">
                <span className="mr-1 text-sm font-black text-lime-200">@</span>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  onBlur={() => setUsername((current) => normalizeUsername(current))}
                  required
                  autoFocus
                  autoComplete="username"
                  className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-slate-500"
                  placeholder="dilmarch"
                />
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-400">
                Use 3-30 letters, numbers, underscores, or hyphens.
              </p>
            </label>

            {error ? (
              <p className="rounded-2xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end border-t border-white/10 bg-black/20 p-5">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-full bg-lime-300 px-6 py-3 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.25)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save username"}
            </button>
          </div>
        </form>
      )}
    </AnimatedModal>
  );
}
