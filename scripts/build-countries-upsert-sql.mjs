import fs from "node:fs";

const outputPath = process.argv[2] || "/private/tmp/vaivia_countries_upsert.sql";
const url =
    process.env.REST_COUNTRIES_API_URL ||
    "https://api.restcountries.com/countries/v5";

const WELCOME_LABEL_BY_LANGUAGE = {
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
};

const WELCOME_LABEL_BY_COUNTRY = {
    BR: "BEM-VINDO",
    CA: "WELCOME",
    CN: "欢迎",
    DE: "WILLKOMMEN",
    ES: "BIENVENIDO",
    FR: "BIENVENUE",
    GB: "WELCOME",
    GR: "ΚΑΛΩΣ ΗΡΘΑΤΕ",
    IT: "BENVENUTO",
    JP: "ようこそ",
    KR: "환영합니다",
    MX: "BIENVENIDO",
    NL: "WELKOM",
    PT: "BEM-VINDO",
    TH: "ยินดีต้อนรับ",
    TR: "HOŞ GELDİNİZ",
    US: "WELCOME",
    VN: "CHÀO MỪNG",
};

function getHeaders() {
    const headers = { accept: "application/json" };
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

function sqlString(value) {
    return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function sqlNullable(value) {
    return value ? sqlString(value) : "null";
}

function getStringCandidate(...values) {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) return value.trim();
    }

    return "";
}

function getNameFields(row) {
    if (row.name && typeof row.name === "object") {
        return {
            common: getStringCandidate(row.name.common, row.commonName),
            official: getStringCandidate(row.name.official, row.officialName),
        };
    }

    return {
        common: getStringCandidate(row.name, row.commonName),
        official: getStringCandidate(row.officialName),
    };
}

function normalizeCurrencies(currencies) {
    if (!currencies) return {};
    if (Array.isArray(currencies)) {
        return currencies.reduce((result, currency) => {
            const code = currency.code?.trim().toUpperCase();
            if (!code) return result;
            result[code] = {
                name: currency.name?.trim() || undefined,
                symbol: currency.symbol?.trim() || undefined,
            };
            return result;
        }, {});
    }

    return Object.entries(currencies).reduce((result, [code, currency]) => {
        const normalizedCode = code.trim().toUpperCase();
        if (!normalizedCode) return result;
        result[normalizedCode] = {
            name: currency.name?.trim() || undefined,
            symbol: currency.symbol?.trim() || undefined,
        };
        return result;
    }, {});
}

function getPrimaryLanguage(row) {
    const entries = Object.entries(row.languages || {});
    const [code, name] = entries[0] || [];
    return {
        code: code || null,
        name: name || null,
        languages: entries.length > 0 ? row.languages || null : null,
    };
}

function getWelcomeLabel(countryCode, languageCode) {
    if (WELCOME_LABEL_BY_COUNTRY[countryCode]) {
        return {
            label: WELCOME_LABEL_BY_COUNTRY[countryCode],
            source: "country",
        };
    }

    if (languageCode && WELCOME_LABEL_BY_LANGUAGE[languageCode]) {
        return {
            label: WELCOME_LABEL_BY_LANGUAGE[languageCode],
            source: "language_fallback",
        };
    }

    return {
        label: "WELCOME",
        source: "english_fallback",
    };
}

