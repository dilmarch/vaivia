import type { Metadata } from "next";
import { createHash } from "node:crypto";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import EventRegistrationPanel from "@/components/events/EventRegistrationPanel";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { eventLocationLabel, formatEventDateTime } from "@/lib/events/format";
import type { EventTicketType } from "@/lib/events/types";

export const metadata: Metadata = {
  title: "Private event invitation – VAIVIA",
  robots: { index: false, follow: false },
};

export default async function EventInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/i.test(token)) return <InvalidInvite />;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const service = createServiceRoleClient();
  const { data: invitation } = await service
    .from("event_invitations")
    .select("id,event_id,email_normalized,status,expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  const usable =
    invitation &&
    ["pending", "accepted"].includes(invitation.status) &&
    (!invitation.expires_at || new Date(invitation.expires_at) > new Date());
  if (!usable) return <InvalidInvite />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const next = `/events/invite/${token}`;
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0c0115] px-4 text-white">
        <section className="max-w-lg rounded-[2.5rem] border border-white/10 bg-[#080511] p-8 text-center shadow-2xl">
          <LockKeyhole className="mx-auto h-10 w-10 text-lime-300" />
          <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-lime-300">
            Private invitation
          </p>
          <h1 className="mt-3 text-3xl font-black">
            Sign in to reveal your event
          </h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">
            Use the email address that received this invitation. Event details
            stay private until VAIVIA verifies it matches.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href={`/auth/login?next=${encodeURIComponent(next)}`}
              className="rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950"
            >
              Sign in
            </Link>
            <Link
              href={`/auth/sign-up?next=${encodeURIComponent(next)}`}
              className="rounded-full border border-white/15 px-5 py-3 text-sm font-black"
            >
              Create account
            </Link>
          </div>
        </section>
      </main>
    );
  }
  if ((user.email || "").trim().toLowerCase() !== invitation.email_normalized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0c0115] px-4 text-white">
        <section className="max-w-lg rounded-[2.5rem] border border-red-300/20 bg-[#080511] p-8 text-center">
          <LockKeyhole className="mx-auto h-10 w-10 text-red-200" />
          <h1 className="mt-5 text-3xl font-black">
            This invitation belongs to another email
          </h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">
            Sign in with the address that received the invitation. Forwarding
            the link does not transfer access.
          </p>
        </section>
      </main>
    );
  }
  const { data: claimedEventId, error: claimError } = await supabase.rpc(
    "claim_event_invitation",
    { target_token_hash: tokenHash },
  );
  if (claimError || !claimedEventId) return <InvalidInvite />;
  const [{ data: event }, { data: tiers }] = await Promise.all([
    service
      .from("events")
      .select("*")
      .eq("id", claimedEventId)
      .is("deleted_at", null)
      .single(),
    service
      .from("event_ticket_types")
      .select("*")
      .eq("event_id", claimedEventId)
      .in("state", ["active", "sold_out"])
      .order("display_order"),
  ]);
  if (!event) return <InvalidInvite />;
  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white md:pl-32 md:pr-8">
      <div className="mx-auto grid max-w-5xl gap-7 lg:grid-cols-[1fr_22rem]">
        <article className="rounded-[2.5rem] border border-white/10 bg-[#080511] p-7">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
            Private VAIVIA Event
          </p>
          <h1 className="mt-3 text-4xl font-black">{event.title}</h1>
          <p className="mt-4 text-lg font-semibold text-slate-300">
            {event.short_summary}
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/[0.05] p-4 font-bold">
              {formatEventDateTime(event.starts_at, event.timezone)}
            </div>
            <div className="rounded-2xl bg-white/[0.05] p-4 font-bold">
              {eventLocationLabel(event)}
            </div>
          </div>
          <div className="mt-7 whitespace-pre-wrap border-t border-white/10 pt-7 font-semibold leading-8 text-slate-300">
            {event.description}
          </div>
        </article>
        <EventRegistrationPanel
          eventId={event.id}
          slug={`invite/${token}`}
          registrationMode={
            event.registration_mode === "ticketed" ? "ticketed" : "rsvp"
          }
          ticketTypes={(tiers || []) as unknown as EventTicketType[]}
          authenticated
          initiallySaved={false}
        />
      </div>
    </main>
  );
}

function InvalidInvite() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0c0115] px-4 text-white">
      <section className="max-w-lg rounded-[2.5rem] border border-white/10 bg-[#080511] p-8 text-center">
        <LockKeyhole className="mx-auto h-10 w-10 text-slate-400" />
        <h1 className="mt-5 text-3xl font-black">Invitation unavailable</h1>
        <p className="mt-3 text-sm font-semibold text-slate-400">
          This link is invalid, expired, or has been revoked. Ask the organizer
          for a new invitation.
        </p>
        <Link
          href="/events"
          className="mt-6 inline-flex rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950"
        >
          Browse public events
        </Link>
      </section>
    </main>
  );
}
