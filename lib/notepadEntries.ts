export type NotepadLocation = {
    key: string;
    tripLegId?: string | null;
    label: string;
    city?: string | null;
    country?: string | null;
    countryCode?: string | null;
    googlePlaceId?: string | null;
};

export function splitNotepadLines(value: string) {
    return value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

export function parseNotepadLocations(value: FormDataEntryValue | null) {
    if (typeof value !== "string") return [];

    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map((entry): NotepadLocation | null => {
                if (!entry || typeof entry !== "object") return null;
                const record = entry as Record<string, unknown>;
                const key = String(record.key || "").trim();
                const label = String(record.label || "").trim();
                if (!key || !label) return null;

                return {
                    key,
                    tripLegId: String(record.tripLegId || "").trim() || null,
                    label,
                    city: String(record.city || "").trim() || null,
                    country: String(record.country || "").trim() || null,
                    countryCode:
                        String(record.countryCode || "").trim().toUpperCase() || null,
                    googlePlaceId:
                        String(record.googlePlaceId || "").trim() || null,
                };
            })
            .filter((entry): entry is NotepadLocation => Boolean(entry));
    } catch {
        return [];
    }
}
