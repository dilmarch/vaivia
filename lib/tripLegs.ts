type SupabaseQueryError = {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
};

type SupabaseSingleResult<T> = {
    data: T | null;
    error: SupabaseQueryError | null;
};

type SupabaseListResult<T> = {
    data: T[] | null;
    error: SupabaseQueryError | null;
};

type SupabaseQueryBuilder<T> = PromiseLike<SupabaseListResult<T>> & {
    select: (columns: string) => SupabaseQueryBuilder<T>;
    eq: (column: string, value: string) => SupabaseQueryBuilder<T>;
    lte: (column: string, value: string) => SupabaseQueryBuilder<T>;
    or: (filters: string) => SupabaseQueryBuilder<T>;
    order: (
        column: string,
        options?: { ascending?: boolean; nullsFirst?: boolean }
    ) => SupabaseQueryBuilder<T>;
    limit: (count: number) => SupabaseQueryBuilder<T>;
    maybeSingle: () => Promise<SupabaseSingleResult<T>>;
};

type SupabaseLike = {
    from: (table: string) => unknown;
};

function normalizeText(value?: string | null) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

export async function resolveTripLegIdForDate({
    supabase,
    tripId,
    explicitTripLegId,
    itemDate,
}: {
    supabase: SupabaseLike;
    tripId: string;
    explicitTripLegId?: string | null;
    itemDate?: string | null;
}) {
    const normalizedExplicit = explicitTripLegId?.trim();
    if (normalizedExplicit) return normalizedExplicit;
    if (!tripId || !itemDate) return null;

    const query = supabase.from("trip_legs") as SupabaseQueryBuilder<{
        id: string | null;
    }>;
    const { data, error } = await query
        .select("id")
        .eq("trip_id", tripId)
        .lte("start_date", itemDate)
        .or(`end_date.gte.${itemDate},end_date.is.null`)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.warn("Could not resolve trip leg for dated item:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
            itemDate,
        });
        return null;
    }

    return typeof data?.id === "string" ? data.id : null;
}

export async function resolveTripLegIdForLocation({
    supabase,
    tripId,
    explicitTripLegId,
    city,
    region,
    country,
    countryCode,
    itemDate,
}: {
    supabase: SupabaseLike;
    tripId: string;
    explicitTripLegId?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    countryCode?: string | null;
    itemDate?: string | null;
}) {
    const normalizedExplicit = explicitTripLegId?.trim();
    if (normalizedExplicit) return normalizedExplicit;
    if (!tripId) return null;

    const dateMatchedLegId = await resolveTripLegIdForDate({
        supabase,
        tripId,
        itemDate,
    });
    if (dateMatchedLegId) return dateMatchedLegId;

    const query = supabase.from("trip_legs") as SupabaseQueryBuilder<{
        id: string | null;
        name: string | null;
        city_name: string | null;
        country_code: string | null;
        start_date: string | null;
    }>;
    const { data, error } = await query
        .select("id,name,city_name,country_code,start_date")
        .eq("trip_id", tripId)
        .order("start_date", { ascending: true, nullsFirst: false });

    if (error) {
        console.warn("Could not resolve trip leg for location:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
            city,
            region,
            country,
            countryCode,
        });
        return null;
    }

    const normalizedCity = normalizeText(city);
    const normalizedRegion = normalizeText(region);
    const normalizedCountry = normalizeText(country);
    const normalizedCountryCode = normalizeText(countryCode).toUpperCase();

    const matchedLeg = (data || []).find((leg: Record<string, unknown>) => {
        const legName = normalizeText(String(leg.name || ""));
        const legCity = normalizeText(String(leg.city_name || ""));
        const legCountryCode = String(leg.country_code || "")
            .trim()
            .toUpperCase();

        return (
            Boolean(normalizedCity && (legCity === normalizedCity || legName === normalizedCity)) ||
            Boolean(normalizedRegion && legName === normalizedRegion) ||
            Boolean(normalizedCountry && legName === normalizedCountry) ||
            Boolean(normalizedCountryCode && legCountryCode === normalizedCountryCode)
        );
    });

    return typeof matchedLeg?.id === "string" ? matchedLeg.id : null;
}
