import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { requireEventOrganizer } from "@/lib/events/auth";
import { formatEventDateTime } from "@/lib/events/format";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "Manage events – VAIVIA" };

export default async function OrganizerEventsPage() {
  const auth = await requireEventOrganizer();
  const service = createServiceRoleClient();
  const { data: assignments } =
    auth.profile?.role === "super_admin"
      ? { data: [] }
      : await auth.supabase
          .from("event_team_members")
          .select("event_id")
          .eq("user_id", auth.user.id);
  const assignedIds = (assignments || []).map((item) => item.event_id);
  let eventsQuery = service
    .from("events")
    .select(
      "id,slug,title,status,visibility,starts_at,timezone,registration_mode",
    )
    .order("starts_at", { ascending: false });
  if (auth.profile?.role !== "super_admin") {
    eventsQuery = assignedIds.length
      ? eventsQuery.or(
          `owner_user_id.eq.${auth.user.id},id.in.(${assignedIds.join(",")})`,
        )
      : eventsQuery.eq("owner_user_id", auth.user.id);
  }
  const { data: events } = await eventsQuery;
  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white md:pl-32 md:pr-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4 rounded-[2.5rem] border border-white/10 bg-[#080511] p-7">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
              Organizer studio
            </p>
            <h1 className="mt-3 text-4xl font-black sm:text-6xl">Events</h1>
          </div>
          <Link
            href="/organizer/events/new"
            className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950"
          >
            <Plus className="h-4 w-4" />
            New event
          </Link>
        </header>
        <div className="mt-7 grid gap-4">
          {(events || []).map((event) => (
            <article
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/10 bg-[#080511] p-5"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black">{event.title}</h2>
                  <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-300">
                    {event.status}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-400">
                  {formatEventDateTime(event.starts_at, event.timezone)} ·{" "}
                  {event.visibility} · {event.registration_mode}
                </p>
              </div>
              <div className="flex gap-3">
                <Link
                  href={`/organizer/events/${event.id}`}
                  className="rounded-full border border-white/15 px-4 py-2 text-sm font-black"
                >
                  Manage
                </Link>
                {event.status === "published" &&
                event.visibility === "public" ? (
                  <Link
                    href={`/events/${event.slug}`}
                    className="rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950"
                  >
                    Public page
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
          {!events?.length ? (
            <div className="rounded-[2rem] border border-dashed border-white/15 p-10 text-center">
              <Users className="mx-auto h-9 w-9 text-slate-500" />
              <h2 className="mt-4 text-2xl font-black">
                Create your first event
              </h2>
              <p className="mt-2 text-sm font-semibold text-slate-400">
                Start as a draft, then add tickets and publish when it’s ready.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
