function parsePlainDate(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;

    const date = new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3])
    );
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatLocalDateKey(date: Date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");
}

export function isTripVisibleOnDashboard(
    tripEndDate: string | null | undefined,
    todayKey: string
) {
    if (!tripEndDate) return true;
    const endDate = parsePlainDate(tripEndDate);
    if (!endDate) return true;

    const removalDate = new Date(endDate);
    removalDate.setDate(removalDate.getDate() + 5);
    return todayKey < formatLocalDateKey(removalDate);
}
