"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { SocialLoginButton } from "@/components/social-login-button";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";

type PasskeyLoginClient = ReturnType<typeof createClient> & {
  auth: ReturnType<typeof createClient>["auth"] & {
    signInWithPasskey: () => Promise<{
      data: unknown;
      error: Error | null;
    }>;
  };
};

export function LoginForm({
  className,
  initialError,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { initialError?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      window.location.assign("/");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setIsPasskeyLoading(true);
    setError(null);

    try {
      const supabase = createClient() as PasskeyLoginClient;
      const { error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      window.location.assign("/");
    } catch (error: unknown) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not sign in with passkey"
      );
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#080511] text-white shadow-2xl shadow-black/40">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_10%_0%,rgba(var(--vaivia-neon-rgb),0.14),transparent_30%),linear-gradient(135deg,rgba(124,60,255,0.16),transparent_58%)] p-6">
          <p className="text-xs font-black uppercase tracking-[0.34em] text-lime-200/80">
            VAIVIA login
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">
            Welcome back
          </h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
            Sign in to pick up your trips, passport stamps, and plans.
          </p>
        </div>

        <div className="p-6">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <SocialLoginButton
                provider="google"
                className="min-h-12 rounded-full border-white/10 bg-white/[0.08] text-sm font-black text-slate-100 hover:border-lime-300 hover:bg-lime-300 hover:text-slate-950 focus-visible:ring-lime-300"
              />
              <SocialLoginButton
                provider="azure"
                className="min-h-12 rounded-full border-white/10 bg-white/[0.08] text-sm font-black text-slate-100 hover:border-lime-300 hover:bg-lime-300 hover:text-slate-950 focus-visible:ring-lime-300"
              />
            </div>

            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={isPasskeyLoading || isLoading}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-lime-300/30 bg-lime-300/10 px-6 text-sm font-black text-lime-100 transition hover:bg-lime-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {isPasskeyLoading ? "Opening passkey..." : "Sign in with passkey"}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#080511] px-3 font-black tracking-[0.16em] text-slate-400">
                  Or continue with email
                </span>
              </div>
            </div>

            <div className="space-y-5 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4">
              <label className="block" htmlFor="email">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-lime-200/90">
                  Email
                </span>
                <input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-lime-300/55"
                />
              </label>
              <div className="block">
                <div className="flex items-center">
                  <label
                    htmlFor="password"
                    className="text-xs font-black uppercase tracking-[0.16em] text-lime-200/90"
                  >
                    Password
                  </label>
                  <Link
                    href="/auth/forgot-password"
                    className="ml-auto inline-block text-xs font-bold text-slate-300 underline-offset-4 hover:text-lime-200 hover:underline"
                  >
                    Forgot your password?
                  </Link>
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-lime-300/55"
                />
              </div>

              {error ? (
                <p className="text-sm font-bold text-red-200">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-lime-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Logging in..." : "Login"}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </form>
          <div className="mt-6 text-center text-sm font-semibold text-slate-400">
            Don&apos;t have an account?{" "}
            <Link
              href="/auth/sign-up"
              className="text-lime-200 underline underline-offset-4"
            >
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
