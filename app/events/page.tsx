import type { Metadata } from "next";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import { EventCard } from "@/components/events/EventCard";
import { listPublicEvents } from "@/lib/events/data";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { formatEventMoney } from "@/lib/events/format";

export const metadata: Metadata = {
  title: "Events – VAIVIA",
  description: "Discover curated Dream Haus and VAIVIA events.",
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const value = (name: string) =>
    typeof params[name] === "string" ? (params[name] as string) : "";
  const result = await listPublicEvents({
    query: value("q"),
    category: value("category"),
    city: value("city"),
    price:
      value("price") === "free" || value("price") === "paid"
        ? (value("price") as "free" | "paid")
        : undefined,
    from: value("from") || undefined,
    to: value("to") || undefined,
    page: Number(value("page")) || 1,
  });
  const ids = result.events.map((event) => event.id);
  const { data: tiers } = ids.length
    ? await createServiceRoleClient()
        .from("event_ticket_types")
        .select("event_id,price_minor,currency")
        .in("event_id", ids)
        .eq("state", "active")
        .order("price_minor")
    : { data: [] };
  const prices = new Map<string, { amount: number; currency: string }>();
  for (const tier of tiers || [])
    if (!prices.has(tier.event_id))
      prices.set(tier.event_id, {
        amount: tier.price_minor,
        currency: tier.currency,
      });
  const totalPages = Math.max(1, Math.ceil(result.count / result.pageSize));

  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-[calc(6.5rem+var(--safe-area-top))] text-white md:pl-32 md:pr-8 md:pt-24">
      <div className="mx-auto max-w-7xl">
        <header className="overflow-hidden rounded-[2.5rem] border border-white/10 bg-[radial-gradient(circle_at_10%_0%,rgba(var(--vaivia-neon-rgb),0.2),transparent_35%),linear-gradient(135deg,#160724,#05030a)] p-7 shadow-2xl shadow-black/40 sm:p-10">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.32em] text-lime-300">
            <Sparkles className="h-4 w-4" />
            VAIVIA Events
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">
            Good plans deserve a guest list.
          </h1>
          <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-slate-300">
            Discover gatherings, nights out, workshops, and experiences operated
            by Dream Haus and VAIVIA.
          </p>
          <form className="mt-7 grid gap-3 rounded-[1.75rem] border border-white/10 bg-black/20 p-4 md:grid-cols-8">
            <label className="relative md:col-span-2">
              <span className="sr-only">Search events</span>
              <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
              <input
                name="q"
                defaultValue={value("q")}
                placeholder="Search events"
                className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/80 pl-11 pr-3 text-sm font-bold text-white outline-none focus:border-lime-300/50"
              />
            </label>
            <input
              name="city"
              defaultValue={value("city")}
              placeholder="City"
              className="h-11 rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm font-bold text-white outline-none focus:border-lime-300/50"
            />
            <input
              name="category"
              defaultValue={value("category")}
              placeholder="Category"
              className="h-11 rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm font-bold text-white outline-none focus:border-lime-300/50"
            />
            <label>
              <span className="sr-only">Events from</span>
              <input
                name="from"
                type="date"
                defaultValue={value("from")}
                className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm font-bold text-white outline-none focus:border-lime-300/50"
              />
            </label>
            <label>
              <span className="sr-only">Events through</span>
              <input
                name="to"
                type="date"
                defaultValue={value("to")}
                className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm font-bold text-white outline-none focus:border-lime-300/50"
              />
            </label>
            <select
              name="price"
              defaultValue={value("price")}
              className="h-11 rounded-xl border border-white/10 bg-slate-950/80 px-3 text-sm font-bold text-white"
            >
              <option value="">Any price</option>
              <option value="free">Free</option>
              <option value="paid">Paid</option>
            </select>
            <button className="h-11 rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950 hover:bg-lime-200">
              Find events
            </button>
          </form>
        </header>
        <section className="mt-9">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
                Featured & upcoming
              </p>
              <h2 className="mt-2 text-3xl font-black">What’s happening</h2>
            </div>
            <Link
              href="/my-events"
              className="text-sm font-black text-lime-200 hover:text-lime-100"
            >
              My Events →
            </Link>
          </div>
          {result.events.length ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {result.events.map((event) => {
                const price = prices.get(event.id);
                const priceLabel =
                  event.registration_mode === "rsvp"
                    ? "RSVP"
                    : !price || price.amount === 0
                      ? "Free"
                      : `From ${formatEventMoney(price.amount, price.currency)}`;
                return (
                  <EventCard
                    key={event.id}
                    event={event}
                    priceLabel={priceLabel}
                  />
                );
              })}
            </div>
          ) : (
            <div className="rounded-[2rem] border border-dashed border-white/15 bg-white/[0.04] p-10 text-center">
              <h2 className="text-2xl font-black">
                No events match those filters
              </h2>
              <p className="mt-2 text-sm font-semibold text-slate-400">
                Try a broader search or clear a filter.
              </p>
              <Link
                href="/events"
                className="mt-5 inline-flex rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950"
              >
                Clear filters
              </Link>
            </div>
          )}
          {totalPages > 1 ? (
            <nav
              className="mt-8 flex justify-center gap-3"
              aria-label="Event pages"
            >
              {result.page > 1 ? (
                <Link
                  href={`/events?page=${result.page - 1}`}
                  className="rounded-full border border-white/15 px-5 py-2 font-black"
                >
                  Previous
                </Link>
              ) : null}
              <span className="px-3 py-2 text-sm font-bold text-slate-400">
                Page {result.page} of {totalPages}
              </span>
              {result.page < totalPages ? (
                <Link
                  href={`/events?page=${result.page + 1}`}
                  className="rounded-full border border-white/15 px-5 py-2 font-black"
                >
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  );
}
