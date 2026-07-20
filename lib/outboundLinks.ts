const VAIVIA_UTM_SOURCE = "vaivia";
const VAIVIA_UTM_MEDIUM = "referral";

export function addVaiviaUtmAttribution(value?: string | null) {
    const input = value?.trim() || "";
    if (!input) return "";

    try {
        const url = new URL(input);
        if (url.protocol !== "http:" && url.protocol !== "https:") return input;

        const utmKeys = Array.from(url.searchParams.keys()).filter((key) =>
            key.toLowerCase().startsWith("utm_")
        );
        if (utmKeys.length === 0) return input;

        utmKeys.forEach((key) => {
            const normalizedKey = key.toLowerCase();
            if (
                key !== normalizedKey &&
                (normalizedKey === "utm_source" || normalizedKey === "utm_medium")
            ) {
                url.searchParams.delete(key);
            }
        });
        url.searchParams.set("utm_source", VAIVIA_UTM_SOURCE);
        url.searchParams.set("utm_medium", VAIVIA_UTM_MEDIUM);

        return url.toString();
    } catch {
        return input;
    }
}
