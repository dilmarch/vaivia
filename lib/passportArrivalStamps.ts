import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedDateTimeToUtc } from "@/lib/timezoneDuration";

type SupabaseLike = Pick<SupabaseClient, "from">;

type TransportationArrivalStampInput = {
    supabase: SupabaseLike;
    userId: string;
    tripId: string;
    transportationItemId: string;
    title: string;
    departureLocation?: string | null;
    arrivalLocation?: string | null;
    arrivalDate?: string | null;
    arrivalTime?: string | null;
    arrivalTimezone?: string | null;
};

type CountrySnapshot = {
    code: string;
    name: string;
    flag: string;
    welcomeLabel?: string | null;
    arrivalLabel?: string | null;
    capital?: string | null;
};

function getFlagEmoji(countryCode?: string | null) {
    const normalized = countryCode?.trim().toUpperCase();
    if (!normalized || !/^[A-Z]{2}$/.test(normalized)) return "";

    return normalized
        .split("")
        .map((letter) => String.fromCodePoint(letter.charCodeAt(0) + 127397))
        .join("");
}

function getAirportCodeCandidate(value?: string | null) {
    const normalized = String(value || "").toUpperCase();
    const parentheticalMatch = normalized.match(/\(([A-Z0-9]{3,4})\)/);
    if (parentheticalMatch?.[1]) return parentheticalMatch[1];

    const codeMatch = normalized.match(/\b[A-Z]{3,4}\b/);
    return codeMatch?.[0] || "";
}

function escapeLike(value: string) {
    return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function getMissingColumnName(error: { message?: string; details?: string }) {
    const text = `${error.message || ""} ${error.details || ""}`;
    return (
        text.match(/'([^']+)' column/)?.[1] ||
        text.match(/column "([^"]+)"/)?.[1] ||
        ""
    );
}

function getArrivalInstant({
    arrivalDate,
    arrivalTime,
    arrivalTimezone,
}: Pick<
    TransportationArrivalStampInput,
    "arrivalDate" | "arrivalTime" | "arrivalTimezone"
>) {
    if (!arrivalDate || !arrivalTime || !arrivalTimezone) return null;

    try {
        return zonedDateTimeToUtc(arrivalDate, arrivalTime, arrivalTimezone);
    } catch {
        return null;
    }
}

function normalizeBucketMatchText(value?: string | null) {
    return String(value || "")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .trim()
        .toLowerCase();
}

function bucketItemMatchesArrival(
    item: {
        city?: string | null;
        region?: string | null;
        place_label?: string | null;
    },
    arrivalText: string
) {
    const city = normalizeBucketMatchText(item.city);
    const region = normalizeBucketMatchText(item.region);
    const label = normalizeBucketMatchText(item.place_label);

    if (city) return arrivalText.includes(city);
    if (region) return arrivalText.includes(region);
    if (label) return arrivalText.includes(label);
    return true;
}

async function getTripDestinationText(supabase: SupabaseLike, tripId: string) {
    const { data, error } = await supabase
        .from("trips")
        .select("title,destination")
        .eq("id", tripId)
        .maybeSingle();

    if (error) return "";
    return [data?.title, data?.destination].filter(Boolean).join(" ");
}

async function maybeCompleteTravelBucketListItems({
    supabase,
    userId,
    tripId,
    transportationItemId,
    arrivalCountry,
    arrivalLocation,
    completedAt,
}: {
    supabase: SupabaseLike;
    userId: string;
    tripId: string;
    transportationItemId: string;
    arrivalCountry: CountrySnapshot;
    arrivalLocation?: string | null;
    completedAt: string;
}) {
    const { data, error } = await (supabase.from as any)("user_travel_bucket_list")
        .select("id,city,region,country_code,place_label")
        .eq("user_id", userId)
        .eq("status", "in_progress")
        .eq("country_code", arrivalCountry.code);

    if (error) {
        if (error.code !== "42P01" && error.code !== "PGRST205") {
            console.warn("Could not load travel bucket list for completion:", {
                message: error.message,
                code: error.code,
                details: error.details,
                tripId,
                transportationItemId,
                userId,
            });
        }
        return;
    }

    const tripDestinationText = await getTripDestinationText(supabase, tripId);
    const arrivalText = normalizeBucketMatchText(
        [
            arrivalLocation,
            arrivalCountry.name,
            arrivalCountry.code,
            tripDestinationText,
        ]
            .filter(Boolean)
            .join(" ")
    );
    const matchingIds = ((data || []) as Array<{
        id?: string | null;
        city?: string | null;
        region?: string | null;
        country_code?: string | null;
        place_label?: string | null;
    }>)
        .filter((item) => bucketItemMatchesArrival(item, arrivalText))
        .map((item) => item.id)
        .filter((id): id is string => Boolean(id));

    if (matchingIds.length === 0) return;

    const { error: updateError } = await (supabase.from as any)(
        "user_travel_bucket_list"
    )
        .update({
            status: "completed",
            completed_at: completedAt,
            completed_trip_id: tripId,
            completed_transportation_item_id: transportationItemId,
            updated_at: completedAt,
        })
        .eq("user_id", userId)
        .in("id", matchingIds);

    if (updateError) {
        console.warn("Could not complete travel bucket list items:", {
            message: updateError.message,
            code: updateError.code,
            details: updateError.details,
            tripId,
            transportationItemId,
            userId,
            matchingIds,
        });
    }
}

