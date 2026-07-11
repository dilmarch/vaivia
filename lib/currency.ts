import * as currencyCodes from "currency-codes";
import getSymbolFromCurrency from "currency-symbol-map";

export type CurrencyMetadata = {
    code: string;
    name: string;
    symbol: string | null;
    digits: number;
    countries: string[];
};

const DEFAULT_CURRENCY_CODE = "CAD";

const PREFERRED_CURRENCY_CODES = [
    "CAD",
    "USD",
    "EUR",
    "GBP",
    "JPY",
    "KRW",
    "VND",
    "TWD",
    "AUD",
    "NZD",
    "CHF",
    "MXN",
    "BRL",
    "THB",
] as const;

export function isIsoCurrencyCode(value?: string | null) {
    const code = String(value || "")
        .trim()
        .toUpperCase();
    return Boolean(code && currencyCodes.code(code));
}

export function normalizeCurrencyCode(
    value?: FormDataEntryValue | string | null,
    fallback = DEFAULT_CURRENCY_CODE
) {
    const code = String(value || "")
        .trim()
        .toUpperCase();

    if (isIsoCurrencyCode(code)) return code;
    return isIsoCurrencyCode(fallback) ? fallback.toUpperCase() : DEFAULT_CURRENCY_CODE;
}

export function getCurrencyMetadata(
    value?: FormDataEntryValue | string | null
): CurrencyMetadata | null {
    const code = normalizeCurrencyCode(value, "");
    const record = currencyCodes.code(code);
    if (!record) return null;

    return {
        code: record.code,
        name: record.currency,
        symbol: getSymbolFromCurrency(record.code) || null,
        digits: record.digits,
        countries: record.countries,
    };
}

export const COMMON_CURRENCY_OPTIONS = PREFERRED_CURRENCY_CODES.map((code) =>
    getCurrencyMetadata(code)
).filter((currency): currency is CurrencyMetadata => Boolean(currency));

export const COMMON_CURRENCY_CODES = COMMON_CURRENCY_OPTIONS.map(
    (currency) => currency.code
);

export const ALL_CURRENCY_OPTIONS = currencyCodes
    .codes()
    .map((code) => getCurrencyMetadata(code))
    .filter((currency): currency is CurrencyMetadata => Boolean(currency))
    .sort((a, b) => a.code.localeCompare(b.code));

export function formatMoney(amount: number, currency = DEFAULT_CURRENCY_CODE) {
    const code = normalizeCurrencyCode(currency);
    return new Intl.NumberFormat("en", {
        style: "currency",
        currency: code,
        maximumFractionDigits: getCurrencyMetadata(code)?.digits ?? 2,
    }).format(amount || 0);
}