function unwrapCountries(payload) {
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

const response = await fetch(url, {
    headers: getHeaders(),
});

if (!response.ok) {
    const authHint =
        response.status === 401 || response.status === 403
            ? " Add REST_COUNTRIES_API_KEY and, if needed, REST_COUNTRIES_API_KEY_HEADER."
            : "";
    throw new Error(`REST Countries request failed: ${response.status}.${authHint}`);
}

const rows = unwrapCountries(await response.json());
const now = new Date().toISOString();
const values = rows
    .map((row) => {
        const alpha2 = getStringCandidate(
            row.cca2,
            row.alpha2Code,
            row.iso2
        ).toUpperCase();
        const alpha3 = getStringCandidate(
            row.cca3,
            row.alpha3Code,
            row.iso3
        ).toUpperCase();
        const { common, official } = getNameFields(row);
        const primaryLanguage = getPrimaryLanguage(row);
        const welcomeLabel = getWelcomeLabel(alpha2, primaryLanguage.code);
        const capitalLatLng = row.capitalInfo?.latlng || [];

        if (!/^[A-Z]{2}$/.test(alpha2) || !common) return null;

        const flagEmoji = getStringCandidate(row.flag, row.flagEmoji, row.emoji);
        const flagSvgUrl = getStringCandidate(
            row.flags?.svg,
            row.flagSvgUrl,
            row.flag_svg_url
        );
        const flagPngUrl = getStringCandidate(
            row.flags?.png,
            row.flagPngUrl,
            row.flag_png_url,
            row.flagUrl,
            row.flag_url
        );

        return `(${[
            sqlString(alpha2),
            /^[A-Z]{3}$/.test(alpha3) ? sqlString(alpha3) : "null",
            sqlString(common),
            sqlNullable(official),
            sqlNullable(flagEmoji),
            sqlNullable(flagSvgUrl),
            sqlNullable(flagPngUrl),
            sqlNullable(row.region?.trim()),
            sqlNullable(row.subregion?.trim()),
            `${sqlString(JSON.stringify(normalizeCurrencies(row.currencies)))}::jsonb`,
            `${sqlString(JSON.stringify(row))}::jsonb`,
            sqlNullable(primaryLanguage.code),
            sqlNullable(primaryLanguage.name),
            primaryLanguage.languages
                ? `${sqlString(JSON.stringify(primaryLanguage.languages))}::jsonb`
                : "null",
            sqlNullable(row.capital?.[0]?.trim()),
            typeof capitalLatLng[0] === "number" ? String(capitalLatLng[0]) : "null",
            typeof capitalLatLng[1] === "number" ? String(capitalLatLng[1]) : "null",
            sqlString(welcomeLabel.label),
            sqlString(welcomeLabel.source),
            "null",
            sqlString("legacy_unused"),
            sqlString("rest_countries"),
            sqlString(now),
            sqlString(now),
        ].join(", ")})`;
    })
    .filter(Boolean);

const sql = `insert into public.countries (
  alpha2,
  alpha3,
  common_name,
  official_name,
  flag_emoji,
  flag_svg_url,
  flag_png_url,
  region,
  subregion,
  currencies,
  rest_countries_payload,
  primary_language_code,
  primary_language_name,
  languages,
  capital,
  capital_lat,
  capital_lng,
  welcome_label,
  welcome_label_source,
  arrival_label,
  arrival_label_source,
  source,
  fetched_at,
  updated_at
) values
${values.join(",\n")}
on conflict (alpha2) do update set
  alpha3 = excluded.alpha3,
  common_name = excluded.common_name,
  official_name = excluded.official_name,
  flag_emoji = excluded.flag_emoji,
  flag_svg_url = excluded.flag_svg_url,
  flag_png_url = excluded.flag_png_url,
  region = excluded.region,
  subregion = excluded.subregion,
  currencies = excluded.currencies,
  rest_countries_payload = excluded.rest_countries_payload,
  primary_language_code = excluded.primary_language_code,
  primary_language_name = excluded.primary_language_name,
  languages = excluded.languages,
  capital = excluded.capital,
  capital_lat = excluded.capital_lat,
  capital_lng = excluded.capital_lng,
  welcome_label = excluded.welcome_label,
  welcome_label_source = excluded.welcome_label_source,
  arrival_label = excluded.arrival_label,
  arrival_label_source = excluded.arrival_label_source,
  source = excluded.source,
  fetched_at = excluded.fetched_at,
  updated_at = excluded.updated_at;
`;

fs.writeFileSync(outputPath, sql);
console.log(`Wrote ${values.length} countries to ${outputPath}`);
