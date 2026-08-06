import { AlertTriangle, ExternalLink } from "lucide-react";

function metadataString(
    metadata: Record<string, unknown> | null | undefined,
    key: string
) {
    const value = metadata?.[key];
    return typeof value === "string" ? value : "";
}

function safeAuthorityUrl(value: string) {
    if (!value) return "";
    try {
        const url = new URL(value);
        return url.protocol === "https:" ? url.toString() : "";
    } catch {
        return "";
    }
}

export default function WeatherAlertNotificationDetails({
    metadata,
}: {
    metadata: Record<string, unknown> | null | undefined;
}) {
    const kind = metadataString(metadata, "weatherAlertKind");
    const severity = metadataString(metadata, "severity");
    const location = metadataString(metadata, "locationLabel");
    const eventWindow = metadataString(metadata, "eventWindowLabel");
    const sourceName = metadataString(metadata, "sourceName");
    const sourceUrl = safeAuthorityUrl(
        metadataString(metadata, "sourceAuthorityUrl")
    );
    const disclaimer =
        metadataString(metadata, "disclaimer") ||
        "VAIVIA weather notifications may be delayed or unavailable and do not replace official emergency alerts or local authority guidance.";

    return (
        <div className="mt-3 space-y-3 rounded-2xl border border-sky-300/15 bg-sky-300/[0.05] p-3 text-xs font-semibold leading-5 text-slate-300">
            <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-amber-200/25 bg-amber-200/10 px-2.5 py-1 font-black uppercase tracking-[0.1em] text-amber-100">
                    {severity || "Weather"}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 font-black text-slate-200">
                    {kind === "official"
                        ? "Official weather alert"
                        : "VAIVIA forecast-derived warning"}
                </span>
            </div>
            {location || eventWindow ? (
                <p>
                    {[location, eventWindow].filter(Boolean).join(" · ")}
                </p>
            ) : null}
            {sourceName ? (
                <p>
                    Issued by{" "}
                    {sourceUrl ? (
                        <a
                            href={sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-black text-sky-200 underline decoration-sky-200/40 underline-offset-2"
                        >
                            {sourceName}
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                    ) : (
                        <span className="font-black text-slate-200">
                            {sourceName}
                        </span>
                    )}
                </p>
            ) : null}
            <p className="flex items-start gap-2 text-amber-100/90">
                <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                />
                <span>{disclaimer}</span>
            </p>
            <div className="flex flex-wrap justify-between gap-2 border-t border-white/10 pt-2 text-[10px] font-bold text-slate-400">
                <span className="font-black text-slate-300">Google Maps</span>
                <span>Source: Includes weather data from Google</span>
            </div>
        </div>
    );
}
