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

type AuthContextValue = {
  session: Session | null;
  isInitializing: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function logMobileSession(event: string, session: Session | null) {
  console.info("[VAIVIA mobile auth]", {
    event,
    sessionExists: Boolean(session),
    accessTokenExists: Boolean(session?.access_token),
    authenticatedUserId: session?.user.id || null,
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => getMobileSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const removeLifecycleListener = registerMobileAuthLifecycle(supabase);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
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

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      removeLifecycleListener();
    };
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isInitializing,
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
      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [isInitializing, session, supabase],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useMobileAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useMobileAuth must be used inside AuthProvider.");
  }
  return context;
}
