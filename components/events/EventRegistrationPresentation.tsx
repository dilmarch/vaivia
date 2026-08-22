import { Bookmark, Check, Loader2, Ticket } from "lucide-react";
import { formatEventMoney } from "@/lib/events/format";
import type { EventTicketType } from "@/lib/events/types";

export function EventRegistrationPresentation({
  registrationMode,
  ticketTypes,
  quantities,
  saved,
  pending,
  message,
  onQuantity,
  onRegister,
  onSave,
}: {
  registrationMode: "rsvp" | "ticketed";
  ticketTypes: EventTicketType[];
  quantities: Record<string, number>;
  saved: boolean;
  pending: "save" | "register" | null;
  message: string;
  onQuantity: (ticketTypeId: string, quantity: number) => void;
  onRegister: () => void;
  onSave: () => void;
}) {
  return (
    <aside className="rounded-[2rem] border border-white/10 bg-[#080511]/95 p-5 shadow-2xl shadow-black/40 lg:sticky lg:top-28">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[0.2em] text-lime-300">Admission</p><h2 className="mt-2 text-2xl font-black text-white">{registrationMode === "rsvp" ? "Join the guest list" : "Choose tickets"}</h2></div>
        <Ticket className="h-7 w-7 text-lime-300" aria-hidden="true" />
      </div>
      {registrationMode === "ticketed" ? (
        <div className="mt-5 space-y-3">
          {ticketTypes.map((tier) => {
            const remaining = Math.max(0, tier.total_quantity - tier.quantity_held - tier.quantity_sold);
            const unavailable = tier.state !== "active" || remaining === 0;
            return (
              <label key={tier.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <span className="min-w-0"><span className="block font-black text-white">{tier.name}</span><span className="mt-1 block text-xs font-semibold text-slate-400">{tier.price_minor ? formatEventMoney(tier.price_minor + tier.fee_minor + tier.tax_minor, tier.currency) : "Free"} · {remaining ? `${remaining} left` : "Sold out"}</span></span>
                <select aria-label={`${tier.name} quantity`} disabled={unavailable} value={quantities[tier.id] || 0} onChange={(event) => onQuantity(tier.id, Number(event.target.value))} className="rounded-xl border border-white/15 bg-slate-950 px-3 py-2 font-black text-white disabled:opacity-50">
                  {Array.from({ length: Math.min(tier.max_per_order, remaining) + 1 }, (_, quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}
                </select>
              </label>
            );
          })}
          {!ticketTypes.length ? <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold text-slate-400">Ticket details are coming soon.</p> : null}
        </div>
      ) : <p className="mt-4 text-sm font-semibold leading-6 text-slate-300">Confirm your attendance now. You can cancel your RSVP later from My Events.</p>}
      <button type="button" onClick={onRegister} disabled={pending !== null || (registrationMode === "ticketed" && !ticketTypes.length)} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.25)] transition hover:bg-lime-200 disabled:opacity-50">
        {pending === "register" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}{registrationMode === "rsvp" ? "Confirm RSVP" : "Continue"}
      </button>
      <button type="button" onClick={onSave} disabled={pending !== null} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 text-sm font-black text-white transition hover:border-lime-300/40 hover:text-lime-200 disabled:opacity-50">
        {pending === "save" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Bookmark className={`h-4 w-4 ${saved ? "fill-current text-lime-300" : ""}`} aria-hidden="true" />}{saved ? "Saved" : "Save event"}
      </button>
      {message ? <p role="status" className="mt-4 rounded-xl border border-lime-300/20 bg-lime-300/10 p-3 text-sm font-bold text-lime-100">{message}</p> : null}
    </aside>
  );
}
