import { ArrowDownUp, Banknote } from "lucide-react";

import type { TripExchangeRateData } from "@/lib/tripExchangeRates";

function formatRate(value: number) {
    const absoluteValue = Math.abs(value);
    const maximumFractionDigits =
        absoluteValue >= 1_000 ? 2 : absoluteValue >= 1 ? 4 : 6;

    return new Intl.NumberFormat("en", {
        minimumFractionDigits: 2,
        maximumFractionDigits,
    }).format(value);
}

export default function MobileExchangeRatesWidget({
    data,
}: {
    data: TripExchangeRateData;
}) {
    return (
        <section
            aria-labelledby="mobile-exchange-rates-title"
            className="rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-4 text-white shadow-xl shadow-black/15"
        >
            <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-lime-300/25 bg-lime-300/10 text-lime-200">
                        <Banknote className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-300">
                            Current exchange rates
                        </p>
                        <h2
                            id="mobile-exchange-rates-title"
                            className="mt-0.5 text-sm font-black text-white"
                        >
                            Your {data.baseCurrency} travel cheat sheet
                        </h2>
                    </div>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-black text-slate-200">
                    Base {data.baseCurrency}
                </span>
            </div>

            {data.rates.length > 0 ? (
                <div className="mt-4 space-y-2.5">
                    {data.rates.map((rate) => {
                        const isAvailable =
                            rate.baseToDestinationRate !== null &&
                            rate.destinationToBaseRate !== null;

                        return (
                            <article
                                key={rate.currency}
                                className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-black text-slate-100">
                                            {rate.destinationLabels.join(" · ")}
                                        </p>
                                        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                            {rate.countryCodes.join(" · ")} · {rate.currency}
                                        </p>
                                    </div>
                                    <ArrowDownUp
                                        className="mt-0.5 h-4 w-4 shrink-0 text-lime-200"
                                        aria-hidden="true"
                                    />
                                </div>

                                {isAvailable ? (
                                    <div className="mt-2 grid gap-1 text-xs font-black text-white">
                                        <p>
                                            <span className="text-slate-400">1.00</span>{" "}
                                            {data.baseCurrency}{" "}
                                            <span className="text-lime-300">=</span>{" "}
                                            {formatRate(rate.baseToDestinationRate!)}{" "}
                                            {rate.currency}
                                        </p>
                                        <p>
                                            <span className="text-slate-400">1.00</span>{" "}
                                            {rate.currency}{" "}
                                            <span className="text-lime-300">=</span>{" "}
                                            {formatRate(rate.destinationToBaseRate!)}{" "}
                                            {data.baseCurrency}
                                        </p>
                                    </div>
                                ) : (
                                    <p className="mt-2 text-xs font-bold text-amber-200">
                                        Current rate unavailable
                                    </p>
                                )}
                            </article>
                        );
                    })}
                </div>
            ) : (
                <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-xs font-semibold leading-5 text-slate-300">
                    Add Google-validated trip destinations to see their local
                    currencies here.
                </p>
            )}

            <p className="mt-3 text-[10px] font-semibold leading-4 text-slate-400">
                Latest available reference rates. Your bank or card provider may use a
                different rate and add fees.
            </p>
        </section>
    );
}
