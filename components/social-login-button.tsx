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
  azure: "Microsoft",
  facebook: "Facebook",
};

const SOCIAL_PROVIDER_MARKS: Record<SocialAuthProvider, string> = {
  google: "G",
  apple: "A",
  azure: "M",
  facebook: "f",
};

type SocialLoginButtonProps = {
  provider: SocialAuthProvider;
  className?: string;
};

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
        className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-900"
        aria-hidden="true"
      >
        {SOCIAL_PROVIDER_MARKS[provider]}
      </span>
      {isLoading ? "Opening..." : `Continue with ${providerLabel}`}
    </Button>
  );
}
