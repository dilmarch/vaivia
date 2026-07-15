import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type RestCountry = {
    cca2?: string;
    cca3?: string;
    alpha2Code?: string;
    alpha3Code?: string;
    iso2?: string;
    iso3?: string;
    name?:
        | string
        | {
              common?: string;
              official?: string;
          };
    commonName?: string;
    officialName?: string;
    flag?: string;
    flagEmoji?: string;
    emoji?: string;
    flags?: {
        svg?: string;
        png?: string;
    };
    flagUrl?: string;
    flag_url?: string;
    flagSvgUrl?: string;
    flagPngUrl?: string;
    flag_svg_url?: string;
    flag_png_url?: string;
    region?: string;
    subregion?: string;
    capital?: string[];
    capitalInfo?: {
        latlng?: [number, number];
    };
    languages?: Record<string, string>;
    currencies?:
        | Record<
              string,
              {
                  name?: string;
                  symbol?: string;
              }
          >
        | Array<{
              code?: string;
              name?: string;
              symbol?: string;
          }>;
};

type RestCountriesResponse =
    | RestCountry[]
    | {
          data?: RestCountry[];
          countries?: RestCountry[];
          results?: RestCountry[];
          errors?: Array<{ message?: string }>;
          message?: string;
      };

type NormalizedCurrencyMap = Record<
    string,
    {
        name?: string;
        symbol?: string;
    }
>;

type CountryUpsertRow = {
    alpha2: string;
    alpha3: string | null;
    common_name: string;
    official_name: string | null;
    flag_emoji: string | null;
    flag_svg_url: string | null;
    flag_png_url: string | null;
    region: string | null;
    subregion: string | null;
    currencies: NormalizedCurrencyMap;
    rest_countries_payload: RestCountry;
    primary_language_code: string | null;
    primary_language_name: string | null;
    languages: Record<string, string> | null;
    capital: string | null;
    capital_lat: number | null;
    capital_lng: number | null;
    welcome_label: string;
    welcome_label_source: string;
    arrival_label: string | null;
    arrival_label_source: string;
    source: "rest_countries";
    fetched_at: string;
    updated_at: string;
};

const DEFAULT_REST_COUNTRIES_URL = "https://api.restcountries.com/countries/v5";

export const WELCOME_LABEL_BY_LANGUAGE: Record<string, string> = {
    eng: "WELCOME",
    fra: "BIENVENUE",
    spa: "BIENVENIDO",
    ita: "BENVENUTO",
    por: "BEM-VINDO",
    deu: "WILLKOMMEN",
    nld: "WELKOM",
    jpn: "ようこそ",
    kor: "환영합니다",
    zho: "欢迎",
    ara: "أهلاً وسهلاً",
    ell: "ΚΑΛΩΣ ΗΡΘΑΤΕ",
    tur: "HOŞ GELDİNİZ",
    tha: "ยินดีต้อนรับ",
    vie: "CHÀO MỪNG",
    ind: "SELAMAT DATANG",
    bul: "ДОБРЕ ДОШЛИ",
    hrv: "DOBRODOŠLI",
    hun: "ÜDVÖZÖLJÜK",
};

const WELCOME_LABEL_BY_COUNTRY: Record<string, string> = {
    BE: "WELKOM",
    BG: "ДОБРЕ ДОШЛИ",
    BR: "BEM-VINDO",
    CA: "WELCOME",
    CN: "欢迎",
    CU: "BIENVENIDO",
    DE: "WILLKOMMEN",
    ES: "BIENVENIDO",
    FR: "BIENVENUE",
    GB: "WELCOME",
    GR: "ΚΑΛΩΣ ΗΡΘΑΤΕ",
    GT: "BIENVENIDO",
    HK: "歡迎",
    HR: "DOBRODOŠLI",
    HU: "ÜDVÖZÖLJÜK",
    ID: "SELAMAT DATANG",
    IT: "BENVENUTO",
    JP: "ようこそ",
    KR: "환영합니다",
    MX: "BIENVENIDO",
    NL: "WELKOM",
    PE: "BIENVENIDO",
    PT: "BEM-VINDO",
    TH: "ยินดีต้อนรับ",
    TR: "HOŞ GELDİNİZ",
    TW: "歡迎",
    US: "WELCOME",
    VN: "CHÀO MỪNG",
};

