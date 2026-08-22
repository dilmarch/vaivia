import type { ReactNode } from "react";
import { CircleAlert, TicketCheck } from "lucide-react";
import { eventLocationLabel, formatEventDateTime } from "@/lib/events/format";

export type EventTicketPresentationData = {
  id: string;
  ticket_number: string;
  attendee_name: string;
  status: string;
  event: { title: string; starts_at: string; timezone: string; venue_type: string; venue_name: string | null; city: string | null; region: string | null };
  tier: { name: string; attendee_instructions: string | null } | null;
  onlineUrl: string | null;
  usable: boolean;
};

export function EventTicketPresentation({ data, backAction, qr, walletAction }: { data: EventTicketPresentationData; backAction: ReactNode; qr?: ReactNode; walletAction?: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white md:pl-32 md:pr-8"><div className="mx-auto max-w-2xl">{backAction}<article className="mt-5 overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#080511] shadow-2xl shadow-black/45"><header className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.18),transparent_45%)] p-7"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.24em] text-lime-300"><TicketCheck className="h-4 w-4" aria-hidden="true" />VAIVIA Event Ticket</p><h1 className="mt-3 text-4xl font-black">{data.event.title}</h1><p className="mt-3 text-sm font-semibold text-slate-300">{formatEventDateTime(data.event.starts_at, data.event.timezone)} · {eventLocationLabel(data.event)}</p>{data.event.venue_type === "online" && data.onlineUrl && data.usable ? <a href={data.onlineUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950">Join online event</a> : null}</header><div className="grid gap-7 p-7 sm:grid-cols-[1fr_16rem]"><div><dl className="space-y-4"><div><dt className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Ticket</dt><dd className="mt-1 font-black">{data.tier?.name || "Admission"}</dd></div><div><dt className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Attendee</dt><dd className="mt-1 font-black">{data.attendee_name}</dd></div><div><dt className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Ticket number</dt><dd className="mt-1 font-mono text-sm font-bold">{data.ticket_number}</dd></div><div><dt className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Status</dt><dd className={`mt-1 font-black uppercase ${data.usable ? "text-lime-300" : "text-red-200"}`}>{data.status.replace("_", " ")}</dd></div></dl>{data.usable ? <div className="mt-6 space-y-2">{walletAction}</div> : null}</div><div className="flex flex-col items-center justify-center rounded-[1.75rem] bg-white p-4 text-slate-950">{qr || <CircleAlert className="h-12 w-12 text-red-600" aria-hidden="true" />}<p className="mt-2 text-center text-xs font-black">{data.status === "checked_in" ? "Already checked in" : data.usable ? "Present this code at entry" : "This ticket can’t be used"}</p></div></div>{data.tier?.attendee_instructions ? <p className="border-t border-white/10 p-6 text-sm font-semibold text-slate-300">{data.tier.attendee_instructions}</p> : null}</article></div></main>
  );
}
