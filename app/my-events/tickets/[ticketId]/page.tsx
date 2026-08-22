import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventTicketPresentation } from "@/components/events/EventTicketPresentation";
import { requireEventUser } from "@/lib/events/auth";
import { loadAttendeeTicket } from "@/lib/events/attendee";
import { getGoogleWalletStatus } from "@/lib/events/wallet";

export const metadata: Metadata = { title: "Event ticket – VAIVIA", robots: { index: false, follow: false } };

export default async function TicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const auth = await requireEventUser(`/my-events/tickets/${ticketId}`);
  const result = await loadAttendeeTicket(ticketId, auth.user.id).catch(() => null);
  if (!result) notFound();
  const event = Array.isArray(result.ticket.events) ? result.ticket.events[0] : result.ticket.events;
  const tier = Array.isArray(result.ticket.event_ticket_types) ? result.ticket.event_ticket_types[0] : result.ticket.event_ticket_types;
  if (!event) notFound();
  const usable = ["active", "checked_in"].includes(result.ticket.status) && Boolean(result.qrDataUrl);
  const google = getGoogleWalletStatus();
  return (
    <EventTicketPresentation
      data={{ id: result.ticket.id, ticket_number: result.ticket.ticket_number, attendee_name: result.ticket.attendee_name, status: result.ticket.status, event, tier: tier || null, onlineUrl: result.privateDetails?.online_url || null, usable }}
      backAction={<Link href="/my-events" className="text-sm font-black text-lime-200">← My Events</Link>}
      qr={result.qrDataUrl ? <Image src={result.qrDataUrl} alt="Secure event ticket QR code" width={224} height={224} unoptimized /> : undefined}
      walletAction={<><a href={`/api/events/tickets/${result.ticket.id}/apple-wallet`} aria-disabled={!result.appleWalletAvailable} className={`block rounded-full px-4 py-2.5 text-center text-sm font-black ${result.appleWalletAvailable ? "bg-white text-black" : "cursor-not-allowed border border-white/10 text-slate-500"}`}>{result.appleWalletAvailable ? "Add to Apple Wallet" : "Apple Wallet isn’t configured yet"}</a><a href={`/api/events/tickets/${result.ticket.id}/google-wallet`} aria-disabled={!google.configured} className={`block rounded-full px-4 py-2.5 text-center text-sm font-black ${google.configured ? "bg-white text-black" : "cursor-not-allowed border border-white/10 text-slate-500"}`}>{google.configured ? "Add to Google Wallet" : "Google Wallet isn’t configured yet"}</a></>}
    />
  );
}
