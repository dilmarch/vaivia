import { useState, type FormEvent } from "react";
import { LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Brand } from "../components/Brand";
import { useMobileAuth } from "../auth/AuthProvider";

export function LoginScreen() {
  const { signInWithPassword } = useMobileAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await signInWithPassword(email, password);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "VAIVIA could not sign you in.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mobile-screen flex items-center justify-center px-5 text-white">
      <section className="w-full max-w-md overflow-hidden rounded-[2.25rem] border border-white/10 bg-[#080511]/90 p-6 shadow-2xl shadow-black/50 sm:p-8">
        <div className="flex justify-center">
          <Brand />
        </div>
        <p className="mt-8 text-xs font-black uppercase tracking-[0.28em] text-lime-300">
          VAIVIA for iPhone
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
          Sign in with the same email and password you use on vaivia.app.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">
              Email
            </span>
            <span className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-4 focus-within:border-lime-300/50">
              <Mail className="h-5 w-5 text-slate-500" aria-hidden="true" />
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="h-14 min-w-0 flex-1 bg-transparent text-base font-semibold text-white outline-none placeholder:text-slate-600"
                placeholder="you@example.com"
              />
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">
              Password
            </span>
            <span className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-4 focus-within:border-lime-300/50">
              <LockKeyhole className="h-5 w-5 text-slate-500" aria-hidden="true" />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="h-14 min-w-0 flex-1 bg-transparent text-base font-semibold text-white outline-none placeholder:text-slate-600"
                placeholder="Your password"
              />
            </span>
          </label>

          {errorMessage ? (
            <p
              className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/10 p-3 text-sm font-semibold text-fuchsia-100"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-14 w-full rounded-2xl bg-lime-300 text-base font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.2)] hover:bg-lime-200"
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs font-semibold leading-5 text-slate-500">
          Social login and password recovery will be added in a later mobile phase.
        </p>
      </section>
    </main>
  );
}
