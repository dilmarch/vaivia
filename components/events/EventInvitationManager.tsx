"use client";

import { useActionState } from "react";
import {
  inviteEventGuests,
  type EventActionState,
} from "@/app/organizer/events/actions";

const initial: EventActionState = { ok: false, message: "" };

export default function EventInvitationManager({
  eventId,
}: {
  eventId: string;
}) {
  const [state, action, pending] = useActionState(inviteEventGuests, initial);
  return (
    <form
      action={action}
      className="rounded-[1.75rem] border border-white/10 bg-[#080511] p-5"
    >
      <input type="hidden" name="event_id" value={eventId} />
      <h2 className="text-xl font-black">Invite guests</h2>
      <p className="mt-2 text-sm font-semibold text-slate-400">
        Paste one address per line, or separate addresses with commas. Links are
        tied to the recipient email.
      </p>
      <label className="mt-4 block">
        <span className="text-xs font-black uppercase tracking-[0.14em] text-lime-200">
          Email addresses
        </span>
        <textarea
          name="emails"
          required
          rows={8}
          className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-950 p-4 text-sm font-semibold text-white outline-none focus:border-lime-300/50"
        />
      </label>
      {state.message ? (
        <p role="status" className="mt-3 text-sm font-bold text-lime-200">
          {state.message}
        </p>
      ) : null}
      <button
        disabled={pending}
        className="mt-4 rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send invitations"}
      </button>
    </form>
  );
}
