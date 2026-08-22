/* eslint-disable @next/next/no-img-element -- Capacitor renders local WebView markup without next/image. */
import { useEffect, useState } from "react";
import { EventTicketPresentation, type EventTicketPresentationData } from "@/components/events/EventTicketPresentation";
import type { MobileEventTicketResponse } from "@/lib/mobileApi/contracts";
import { ScreenMessage } from "../components/ScreenMessage";
import type { MobileApiClient } from "../lib/apiClient";

export function EventTicketScreen({ apiClient, ticketId, onBack }: { apiClient: MobileApiClient; ticketId: string; onBack: () => void }) {
  const [result, setResult] = useState<MobileEventTicketResponse | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { const controller = new AbortController(); void apiClient.getEventTicket(ticketId, controller.signal).then((data) => { if (!controller.signal.aborted) setResult(data); }).catch((reason: unknown) => { if (!controller.signal.aborted) setMessage(reason instanceof Error ? reason.message : "Could not load this ticket."); }); return () => controller.abort(); }, [apiClient, ticketId]);
  if (!result) return <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white"><ScreenMessage title={message ? "Ticket unavailable" : "Loading ticket"} message={message || "Preparing your secure event ticket."} /></main>;
  const ticket = result.ticket;
  const event = (Array.isArray(ticket.events) ? ticket.events[0] : ticket.events) as EventTicketPresentationData["event"];
  const tier = (Array.isArray(ticket.event_ticket_types) ? ticket.event_ticket_types[0] : ticket.event_ticket_types) as EventTicketPresentationData["tier"];
  const usable = ["active", "checked_in"].includes(String(ticket.status)) && Boolean(result.qrDataUrl);
  async function addToWallet() { try { const blob = await apiClient.downloadAppleWalletPass(ticketId); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `vaivia-${String(ticket.ticket_number)}.pkpass`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 10_000); } catch (error) { setMessage(error instanceof Error ? error.message : "Apple Wallet is unavailable."); } }
  return <><EventTicketPresentation data={{ id: String(ticket.id), ticket_number: String(ticket.ticket_number), attendee_name: String(ticket.attendee_name), status: String(ticket.status), event, tier, onlineUrl: result.privateDetails?.online_url || null, usable }} backAction={<button type="button" onClick={onBack} className="text-sm font-black text-lime-200">← My Events</button>} qr={result.qrDataUrl ? <img src={result.qrDataUrl} alt="Secure event ticket QR code" width={224} height={224} /> : undefined} walletAction={<button type="button" disabled={!result.appleWalletAvailable} onClick={() => void addToWallet()} className={`block w-full rounded-full px-4 py-2.5 text-center text-sm font-black ${result.appleWalletAvailable ? "bg-white text-black" : "cursor-not-allowed border border-white/10 text-slate-500"}`}>{result.appleWalletAvailable ? "Add to Apple Wallet" : "Apple Wallet isn’t configured yet"}</button>} />{message ? <p role="alert" className="fixed bottom-32 left-4 right-4 z-[100] rounded-2xl bg-red-950 p-4 text-sm font-bold text-red-100">{message}</p> : null}</>;
}
