import type { Metadata } from "next";
import {
  resendEventInvitation,
  revokeEventInvitation,
} from "@/app/organizer/events/actions";
import ConfirmSubmitButton from "@/components/events/ConfirmSubmitButton";
import EventInvitationManager from "@/components/events/EventInvitationManager";
import { requireEventManager } from "@/lib/events/auth";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "Event invitations – VAIVIA" };

export default async function EventInvitationsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  await requireEventManager(eventId);
  const service = createServiceRoleClient();
  const [{ data: event }, { data: invitations }] = await Promise.all([
    service
      .from("events")
      .select("title,visibility")
      .eq("id", eventId)
      .single(),
    service
      .from("event_invitations")
      .select("id,email_normalized,status,expires_at,last_sent_at,send_count")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
  ]);
  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white md:pl-32 md:pr-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
            Private guest list
          </p>
          <h1 className="mt-2 text-4xl font-black">
            Invitations · {event?.title}
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-400">
            {event?.visibility === "private"
              ? "Required for private-event access."
              : "Optional invitations for this public event."}
          </p>
        </header>
        <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
          <EventInvitationManager eventId={eventId} />
          <section className="space-y-3">
            {(invitations || []).map((invitation) => (
              <article
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-white/10 bg-[#080511] p-4"
              >
                <div>
                  <p className="font-black">{invitation.email_normalized}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-400">
                    {invitation.status} · sent {invitation.send_count} time
                    {invitation.send_count === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {invitation.status !== "accepted" ? (
                    <form action={resendEventInvitation}>
                      <input type="hidden" name="event_id" value={eventId} />
                      <input
                        type="hidden"
                        name="invitation_id"
                        value={invitation.id}
                      />
                      <button className="text-xs font-black text-lime-200">
                        Resend
                      </button>
                    </form>
                  ) : null}
                  {!["revoked", "expired"].includes(invitation.status) ? (
                    <form action={revokeEventInvitation}>
                      <input type="hidden" name="event_id" value={eventId} />
                      <input
                        type="hidden"
                        name="invitation_id"
                        value={invitation.id}
                      />
                      <ConfirmSubmitButton
                        message="Revoke this invitation?"
                        className="text-xs font-black text-red-200"
                      >
                        Revoke
                      </ConfirmSubmitButton>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
            {!invitations?.length ? (
              <p className="rounded-[1.5rem] border border-dashed border-white/15 p-6 text-sm font-semibold text-slate-400">
                No invitations yet.
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
