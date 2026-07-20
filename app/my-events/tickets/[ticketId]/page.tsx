import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleAlert, TicketCheck } from "lucide-react";
import { requireEventUser } from "@/lib/events/auth";
import {
  createTicketQrDataUrl,
  getOwnedTicketWithSecret,
} from "@/lib/events/tickets";
import { eventLocationLabel, formatEventDateTime } from "@/lib/events/format";
import {
  getAppleWalletStatus,
  getGoogleWalletStatus,
} from "@/lib/events/wallet";

export const metadata: Metadata = {
  title: "Event ticket – VAIVIA",
  robots: { index: false, follow: false },
};

export default async function TicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  const auth = await requireEventUser(`/my-events/tickets/${ticketId}`);
  const result = await getOwnedTicketWithSecret(ticketId, auth.user.id);
  if (!result) notFound();
  const ticket = result.ticket;
  const event = Array.isArray(ticket.events) ? ticket.events[0] : ticket.events;
  const tier = Array.isArray(ticket.event_ticket_types)
    ? ticket.event_ticket_types[0]
    : ticket.event_ticket_types;
  if (!event) notFound();
  const { data: privateDetails } = await auth.supabase
    .from("event_private_details")
    .select("online_url")
    .eq("event_id", event.id)
    .maybeSingle();
  const usable =
    ["active", "checked_in"].includes(ticket.status) &&
    Boolean(result.redemptionSecret);
  const qr =
    usable && result.redemptionSecret
      ? await createTicketQrDataUrl(result.redemptionSecret)
      : null;
  const apple = getAppleWalletStatus();
  const google = getGoogleWalletStatus();
  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white md:pl-32 md:pr-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/my-events" className="text-sm font-black text-lime-200">
          ← My Events
        </Link>
        <article className="mt-5 overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#080511] shadow-2xl shadow-black/45">
          <header className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.18),transparent_45%)] p-7">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.24em] text-lime-300">
              <TicketCheck className="h-4 w-4" />
              VAIVIA Event Ticket
            </p>
            <h1 className="mt-3 text-4xl font-black">{event.title}</h1>
            <p className="mt-3 text-sm font-semibold text-slate-300">
              {formatEventDateTime(event.starts_at, event.timezone)} ·{" "}
              {eventLocationLabel(event)}
            </p>
            {event.venue_type === "online" &&
            privateDetails?.online_url &&
            usable ? (
              <a
                href={privateDetails.online_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950"
              >
                Join online event
              </a>
            ) : null}
          </header>
          <div className="grid gap-7 p-7 sm:grid-cols-[1fr_16rem]">
            <div>
              <dl className="space-y-4">
                <div>
                  <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Ticket
                  </dt>
                  <dd className="mt-1 font-black">
                    {tier?.name || "Admission"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Attendee
                  </dt>
                  <dd className="mt-1 font-black">{ticket.attendee_name}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Ticket number
                  </dt>
                  <dd className="mt-1 font-mono text-sm font-bold">
                    {ticket.ticket_number}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Status
                  </dt>
                  <dd
                    className={`mt-1 font-black uppercase ${usable ? "text-lime-300" : "text-red-200"}`}
                  >
                    {ticket.status.replace("_", " ")}
                  </dd>
                </div>
              </dl>
              {usable ? (
                <div className="mt-6 space-y-2">
                  <a
                    href={`/api/events/tickets/${ticket.id}/apple-wallet`}
                    aria-disabled={!apple.configured}
                    className={`block rounded-full px-4 py-2.5 text-center text-sm font-black ${apple.configured ? "bg-white text-black" : "cursor-not-allowed border border-white/10 text-slate-500"}`}
                  >
                    {apple.configured
                      ? "Add to Apple Wallet"
                      : "Apple Wallet isn’t configured yet"}
                  </a>
                  <a
                    href={`/api/events/tickets/${ticket.id}/google-wallet`}
                    aria-disabled={!google.configured}
                    className={`block rounded-full px-4 py-2.5 text-center text-sm font-black ${google.configured ? "bg-white text-black" : "cursor-not-allowed border border-white/10 text-slate-500"}`}
                  >
                    {google.configured
                      ? "Add to Google Wallet"
                      : "Google Wallet isn’t configured yet"}
                  </a>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col items-center justify-center rounded-[1.75rem] bg-white p-4 text-slate-950">
              {qr ? (
                <Image
                  src={qr}
                  alt="Secure event ticket QR code"
                  width={224}
                  height={224}
                  unoptimized
                />
              ) : (
                <CircleAlert className="h-12 w-12 text-red-600" />
              )}
              <p className="mt-2 text-center text-xs font-black">
                {ticket.status === "checked_in"
                  ? "Already checked in"
                  : usable
                    ? "Present this code at entry"
                    : "This ticket can’t be used"}
              </p>
            </div>
          </div>
          {tier?.attendee_instructions ? (
            <p className="border-t border-white/10 p-6 text-sm font-semibold text-slate-300">
              {tier.attendee_instructions}
            </p>
          ) : null}
        </article>
      </div>
    </main>
  );
}