async function resolveAirportCountry(
    supabase: SupabaseLike,
    location: string
): Promise<CountrySnapshot | null> {
    const codeCandidate = getAirportCodeCandidate(location);
    const selectColumns =
        "id,ident,name,iata_code,gps_code,municipality,iso_country";

    if (codeCandidate) {
        const { data } = await supabase
            .from("airports")
            .select(selectColumns)
            .or(
                `iata_code.eq.${codeCandidate},gps_code.eq.${codeCandidate},ident.eq.${codeCandidate}`
            )
            .limit(1)
            .maybeSingle();

        if (data?.iso_country) {
            return resolveCountryByCode(supabase, data.iso_country);
        }
    }

    const cleanedLocation = location.trim();
    if (!cleanedLocation) return null;

    const { data } = await supabase
        .from("airports")
        .select(selectColumns)
        .ilike("name", `%${escapeLike(cleanedLocation)}%`)
        .order("scheduled_service", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (data?.iso_country) {
        return resolveCountryByCode(supabase, data.iso_country);
    }

    return null;
}

async function resolveCountryByCode(
    supabase: SupabaseLike,
    countryCode: string
): Promise<CountrySnapshot | null> {
    const normalized = countryCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalized)) return null;

    const { data } = await supabase
        .from("countries")
        .select("alpha2,common_name,flag_emoji,welcome_label,arrival_label,capital")
        .eq("alpha2", normalized)
        .maybeSingle();

    if (!data) {
        return {
            code: normalized,
            name: normalized,
            flag: getFlagEmoji(normalized),
        };
    }

    return {
        code: String(data.alpha2 || normalized).toUpperCase(),
        name: data.common_name || normalized,
        flag: data.flag_emoji || getFlagEmoji(normalized),
        welcomeLabel: data.welcome_label || null,
        arrivalLabel: data.arrival_label || null,
        capital: data.capital || null,
    };
}

async function resolveCountryFromLocation(
    supabase: SupabaseLike,
    location?: string | null
) {
    const normalizedLocation = String(location || "").trim();
    if (!normalizedLocation) return null;

    const airportCountry = await resolveAirportCountry(supabase, normalizedLocation);
    if (airportCountry) return airportCountry;

    const { data } = await supabase
        .from("countries")
        .select("alpha2,common_name,flag_emoji,welcome_label,arrival_label,capital");

    const countries = (data || []) as Array<{
        alpha2?: string | null;
        common_name?: string | null;
        flag_emoji?: string | null;
        welcome_label?: string | null;
        arrival_label?: string | null;
        capital?: string | null;
    }>;
    const match = countries.find((country) => {
        const countryName = country.common_name?.trim();
        return countryName
            ? normalizedLocation.toLowerCase().includes(countryName.toLowerCase())
            : false;
    });

    if (!match?.alpha2) return null;

    return {
        code: String(match.alpha2).toUpperCase(),
        name: match.common_name || String(match.alpha2).toUpperCase(),
        flag: match.flag_emoji || getFlagEmoji(match.alpha2),
        welcomeLabel: match.welcome_label || null,
        arrivalLabel: match.arrival_label || null,
        capital: match.capital || null,
    };
}

