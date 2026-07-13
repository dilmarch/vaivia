"use client";

export default function AdminStatsError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-[calc(6.25rem+var(--safe-area-top))] text-white md:pb-10 md:pl-28 md:pr-8 md:pt-28">
            <div className="mx-auto max-w-3xl rounded-[2rem] border border-red-300/20 bg-red-950/30 p-6 shadow-2xl shadow-black/35">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-red-200">
                    Stats unavailable
                </p>
                <h1 className="mt-3 text-3xl font-black">Could not load stats</h1>
                <p className="mt-3 text-sm font-semibold leading-6 text-red-100/80">
                    {error.message || "The stats request failed."}
                </p>
                <button
                    type="button"
                    onClick={reset}
                    className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950 transition hover:bg-lime-200"
                >
                    Try again
                </button>
            </div>
        </main>
    );
}
