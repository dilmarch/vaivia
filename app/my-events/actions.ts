"use server";

import { revalidatePath } from "next/cache";
import { requireEventUser } from "@/lib/events/auth";

export async function cancelMyEventRsvp(formData: FormData) {
  const eventId = String(formData.get("event_id") || "");
  const auth = await requireEventUser("/my-events");
  const { data, error } = await auth.supabase.rpc("cancel_event_rsvp", {
    target_event_id: eventId,
  });
  if (error || !data) throw new Error("That RSVP could not be cancelled.");
  revalidatePath("/my-events");
  revalidatePath(`/events/${String(formData.get("event_slug") || "")}`);
}