export async function maybeCreatePassportStampForTransportationArrival({
    supabase,
    userId,
    tripId,
    transportationItemId,
    title,
    departureLocation,
    arrivalLocation,
    arrivalDate,
    arrivalTime,
    arrivalTimezone,
}: TransportationArrivalStampInput) {
    if (!userId || !tripId || !transportationItemId) return;

    const [departureCountry, arrivalCountry] = await Promise.all([
        resolveCountryFromLocation(supabase, departureLocation),
        resolveCountryFromLocation(supabase, arrivalLocation),
    ]);

    if (!departureCountry || !arrivalCountry) return;
    if (departureCountry.code === arrivalCountry.code) return;

    const arrivalInstant = getArrivalInstant({
        arrivalDate,
        arrivalTime,
        arrivalTimezone,
    });
    const now = new Date().toISOString();
    const completedAt = arrivalInstant?.toISOString() || now;
    const hasArrived =
        !arrivalInstant || arrivalInstant.getTime() <= new Date().getTime();

    if (hasArrived) {
        await maybeCompleteTravelBucketListItems({
            supabase,
            userId,
            tripId,
            transportationItemId,
            arrivalCountry,
            arrivalLocation,
            completedAt,
        });
    }

    const { data: existingStamp } = await supabase
        .from("user_passport_stamps")
        .select("id")
        .eq("user_id", userId)
        .eq("source_transportation_item_id", transportationItemId)
        .maybeSingle();

    if (existingStamp?.id) return;

    const firstVisitedOn = arrivalDate || null;

    let stampPayload: Record<string, unknown> = {
        user_id: userId,
        country_code: arrivalCountry.code,
        country_name: arrivalCountry.name,
        flag_emoji: arrivalCountry.flag,
        source: "auto",
        first_visited_on: firstVisitedOn,
        stamped_at: completedAt,
        source_trip_id: tripId,
        source_transportation_item_id: transportationItemId,
        source_arrival_at: arrivalInstant?.toISOString() || null,
        source_departure_country_code: departureCountry.code,
        source_arrival_country_code: arrivalCountry.code,
        first_entry_city: arrivalCountry.capital || null,
        welcome_label_snapshot:
            arrivalCountry.welcomeLabel || arrivalCountry.arrivalLabel || null,
        arrival_label_snapshot: arrivalCountry.arrivalLabel || null,
        stamp_display_country_name: arrivalCountry.name,
        stamp_display_flag: arrivalCountry.flag,
        updated_at: now,
    };
    let stamp: { id?: string } | null = null;
    let stampError:
        | { code?: string; message?: string; details?: string; hint?: string }
        | null = null;

    for (let index = 0; index < 8; index += 1) {
        const result = await supabase
            .from("user_passport_stamps")
            .insert(stampPayload)
            .select("id")
            .maybeSingle();

        stamp = result.data;
        stampError = result.error;

        if (!stampError) break;
        if (stampError.code !== "42703" && stampError.code !== "PGRST204") break;

        const missingColumn = getMissingColumnName(stampError);
        if (!missingColumn || !(missingColumn in stampPayload)) break;

        const { [missingColumn]: _removedColumn, ...nextPayload } = stampPayload;
        void _removedColumn;
        stampPayload = nextPayload;
    }

    if (stampError || !stamp?.id) {
        console.warn("Could not create automatic passport stamp:", {
            message: stampError?.message,
            code: stampError?.code,
            details: stampError?.details,
            tripId,
            transportationItemId,
            userId,
            arrivalCountry: arrivalCountry.code,
        });
        return;
    }

    const notificationPayload = {
        user_id: userId,
        type: "passport_stamp_added",
        title: "Passport stamp added",
        body: `${arrivalCountry.flag} ${arrivalCountry.name} was added to your VAIVIA passport.`,
        trip_id: tripId,
        actor_user_id: userId,
        metadata: {
            countryCode: arrivalCountry.code,
            countryName: arrivalCountry.name,
            flag: arrivalCountry.flag,
            source: "transportation_arrival",
            transportationItemId,
            passportStampId: stamp.id,
            arrivalAt: arrivalInstant?.toISOString() || null,
            transportationTitle: title,
        },
    };

    const { error: notificationError } = await supabase
        .from("notifications")
        .insert(notificationPayload);

    if (notificationError) {
        console.warn("Could not create passport stamp notification:", {
            message: notificationError.message,
            code: notificationError.code,
            details: notificationError.details,
            tripId,
            transportationItemId,
            userId,
            arrivalCountry: arrivalCountry.code,
        });
    }
}
