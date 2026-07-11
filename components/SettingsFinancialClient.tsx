"use client";

import { useEffect, useMemo, useState } from "react";

export type SettingsCurrencyOption = {
    code: string;
    name: string;
    symbol: string | null;
};

const REGION_CURRENCY_MAP: Record<string, string> = {
    AU: "AUD",
    BR: "BRL",
    CA: "CAD",
    CH: "CHF",
    DE: "EUR",
    ES: "EUR",
    FR: "EUR",
    GB: "GBP",
    IE: "EUR",
    IT: "EUR",
    JP: "JPY",
    KR: "KRW",
    MX: "MXN",
    NL: "EUR",
    NZ: "NZD",
    PT: "EUR",
    TH: "THB",
    TW: "TWD",
    US: "USD",
    VN: "VND",
};

function inferCurrencyFromBrowser() {
    if (typeof navigator === "undefined") return "";

    const locale = navigator.languages?.[0] || navigator.language || "";
    const region =
        new Intl.Locale(locale).region ||
        locale.split("-").find((part) => /^[A-Z]{2}$/i.test(part));

    return region ? REGION_CURRENCY_MAP[region.toUpperCase()] || "" : "";
}

export default function SettingsFinancialClient({
    currentCurrency,
    currencyOptions,
    updateAction,
}: {
    currentCurrency: string | null;
    currencyOptions: SettingsCurrencyOption[];
    updateAction: (formData: FormData) => Promise<void>;
}) {
    const [currency, setCurrency] = useState(currentCurrency || "");
    const optionsByCode = useMemo(
        () =>
            new Map(
                currencyOptions.map((option) => [option.code, option])
            ),
        [currencyOptions]
    );

    useEffect(() => {
        if (currency) return;
        const inferredCurrency = inferCurrencyFromBrowser();
        if (inferredCurrency && optionsByCode.has(inferredCurrency)) {
            setCurrency(inferredCurrency);
        }
    }, [currency, optionsByCode]);

    const selectedCurrency = optionsByCode.get(currency);

    return (
        <form action={updateAction} className="space-y-5">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20">
                <label
                    htmlFor="home_currency"
                    className="text-sm font-black uppercase tracking-[0.18em] text-lime-200/90"
                >
                    Default currency
                </label>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                    This is your home/reporting currency for budgets and expense
                    conversions. Expense records still keep the original amount and
                    original currency.
                </p>
                <select
                    id="home_currency"
                    name="home_currency"
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
                    className="mt-4 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-bold text-white shadow-inner shadow-black/30 outline-none transition focus:border-lime-300/60 focus:ring-2 focus:ring-lime-300/20"
                    required
                >
                    <option value="" className="bg-slate-950 text-white">
                        Choose a currency
                    </option>
                    {currencyOptions.map((option) => (
                        <option
                            key={option.code}
                            value={option.code}
                            className="bg-slate-950 text-white"
                        >
                            {option.code} - {option.name}
                            {option.symbol ? ` (${option.symbol})` : ""}
                        </option>
                    ))}
                </select>
                {selectedCurrency ? (
                    <p className="mt-3 text-xs font-semibold text-slate-400">
                        Selected:{" "}
                        <span className="font-black text-white">
                            {selectedCurrency.code}
                        </span>{" "}
                        {selectedCurrency.name}
                    </p>
                ) : (
                    <p className="mt-3 text-xs font-semibold text-slate-500">
                        If you have not saved a preference yet, VAIVIA will suggest
                        one from your browser region.
                    </p>
                )}
            </div>

            <div className="flex justify-end">
                <button
                    type="submit"
                    className="rounded-full bg-lime-300 px-6 py-3 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:bg-lime-200"
                >
                    Save financial settings
                </button>
            </div>
        </form>
    );
}
