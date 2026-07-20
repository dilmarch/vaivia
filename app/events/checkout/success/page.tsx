import Link from "next/link";
import { requireEventUser } from "@/lib/events/auth";

export const dynamic = "force-dynamic";

export default async function EventCheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  const auth = await requireEventUser(
    `/events/checkout/success?order=${encodeURIComponent(order || "")}`,
  );
  const { data } = order
    ? await auth.supabase
        .from("event_orders")
        .select("status")
        .eq("id", order)
        .eq("user_id", auth.user.id)
        .maybeSingle()
    : { data: null };
  const ready = data && ["paid", "free"].includes(data.status);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0c0115] px-4 text-white">
      <section className="max-w-lg rounded-[2.5rem] border border-white/10 bg-[#080511] p-8 text-center">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
          Stripe checkout
        </p>
        <h1 className="mt-3 text-3xl font-black">
          {ready ? "Your tickets are ready" : "We’re confirming your payment"}
        </h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">
          {ready
            ? "VAIVIA received server confirmation and issued your tickets."
            : "This page never marks an order paid on its own. Refresh in a moment while the verified Stripe webhook completes."}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/my-events"
            className="rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950"
          >
            My Events
          </Link>
          {!ready ? (
            <Link
              href={`/events/checkout/success?order=${encodeURIComponent(order || "")}`}
              className="rounded-full border border-white/15 px-5 py-3 text-sm font-black"
            >
              Refresh status
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
