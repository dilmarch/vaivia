"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type SocialAuthProvider = "google" | "apple" | "azure" | "facebook";

const SOCIAL_PROVIDER_LABELS: Record<SocialAuthProvider, string> = {
  google: "Google",
  apple: "Apple",
  // Microsoft login uses Supabase's "azure" provider; enable Azure in Supabase Auth -> Providers -> Azure.
  azure: "Microsoft",
  facebook: "Facebook",
};

type SocialLoginButtonProps = {
  provider: SocialAuthProvider;
  className?: string;
};

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.37c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.37 12 5.37z"
      />
    </svg>
  );
}

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
}

function SocialProviderIcon({ provider }: { provider: SocialAuthProvider }) {
  if (provider === "google") return <GoogleLogo />;
  if (provider === "azure") return <MicrosoftLogo />;

  return (
    <span className="text-xs font-black text-slate-900">
      {SOCIAL_PROVIDER_LABELS[provider].slice(0, 1)}
    </span>
  );
}

export function SocialLoginButton({
  provider,
  className,
}: SocialLoginButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const providerLabel = SOCIAL_PROVIDER_LABELS[provider];

  async function handleSocialLogin() {
    const supabase = createClient();
    setIsLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      router.push(`/auth/login?error=${encodeURIComponent(error.message)}`);
      setIsLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={cn("w-full", className)}
      disabled={isLoading}
      onClick={handleSocialLogin}
    >
      <span
        className="flex h-6 w-6 items-center justify-center rounded-md bg-white"
        aria-hidden="true"
      >
        <SocialProviderIcon provider={provider} />
      </span>
      {isLoading ? "Opening..." : `Continue with ${providerLabel}`}
    </Button>
  );
}
