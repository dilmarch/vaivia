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
      setSession(nextSession);
      setIsInitializing(false);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
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
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
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