function getRestCountriesUrl() {
    return (
        process.env.REST_COUNTRIES_API_URL?.trim() || DEFAULT_REST_COUNTRIES_URL
    );
}

function getRestCountriesHeaders() {
    const headers: Record<string, string> = {
        accept: "application/json",
    };
    const apiKey = process.env.REST_COUNTRIES_API_KEY?.trim();
    const apiKeyHeader =
        process.env.REST_COUNTRIES_API_KEY_HEADER?.trim() || "Authorization";

    if (apiKey) {
        headers[apiKeyHeader] =
            apiKeyHeader.toLowerCase() === "authorization"
                ? `Bearer ${apiKey}`
                : apiKey;
    }

    return headers;
}

function getStringCandidate(...values: unknown[]) {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }

    return "";
}

function getCountryNameFields(record: RestCountry) {
    if (record.name && typeof record.name === "object") {
        return {
            common: getStringCandidate(record.name.common, record.commonName),
            official: getStringCandidate(
                record.name.official,
                record.officialName
            ),
        };
    }

    return {
        common: getStringCandidate(record.name, record.commonName),
        official: getStringCandidate(record.officialName),
    };
}

function normalizeCurrencies(
    currencies: RestCountry["currencies"]
): NormalizedCurrencyMap {
    if (!currencies) return {};

    if (Array.isArray(currencies)) {
        return currencies.reduce<NormalizedCurrencyMap>((result, currency) => {
            const code = currency.code?.trim().toUpperCase();
            if (!code) return result;
            result[code] = {
                name: currency.name?.trim() || undefined,
                symbol: currency.symbol?.trim() || undefined,
            };
            return result;
        }, {});
    }

    return Object.entries(currencies).reduce<NormalizedCurrencyMap>(
        (result, [code, currency]) => {
            const normalizedCode = code.trim().toUpperCase();
            if (!normalizedCode) return result;
            result[normalizedCode] = {
                name: currency.name?.trim() || undefined,
                symbol: currency.symbol?.trim() || undefined,
            };
            return result;
        },
        {}
    );
}

function getPrimaryLanguage(record: RestCountry) {
    const entries = Object.entries(record.languages || {});
    const [code, name] = entries[0] || [];

    return {
        code: code || null,
        name: name || null,
        languages: entries.length > 0 ? record.languages || null : null,
    };
}

type WelcomeLabelMap = Record<string, string>;

export function getWelcomeLabelForCountry(
    countryCode?: string | null,
    primaryLanguageCode?: string | null,
    welcomeLabelsByLanguage: WelcomeLabelMap = {}
) {
    const normalizedCountryCode = countryCode?.trim().toUpperCase();
    const normalizedLanguageCode = primaryLanguageCode?.trim().toLowerCase();

    if (normalizedCountryCode && WELCOME_LABEL_BY_COUNTRY[normalizedCountryCode]) {
        return {
            label: WELCOME_LABEL_BY_COUNTRY[normalizedCountryCode],
            source: "country",
        };
    }

    if (normalizedLanguageCode && welcomeLabelsByLanguage[normalizedLanguageCode]) {
        return {
            label: welcomeLabelsByLanguage[normalizedLanguageCode],
            source: "language_curated",
        };
    }

    if (normalizedLanguageCode && WELCOME_LABEL_BY_LANGUAGE[normalizedLanguageCode]) {
        return {
            label: WELCOME_LABEL_BY_LANGUAGE[normalizedLanguageCode],
            source: "language_fallback",
        };
    }

    return {
        label: "WELCOME",
        source: "english_fallback",
    };
}

function unwrapCountries(payload: RestCountriesResponse) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.countries)) return payload.countries;
    if (Array.isArray(payload.results)) return payload.results;

    const errorMessage =
        payload.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
        payload.message ||
        "REST Countries returned an unsupported response shape.";

    throw new Error(
        `${errorMessage} Configure REST_COUNTRIES_API_URL and REST_COUNTRIES_API_KEY for the current REST Countries API.`
    );
}

