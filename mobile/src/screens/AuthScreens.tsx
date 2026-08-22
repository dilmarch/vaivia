import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSignupPasswordCriteria, getSignupPasswordValidationError } from "@/lib/account/authValidation";
import { getUsernameValidationError, normalizeUsername } from "@/lib/usernames";
import { Brand } from "../components/Brand";
import { useMobileAuth } from "../auth/AuthProvider";

type AuthView = "login" | "signup" | "confirm-email" | "forgot-password" | "update-password";

const LEGAL_URL = "https://vaivia.app/terms";

function LegalLinks() {
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-bold text-slate-400">
      <a href={LEGAL_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Terms</a>
      <a href={LEGAL_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Privacy Policy</a>
      <a href={`${LEGAL_URL}#contact`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Support</a>
    </div>
  );
}

function Field({
  label,
  icon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; icon?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">{label}</span>
      <span className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-4 focus-within:border-lime-300/50">
        {icon}
        <input {...props} className="h-14 min-w-0 flex-1 bg-transparent text-base font-semibold text-white outline-none placeholder:text-slate-600" />
      </span>
    </label>
  );
}

export function AuthScreen({
  view,
  initialEmail,
  onNavigate,
  onAuthenticated,
  callbackError,
}: {
  view: AuthView;
  initialEmail?: string;
  onNavigate: (view: AuthView, email?: string) => void;
  onAuthenticated: () => void;
  callbackError?: string;
}) {
  const auth = useMobileAuth();
  const [email, setEmail] = useState(initialEmail || "");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordCriteria = useMemo(
    () => getSignupPasswordCriteria({ password, email, username }),
    [email, password, username],
  );

  async function submit(action: () => Promise<void>) {
    setError("");
    setStatus("");
    setIsSubmitting(true);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "VAIVIA could not complete that request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const title =
    view === "signup" ? "Create your account" :
    view === "forgot-password" ? "Reset your password" :
    view === "update-password" ? "Choose a new password" :
    view === "confirm-email" ? "Check your email" : "Welcome back";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    if (view === "login") {
      await submit(async () => {
        await auth.signInWithPassword(email, password);
        onAuthenticated();
      });
      return;
    }
    if (view === "forgot-password") {
      await submit(async () => {
        await auth.requestPasswordRecovery(email);
        setStatus("If this email has a VAIVIA password account, recovery instructions are on the way.");
      });
      return;
    }
    if (view === "update-password") {
      if (password.length < 6) return setError("Password must be at least 6 characters.");
      if (password !== repeatPassword) return setError("Passwords do not match.");
      await submit(async () => {
        await auth.updateRecoveredPassword(password);
        onAuthenticated();
      });
      return;
    }
    if (view === "signup") {
      const cleanUsername = normalizeUsername(username);
      const usernameError = getUsernameValidationError(cleanUsername);
      const passwordError = getSignupPasswordValidationError({ password, email: email.trim(), username: cleanUsername });
      if (usernameError) return setError(usernameError);
      if (passwordError) return setError(passwordError);
      if (password !== repeatPassword) return setError("Passwords do not match.");
      if (!acceptedTerms) return setError("Please accept the terms and conditions to continue.");
      await submit(async () => {
        const result = await auth.signUpWithPassword({
          email,
          password,
          firstName,
          lastName,
          username: cleanUsername,
          marketingConsent,
        });
        if (result === "signed_in") onAuthenticated();
        else onNavigate("confirm-email", email.trim());
      });
    }
  }

  return (
    <main className="mobile-screen flex items-center justify-center px-5 py-[calc(1.5rem+var(--safe-area-top))] text-white">
      <section className="w-full max-w-md overflow-hidden rounded-[2.25rem] border border-white/10 bg-[#080511]/90 p-6 shadow-2xl shadow-black/50 sm:p-8">
        <div className="flex justify-center"><Brand /></div>
        {view !== "login" ? (
          <button type="button" onClick={() => onNavigate("login")} className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-black text-lime-200">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to login
          </button>
        ) : null}
        <p className="mt-6 text-xs font-black uppercase tracking-[0.28em] text-lime-300">VAIVIA for iPhone</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">{title}</h1>

        {view === "confirm-email" ? (
          <div className="mt-6 rounded-[1.5rem] border border-lime-300/25 bg-lime-300/10 p-5 text-sm font-semibold leading-6 text-lime-50" role="status">
            We sent a confirmation link to <strong>{initialEmail || email}</strong>. Open it on this iPhone to finish creating your VAIVIA account.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {view === "signup" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" icon={<UserRound className="h-5 w-5 text-slate-500" aria-hidden="true" />} />
                  <Field label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
                </div>
                <Field label="Username" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" />
              </>
            ) : null}
            {view !== "update-password" ? (
              <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" icon={<Mail className="h-5 w-5 text-slate-500" aria-hidden="true" />} />
            ) : null}
            {view !== "forgot-password" ? (
              <Field label={view === "update-password" ? "New password" : "Password"} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={view === "login" ? "current-password" : "new-password"} icon={<LockKeyhole className="h-5 w-5 text-slate-500" aria-hidden="true" />} />
            ) : null}
            {view === "signup" || view === "update-password" ? (
              <Field label="Repeat password" type="password" value={repeatPassword} onChange={(e) => setRepeatPassword(e.target.value)} required autoComplete="new-password" />
            ) : null}
            {view === "signup" ? (
              <>
                <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-400">
                  {passwordCriteria.map((criterion) => <span key={criterion.label} className={criterion.met ? "text-lime-200" : ""}>{criterion.met ? "✓" : "•"} {criterion.label}</span>)}
                </div>
                <label className="flex items-start gap-3 text-sm font-semibold text-slate-200">
                  <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-1 h-5 w-5 accent-lime-300" />
                  <span>I agree to VAIVIA&apos;s <a href={LEGAL_URL} target="_blank" rel="noopener noreferrer" className="font-black text-lime-100 underline">terms and privacy notice</a>.</span>
                </label>
                <label className="flex items-start gap-3 text-sm font-semibold text-slate-300">
                  <input type="checkbox" checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} className="mt-1 h-5 w-5 accent-lime-300" />
                  <span>Send me marketing emails about promotions and app updates.</span>
                </label>
              </>
            ) : null}
            {error || callbackError ? <p className="rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm font-semibold text-red-100" role="alert">{error || callbackError}</p> : null}
            {status ? <p className="rounded-2xl border border-lime-300/20 bg-lime-300/10 p-3 text-sm font-semibold text-lime-100" role="status">{status}</p> : null}
            <Button type="submit" disabled={isSubmitting} className="h-14 w-full rounded-2xl bg-lime-300 text-base font-black text-slate-950 hover:bg-lime-200">
              {isSubmitting ? "Please wait…" : view === "login" ? "Sign in" : view === "signup" ? "Create account" : view === "forgot-password" ? "Send reset email" : "Save new password"}
            </Button>
          </form>
        )}

        {view === "login" ? (
          <div className="mt-6 flex justify-between gap-4 text-sm font-bold">
            <button type="button" onClick={() => onNavigate("signup")} className="text-lime-200 underline underline-offset-4">Create account</button>
            <button type="button" onClick={() => onNavigate("forgot-password")} className="text-slate-300 underline underline-offset-4">Forgot password?</button>
          </div>
        ) : null}
        <LegalLinks />
      </section>
    </main>
  );
}
