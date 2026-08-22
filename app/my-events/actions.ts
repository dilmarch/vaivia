"use server";

import { revalidatePath } from "next/cache";
import { requireEventUser } from "@/lib/events/auth";
import { cancelAttendeeRsvp } from "@/lib/events/attendee";

export async function cancelMyEventRsvp(formData: FormData) {
  const eventId = String(formData.get("event_id") || "");
  const auth = await requireEventUser("/my-events");
  await cancelAttendeeRsvp(auth.supabase, eventId);
  revalidatePath("/my-events");
  revalidatePath(`/events/${String(formData.get("event_slug") || "")}`);
}