function normalizeCountry(
    record: RestCountry,
    fetchedAt: string,
    welcomeLabelsByLanguage: WelcomeLabelMap = {}
): CountryUpsertRow | null {
    const alpha2 = getStringCandidate(
        record.cca2,
        record.alpha2Code,
        record.iso2
    ).toUpperCase();
    const alpha3 = getStringCandidate(
        record.cca3,
        record.alpha3Code,
        record.iso3
    ).toUpperCase();
    const { common, official } = getCountryNameFields(record);
    const primaryLanguage = getPrimaryLanguage(record);
    const welcomeLabel = getWelcomeLabelForCountry(
        alpha2,
        primaryLanguage.code,
        welcomeLabelsByLanguage
    );
    const capitalLatLng = record.capitalInfo?.latlng || [];

    if (!/^[A-Z]{2}$/.test(alpha2) || !common) return null;

    return {
        alpha2,
        alpha3: /^[A-Z]{3}$/.test(alpha3) ? alpha3 : null,
        common_name: common,
        official_name: official || null,
        flag_emoji:
            getStringCandidate(record.flag, record.flagEmoji, record.emoji) ||
            null,
        flag_svg_url:
            getStringCandidate(
                record.flags?.svg,
                record.flagSvgUrl,
                record.flag_svg_url
            ) || null,
        flag_png_url:
            getStringCandidate(
                record.flags?.png,
                record.flagPngUrl,
                record.flag_png_url,
                record.flagUrl,
                record.flag_url
            ) || null,
        region: record.region?.trim() || null,
        subregion: record.subregion?.trim() || null,
        currencies: normalizeCurrencies(record.currencies),
        rest_countries_payload: record,
        primary_language_code: primaryLanguage.code,
        primary_language_name: primaryLanguage.name,
        languages: primaryLanguage.languages,
        capital: record.capital?.[0]?.trim() || null,
        capital_lat:
            typeof capitalLatLng[0] === "number" ? capitalLatLng[0] : null,
        capital_lng:
            typeof capitalLatLng[1] === "number" ? capitalLatLng[1] : null,
        welcome_label: welcomeLabel.label,
        welcome_label_source: welcomeLabel.source,
        arrival_label: null,
        arrival_label_source: "legacy_unused",
        source: "rest_countries" as const,
        fetched_at: fetchedAt,
        updated_at: fetchedAt,
    };
}

export async function fetchCountriesFromRestCountries(
    welcomeLabelsByLanguage: WelcomeLabelMap = {}
) {
    const response = await fetch(getRestCountriesUrl(), {
        headers: getRestCountriesHeaders(),
        next: { revalidate: 60 * 60 * 24 },
    });

    if (!response.ok) {
        const authHint =
            response.status === 401 || response.status === 403
                ? " Add REST_COUNTRIES_API_KEY and, if needed, REST_COUNTRIES_API_KEY_HEADER."
                : "";
        throw new Error(
            `REST Countries request failed: ${response.status}.${authHint}`
        );
    }

    const fetchedAt = new Date().toISOString();
    const records = unwrapCountries(
        (await response.json()) as RestCountriesResponse
    );

    return records
        .map((record) =>
            normalizeCountry(record, fetchedAt, welcomeLabelsByLanguage)
        )
        .filter((record): record is CountryUpsertRow => Boolean(record))
        .sort((a, b) => a.common_name.localeCompare(b.common_name));
}

export async function syncCountriesFromRestCountries(supabase: SupabaseClient) {
    const { data: welcomeRows, error: welcomeError } = await supabase
        .from("language_welcome_labels")
        .select("language_code,welcome_label");

    if (welcomeError) {
        throw new Error(
            `Could not load language welcome labels: ${welcomeError.message}`
        );
    }

    const welcomeLabelsByLanguage = (welcomeRows || []).reduce<WelcomeLabelMap>(
        (labels, row) => {
            const languageCode = String(row.language_code || "")
                .trim()
                .toLowerCase();
            const welcomeLabel = String(row.welcome_label || "").trim();
            if (languageCode && welcomeLabel) labels[languageCode] = welcomeLabel;
            return labels;
        },
        {}
    );
    const countries = await fetchCountriesFromRestCountries(
        welcomeLabelsByLanguage
    );

    if (countries.length === 0) {
        throw new Error("REST Countries returned no usable countries.");
    }

    const { error } = await supabase
        .from("countries")
        .upsert(countries, { onConflict: "alpha2" });

    if (error) {
        throw new Error(`Could not sync countries: ${error.message}`);
    }

    return {
        count: countries.length,
        fetchedAt: countries[0]?.fetched_at || new Date().toISOString(),
    };
}
