import type { Metadata } from "next";
import OrganizerEventCreateModal from "@/components/events/OrganizerEventCreateModal";
import { requireEventOrganizer } from "@/lib/events/auth";

export const metadata: Metadata = { title: "New event – VAIVIA" };

export default async function NewEventPage() {
  await requireEventOrganizer();
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const local = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return (
    <main className="min-h-screen bg-[#0c0115] text-white">
      <OrganizerEventCreateModal
        event={{
          starts_at_local: local(start),
          ends_at_local: local(end),
          status: "draft",
          visibility: "public",
          registration_mode: "rsvp",
        }}
      />
    </main>
  );
}
