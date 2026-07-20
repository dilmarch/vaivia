import type { Metadata } from "next";
import Link from "next/link";
import { Edit3, Mail, QrCode, Ticket, Users } from "lucide-react";
import { notFound } from "next/navigation";
import ConfirmSubmitButton from "@/components/events/ConfirmSubmitButton";
import {
  addEventTeamMember,
  removeEventTeamMember,
  setEventLifecycle,
} from "@/app/organizer/events/actions";
import { requireEventManager } from "@/lib/events/auth";
import { formatEventDateTime } from "@/lib/events/format";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "Manage event – VAIVIA" };

export default async function OrganizerEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  await requireEventManager(eventId);
  const service = createServiceRoleClient();
  const [
    { data: event },
    { count: tickets },
    { count: rsvps },
    { count: orders },
    { data: team },
  ] = await Promise.all([
    service.from("events").select("*").eq("id", eventId).single(),
    service
      .from("event_tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId),
    service
      .from("event_rsvps")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "confirmed"),
    service
      .from("event_orders")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .in("status", ["paid", "free"]),
    service
      .from("event_team_members")
      .select("id,user_id,role")
      .eq("event_id", eventId),
  ]);
  if (!event) notFound();
  const { data: teamProfiles } = team?.length
    ? await service
        .from("user_profiles")
        .select("id,first_name,last_name,email")
        .in(
          "id",
          team.map((member) => member.user_id),
        )
    : { data: [] };
  const profiles = new Map(
    (teamProfiles || []).map((profile) => [profile.id, profile]),
  );
  const links = [
    {
      label: "Edit event",
      href: `/organizer/events/${eventId}/edit`,
      icon: Edit3,
    },
    {
      label: "Ticket tiers",
      href: `/organizer/events/${eventId}/tickets`,
      icon: Ticket,
    },
    {
      label: "Attendees",
      href: `/organizer/events/${eventId}/attendees`,
      icon: Users,
    },
    {
      label: "Check-in",
      href: `/organizer/events/${eventId}/check-in`,
      icon: QrCode,
    },
    {
      label: "Invitations",
      href: `/organizer/events/${eventId}/invitations`,
      icon: Mail,
    },
  ];
  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white md:pl-32 md:pr-8">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="rounded-[2.5rem] border border-white/10 bg-[#080511] p-7">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
            {event.status} · {event.visibility}
          </p>
          <h1 className="mt-3 text-4xl font-black sm:text-6xl">
            {event.title}
          </h1>
          <p className="mt-3 text-sm font-semibold text-slate-400">
            {formatEventDateTime(event.starts_at, event.timezone)}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/organizer/events/${eventId}/preview`}
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-black"
            >
              Preview
            </Link>
            {!["cancelled", "archived"].includes(event.status) ? (
              <form action={setEventLifecycle}>
                <input type="hidden" name="event_id" value={eventId} />
                <input
                  type="hidden"
                  name="lifecycle_action"
                  value={event.status === "published" ? "unpublish" : "publish"}
                />
                <ConfirmSubmitButton
                  message={
                    event.status === "published"
                      ? "Unpublish this event? Existing registrations will remain."
                      : "Publish this event now?"
                  }
                  className="rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950"
                >
                  {event.status === "published" ? "Unpublish" : "Publish"}
                </ConfirmSubmitButton>
              </form>
            ) : null}
            {!["cancelled", "archived"].includes(event.status) ? (
              <form action={setEventLifecycle}>
                <input type="hidden" name="event_id" value={eventId} />
                <input type="hidden" name="lifecycle_action" value="cancel" />
                <ConfirmSubmitButton
                  message="Cancel this event and void active admissions? Attendees will be notified."
                  className="rounded-full border border-red-300/30 px-5 py-2.5 text-sm font-black text-red-100"
                >
                  Cancel event
                </ConfirmSubmitButton>
              </form>
            ) : null}
            {event.status === "published" && event.visibility === "public" ? (
              <Link
                href={`/events/${event.slug}`}
                className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-black"
              >
                Preview public page
              </Link>
            ) : null}
          </div>
        </header>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Tickets issued" value={tickets || 0} />
          <Stat label="Confirmed RSVPs" value={rsvps || 0} />
          <Stat label="Completed orders" value={orders || 0} />
        </div>
        <nav className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-[1.75rem] border border-white/10 bg-[#080511] p-5 transition hover:border-lime-300/35"
            >
              <Icon className="h-6 w-6 text-lime-300" />
              <span className="mt-4 block text-xl font-black">{label}</span>
              <span className="mt-2 block text-sm font-semibold text-slate-400">
                Open organizer tools →
              </span>
            </Link>
          ))}
        </nav>
        <section className="rounded-[2rem] border border-white/10 bg-[#080511] p-6">
          <h2 className="text-2xl font-black">Event team</h2>
          <p className="mt-2 text-sm font-semibold text-slate-400">
            Only accounts with the global event-organizer role can be assigned.
          </p>
          <form
            action={addEventTeamMember}
            className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem_auto]"
          >
            <input type="hidden" name="event_id" value={eventId} />
            <input
              name="email"
              type="email"
              required
              placeholder="organizer@example.com"
              className="h-11 rounded-xl border border-white/15 bg-slate-950 px-3 text-sm font-bold text-white"
            />
            <select
              name="team_role"
              className="h-11 rounded-xl border border-white/15 bg-slate-950 px-3 text-sm font-bold text-white"
            >
              <option value="manager">Manager</option>
              <option value="check_in">Check-in</option>
            </select>
            <button className="rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950">
              Assign
            </button>
          </form>
          <div className="mt-4 space-y-2">
            {(team || []).map((member) => {
              const profile = profiles.get(member.user_id);
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-xl bg-white/[0.05] p-3"
                >
                  <div>
                    <p className="font-black">
                      {[profile?.first_name, profile?.last_name]
                        .filter(Boolean)
                        .join(" ") ||
                        profile?.email ||
                        "Organizer"}
                    </p>
                    <p className="text-xs font-semibold text-slate-400">
                      {member.role}
                    </p>
                  </div>
                  <form action={removeEventTeamMember}>
                    <input type="hidden" name="event_id" value={eventId} />
                    <input type="hidden" name="member_id" value={member.id} />
                    <button className="text-xs font-black text-red-200">
                      Remove
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5">
      <p className="text-3xl font-black text-lime-300">{value}</p>
      <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
    </div>
  );
}
