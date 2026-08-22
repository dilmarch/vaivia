import type { FormEvent, ReactNode } from "react";
import { Search, Sparkles } from "lucide-react";

export type EventFilterValues = {
  q: string;
  city: string;
  category: string;
  from: string;
  to: string;
  price: string;
};

export function EventsIndexPresentation({
  values,
  onValue,
  onSubmit,
  onMyEvents,
  onClear,
  cards,
  page,
  totalPages,
  onPage,
}: {
  values: EventFilterValues;
  onValue?: (name: keyof EventFilterValues, value: string) => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  onMyEvents: () => void;
  onClear: () => void;
  cards: ReactNode[];
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  const field = (name: keyof EventFilterValues) => ({
    name,
    defaultValue: onValue ? undefined : values[name],
    value: onValue ? values[name] : undefined,
    onChange: onValue
      ? (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
          onValue(name, event.target.value)
      : undefined,
  });
  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-[calc(6.5rem+var(--safe-area-top))] text-white md:pl-32 md:pr-8 md:pt-24">
      <div className="mx-auto max-w-7xl">
        <header className="overflow-hidden rounded-[2.5rem] border border-white/10 bg-[radial-gradient(circle_at_10%_0%,rgba(var(--vaivia-neon-rgb),0.2),transparent_35%),linear-gradient(135deg,#160724,#05030a)] p-7 shadow-2xl shadow-black/40 sm:p-10">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.32em] text-lime-300"><Sparkles className="h-4 w-4" aria-hidden="true" />VAIVIA Events</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">Good plans deserve a guest list.</h1>
          <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-slate-300">Discover gatherings, nights out, workshops, and experiences operated by Dream Haus and VAIVIA.</p>
          <form onSubmit={onSubmit} className="mt-7 grid gap-3 rounded-[1.75rem] border border-white/10 bg-black/20 p-4 md:grid-cols-8">
            <label className="relative md:col-span-2"><span className="sr-only">Search events</span><Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" /><input {...field("q")} placeholder="Search events" className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/80 pl-11 pr-3 text-sm font-bold text-white outline-none focus:border-lime-300/50" /></label>
            <input {...field("city")} aria-label="City" placeholder="City" className="h-11 rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm font-bold text-white outline-none focus:border-lime-300/50" />
            <input {...field("category")} aria-label="Category" placeholder="Category" className="h-11 rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm font-bold text-white outline-none focus:border-lime-300/50" />
            <label><span className="sr-only">Events from</span><input {...field("from")} type="date" className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm font-bold text-white outline-none focus:border-lime-300/50" /></label>
            <label><span className="sr-only">Events through</span><input {...field("to")} type="date" className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm font-bold text-white outline-none focus:border-lime-300/50" /></label>
            <select {...field("price")} aria-label="Price" className="h-11 rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm font-bold text-white"><option value="">Any price</option><option value="free">Free</option><option value="paid">Paid</option></select>
            <button className="h-11 rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950 hover:bg-lime-200">Find events</button>
          </form>
        </header>
        <section className="mt-9">
          <div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">Featured & upcoming</p><h2 className="mt-2 text-3xl font-black">What’s happening</h2></div><button type="button" onClick={onMyEvents} className="text-sm font-black text-lime-200 hover:text-lime-100">My Events →</button></div>
          {cards.length ? <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{cards}</div> : <div className="rounded-[2rem] border border-dashed border-white/15 bg-white/[0.04] p-10 text-center"><h2 className="text-2xl font-black">No events match those filters</h2><p className="mt-2 text-sm font-semibold text-slate-400">Try a broader search or clear a filter.</p><button type="button" onClick={onClear} className="mt-5 inline-flex rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950">Clear filters</button></div>}
          {totalPages > 1 ? <nav className="mt-8 flex justify-center gap-3" aria-label="Event pages">{page > 1 ? <button type="button" onClick={() => onPage(page - 1)} className="rounded-full border border-white/15 px-5 py-2 font-black">Previous</button> : null}<span className="px-3 py-2 text-sm font-bold text-slate-400">Page {page} of {totalPages}</span>{page < totalPages ? <button type="button" onClick={() => onPage(page + 1)} className="rounded-full border border-white/15 px-5 py-2 font-black">Next</button> : null}</nav> : null}
        </section>
      </div>
    </main>
  );
}
