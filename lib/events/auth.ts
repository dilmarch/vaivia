import "server-only";

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getEventAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("user_profiles")
        .select("role,first_name,last_name,username,email")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  return { supabase, user, profile };
}

export async function requireEventUser(returnTo: string) {
  const auth = await getEventAuth();
  if (!auth.user) {
    redirect(`/auth/login?next=${encodeURIComponent(returnTo)}`);
  }
  return { ...auth, user: auth.user };
}

export async function requireEventOrganizer() {
  const auth = await requireEventUser("/organizer/events");
  if (!["event_organizer", "super_admin"].includes(auth.profile?.role || "")) {
    redirect("/events");
  }
  return auth;
}

export async function requireEventManager(eventId: string) {
  const auth = await requireEventOrganizer();
  const { data, error } = await auth.supabase.rpc("event_user_can_manage", {
    target_event_id: eventId,
    target_user_id: auth.user.id,
  });
  if (error || !data) notFound();
  return auth;
}

export function isEventOrganizerRole(role: string | null | undefined) {
  return role === "event_organizer" || role === "super_admin";
}
