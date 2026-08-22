import type { Metadata } from "next";
import Link from "next/link";
import {
  EventCreateActionPresentation,
  EventOperationsListPresentation,
} from "@/components/events/EventOperationsPresentation";
import { requireEventOrganizer } from "@/lib/events/auth";
import { listManagedEvents } from "@/lib/events/operations";

export const metadata: Metadata = { title: "Manage events – VAIVIA" };

export default async function OrganizerEventsPage() {
  const auth = await requireEventOrganizer();
  const { events } = await listManagedEvents(auth.supabase, auth.user.id);
  return (
    <EventOperationsListPresentation
      events={events}
      createAction={
        <EventCreateActionPresentation
          renderAction={(props) => (
          <Link
            href="/organizer/events/new"
            {...props}
          />
          )}
        />
      }
      renderManageAction={(event) => (
        <Link
          href={`/organizer/events/${event.id}`}
          className="rounded-full border border-white/15 px-4 py-2 text-sm font-black"
        >
          Manage
        </Link>
      )}
      renderPublicAction={(event) => (
        <Link
          href={`/events/${event.slug}`}
          className="rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950"
        >
          Public page
        </Link>
      )}
    />
  );
}
