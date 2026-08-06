function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function text(value: unknown, maximum: number) {
    return typeof value === "string"
        ? value.replace(/\s+/g, " ").trim().slice(0, maximum)
        : "";
}

export function getAffectedWeatherPlanIds(metadata: unknown) {
    const values = record(metadata)?.affectedItineraryItemIds;
    return Array.isArray(values)
        ? values
              .filter(
                  (value): value is string =>
                      typeof value === "string" &&
                      /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)
              )
              .slice(0, 20)
        : [];
}

export function buildWeatherAssistantPrompt({
    metadata,
    affectedPlanLabels,
}: {
    metadata: unknown;
    affectedPlanLabels: string[];
}) {
    const value = record(metadata) || {};
    const kind =
        text(value.weatherAlertKind, 30) === "official"
            ? "Official weather alert"
            : "VAIVIA forecast-derived travel warning";
    const lines = [
        "Review my saved plans using this system-provided weather context:",
        `- Alert type: ${kind}`,
        `- Severity: ${text(value.severity, 30) || "Unknown"}`,
        `- Event: ${text(value.eventType, 100) || "Adverse weather"}`,
        `- Location: ${text(value.locationLabel, 180) || "Trip area"}`,
        `- Window: ${text(value.eventWindowLabel, 240) || "Within the next 48 hours"}`,
        `- Details: ${text(value.description, 700) || "No additional details supplied"}`,
    ];
    if (affectedPlanLabels.length > 0) {
        lines.push(
            `- Potentially affected saved plans: ${affectedPlanLabels
                .map((label) => text(label, 100))
                .filter(Boolean)
                .slice(0, 10)
                .join("; ")}`
        );
    }
    lines.push(
        "Explain likely travel impacts and suggest practical alternatives. Do not change anything automatically; use VAIVIA's proposal and confirmation workflow for any suggested edits."
    );
    return lines.join("\n").slice(0, 3_800);
}
