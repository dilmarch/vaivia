import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const OUR_AIRPORTS_URL =
    process.env.OURAIRPORTS_AIRPORTS_CSV_URL ||
    "https://davidmegginson.github.io/ourairports-data/airports.csv";

type AirportUpsertRow = {
    ident: string;
    type: string | null;
    name: string;
    latitude_deg: number | null;
    longitude_deg: number | null;
    elevation_ft: number | null;
    continent: string | null;
    iso_country: string | null;
    iso_region: string | null;
    municipality: string | null;
    scheduled_service: boolean | null;
    gps_code: string | null;
    iata_code: string | null;
    local_code: string | null;
    home_link: string | null;
    wikipedia_link: string | null;
    keywords: string | null;
    source: "ourairports";
    updated_at: string;
};

function parseCsvLine(line: string) {
    const values: string[] = [];
    let value = "";
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        const nextCharacter = line[index + 1];

        if (character === '"' && quoted && nextCharacter === '"') {
            value += '"';
            index += 1;
            continue;
        }

        if (character === '"') {
            quoted = !quoted;
            continue;
        }

        if (character === "," && !quoted) {
            values.push(value);
            value = "";
            continue;
        }

        value += character;
    }

    values.push(value);
    return values;
}

function nullableString(value?: string) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

function nullableNumber(value?: string) {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : null;
}

function normalizeAirport(
    row: Record<string, string>,
    updatedAt: string
): AirportUpsertRow | null {
    const ident = row.ident?.trim();
    const name = row.name?.trim();
    if (!ident || !name) return null;

    return {
        ident,
        type: nullableString(row.type),
        name,
        latitude_deg: nullableNumber(row.latitude_deg),
        longitude_deg: nullableNumber(row.longitude_deg),
        elevation_ft: nullableNumber(row.elevation_ft),
        continent: nullableString(row.continent),
        iso_country: nullableString(row.iso_country)?.toUpperCase() || null,
        iso_region: nullableString(row.iso_region),
        municipality: nullableString(row.municipality),
        scheduled_service: row.scheduled_service
            ? row.scheduled_service.trim().toLowerCase() === "yes"
            : null,
        gps_code: nullableString(row.gps_code),
        iata_code: nullableString(row.iata_code)?.toUpperCase() || null,
        local_code: nullableString(row.local_code),
        home_link: nullableString(row.home_link),
        wikipedia_link: nullableString(row.wikipedia_link),
        keywords: nullableString(row.keywords),
        source: "ourairports",
        updated_at: updatedAt,
    };
}

export async function fetchAirportsFromOurAirports() {
    const response = await fetch(OUR_AIRPORTS_URL, {
        headers: { accept: "text/csv,text/plain,*/*" },
        next: { revalidate: 60 * 60 * 24 * 7 },
    });

    if (!response.ok) {
        throw new Error(`OurAirports request failed: ${response.status}`);
    }

    const csv = await response.text();
    const [headerLine, ...lines] = csv.split(/\r?\n/).filter(Boolean);
    const headers = parseCsvLine(headerLine);
    const updatedAt = new Date().toISOString();

    return lines
        .map((line) => {
            const values = parseCsvLine(line);
            const row = headers.reduce<Record<string, string>>((result, header, index) => {
                result[header] = values[index] || "";
                return result;
            }, {});

            return normalizeAirport(row, updatedAt);
        })
        .filter((airport): airport is AirportUpsertRow => Boolean(airport));
}

export async function syncAirportsFromOurAirports(supabase: SupabaseClient) {
    const airports = await fetchAirportsFromOurAirports();
    const batchSize = 500;

    for (let index = 0; index < airports.length; index += batchSize) {
        const batch = airports.slice(index, index + batchSize);
        const { error } = await supabase
            .from("airports")
            .upsert(batch, { onConflict: "ident" });

        if (error) {
            throw new Error(`Could not sync airports: ${error.message}`);
        }
    }

    return {
        count: airports.length,
        fetchedAt: airports[0]?.updated_at || new Date().toISOString(),
    };
}
