import { App } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/supabase";
import { getMobileEnvironment } from "./environment";

const MOBILE_AUTH_STORAGE_KEY = "vaivia.mobile.auth.v1";

let mobileSupabaseClient: SupabaseClient<Database> | null = null;

export function getMobileSupabaseClient() {
  if (mobileSupabaseClient) return mobileSupabaseClient;

  const environment = getMobileEnvironment();
  mobileSupabaseClient = createClient<Database>(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
    {
      auth: {
        storage: window.localStorage,
        storageKey: MOBILE_AUTH_STORAGE_KEY,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    },
  );

  return mobileSupabaseClient;
}

export function registerMobileAuthLifecycle(client: SupabaseClient<Database>) {
  if (!Capacitor.isNativePlatform()) return () => undefined;

  let listener: PluginListenerHandle | null = null;
  let disposed = false;

  void App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      client.auth.startAutoRefresh();
    } else {
      client.auth.stopAutoRefresh();
    }
  }).then((handle) => {
    if (disposed) {
      void handle.remove();
      return;
    }
    listener = handle;
  });

  return () => {
    disposed = true;
    if (listener) void listener.remove();
  };
}
