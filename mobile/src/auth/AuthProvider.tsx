import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getMobileSupabaseClient,
  registerMobileAuthLifecycle,
} from "../lib/supabase";
export {
  MOBILE_AUTH_SCHEME,
  MOBILE_CONFIRM_CALLBACK_URL,
  MOBILE_RECOVERY_CALLBACK_URL,
} from "@/lib/account/mobileAuthCallbacks";
import {
  MOBILE_AUTH_SCHEME,
  MOBILE_CONFIRM_CALLBACK_URL,
  MOBILE_RECOVERY_CALLBACK_URL,
} from "@/lib/account/mobileAuthCallbacks";

export type MobileAuthCallback = {
  kind: "confirmation" | "recovery";
  status: "processing" | "complete" | "error";
  message?: string;
} | null;

type MobileSignupInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  username: string;
  marketingConsent: boolean;
};

type AuthContextValue = {
  session: Session | null;
  isInitializing: boolean;
  authCallback: MobileAuthCallback;
  clearAuthCallback: () => void;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (input: MobileSignupInput) => Promise<"signed_in" | "confirmation_required">;
  requestPasswordRecovery: (email: string) => Promise<void>;
  updateRecoveredPassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const processedAuthCallbackCodes = new Set<string>();

function logMobileSession(event: string, session: Session | null) {
  console.info("[VAIVIA mobile auth]", {
    event,
    sessionExists: Boolean(session),
    accessTokenExists: Boolean(session?.access_token),
    authenticatedUserId: session?.user.id || null,
  });
}

export function parseMobileAuthCallbackUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${MOBILE_AUTH_SCHEME}:` || parsed.host !== "auth") {
      return null;
    }
    const kind: "recovery" | "confirmation" | null =
      parsed.pathname === "/recovery"
        ? "recovery"
        : parsed.pathname === "/confirm"
          ? "confirmation"
          : null;
    if (!kind) return null;
    const code = parsed.searchParams.get("code");
    const callbackError =
      parsed.searchParams.get("error_description") ||
      parsed.searchParams.get("error") ||
      null;
    return {
      kind,
      code,
      errorMessage:
        callbackError || (!code ? "This email link is invalid or has expired." : null),
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => getMobileSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authCallback, setAuthCallback] = useState<MobileAuthCallback>(null);

  useEffect(() => {
    let isMounted = true;
    const removeLifecycleListener = registerMobileAuthLifecycle(supabase);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      logMobileSession(_event, nextSession);
      setSession(nextSession);
      setIsInitializing(false);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      logMobileSession("INITIAL_SESSION_READ", data.session);
      setSession(data.session);
      setIsInitializing(false);
    });

    let urlListener: PluginListenerHandle | null = null;
    const handleUrl = async (url: string) => {
      const callback = parseMobileAuthCallbackUrl(url);
      if (!callback || !isMounted) return;
      if (callback.errorMessage || !callback.code) {
        setAuthCallback({
          kind: callback.kind,
          status: "error",
          message: callback.errorMessage || "This email link is invalid or has expired.",
        });
        return;
      }
      if (processedAuthCallbackCodes.has(callback.code)) return;
      processedAuthCallbackCodes.add(callback.code);
      setAuthCallback({ kind: callback.kind, status: "processing" });
      const { data, error } = await supabase.auth.exchangeCodeForSession(callback.code);
      if (!isMounted) return;
      if (error || !data.session?.access_token) {
        processedAuthCallbackCodes.delete(callback.code);
        setAuthCallback({
          kind: callback.kind,
          status: "error",
          message: error?.message || "This email link is invalid or has expired.",
        });
        return;
      }
      setSession(data.session);
      setAuthCallback({ kind: callback.kind, status: "complete" });
    };

    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener("appUrlOpen", ({ url }) => void handleUrl(url)).then(
        (handle) => {
          if (!isMounted) void handle.remove();
          else urlListener = handle;
        },
      );
      void CapacitorApp.getLaunchUrl().then((launch) => {
        if (launch?.url) void handleUrl(launch.url);
      });
    }

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      removeLifecycleListener();
      if (urlListener) void urlListener.remove();
    };
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isInitializing,
      authCallback,
      clearAuthCallback: () => setAuthCallback(null),
      async signInWithPassword(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        logMobileSession("PASSWORD_SIGN_IN_COMPLETE", data.session);
        if (!data.session?.access_token) {
          throw new Error("VAIVIA could not establish an authenticated session.");
        }
        setSession(data.session);
        setIsInitializing(false);
      },
      async signUpWithPassword(input) {
        const now = new Date().toISOString();
        const firstName = input.firstName.trim();
        const lastName = input.lastName.trim();
        const { data, error } = await supabase.auth.signUp({
          email: input.email.trim(),
          password: input.password,
          options: {
            emailRedirectTo: MOBILE_CONFIRM_CALLBACK_URL,
            data: {
              first_name: firstName,
              last_name: lastName,
              full_name: [firstName, lastName].filter(Boolean).join(" "),
              preferred_username: input.username,
              username: input.username,
              marketing_emails_consent: input.marketingConsent,
              marketing_emails_consented_at: input.marketingConsent ? now : null,
              marketing_emails_consent_decided_at: now,
              terms_accepted_at: now,
            },
          },
        });
        if (error) throw error;
        if (data.session?.access_token) {
          setSession(data.session);
          setAuthCallback({ kind: "confirmation", status: "complete" });
          return "signed_in";
        }
        return "confirmation_required";
      },
      async requestPasswordRecovery(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: MOBILE_RECOVERY_CALLBACK_URL,
        });
        if (error) throw error;
      },
      async updateRecoveredPassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setAuthCallback(null);
      },
      async signOut() {
        setAuthCallback(null);
        const { error } = await supabase.auth.signOut();
        setSession(null);
        if (error) throw error;
      },
    }),
    [authCallback, isInitializing, session, supabase],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useMobileAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useMobileAuth must be used inside AuthProvider.");
  return context;
}
