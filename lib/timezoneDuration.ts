function getTimezoneOffsetMinutes(timezone: string, date: Date) {
    const utcOffsetMatch = timezone.match(/^UTC([+-])(\d{2}):?(\d{2})$/i);
    if (utcOffsetMatch) {
        const [, sign, hours, minutes] = utcOffsetMatch;
        const offsetMinutes = Number(hours) * 60 + Number(minutes);
        return sign === "-" ? -offsetMinutes : offsetMinutes;
    }

    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).formatToParts(date);

    const values = Object.fromEntries(
        parts
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value])
    );

    const localizedDateAsUtc = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
        Number(values.hour) % 24,
        Number(values.minute),
        Number(values.second)
    );

    return Math.round((localizedDateAsUtc - date.getTime()) / 60000);
}

export function zonedDateTimeToUtc(
    dateKey: string,
    timeString: string,
    timezone: string
) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const [hours, minutes] = timeString.split(":").map(Number);
    let utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));

    for (let index = 0; index < 2; index += 1) {
        const offsetMinutes = getTimezoneOffsetMinutes(timezone, utcDate);
        utcDate = new Date(
            Date.UTC(year, month - 1, day, hours, minutes) - offsetMinutes * 60000
        );
    }

    return utcDate;
}

export function formatDurationLabelFromMinutes(minutes: number) {
    if (!Number.isFinite(minutes) || minutes <= 0) return "";

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes.toString().padStart(2, "0")}m`;
}

export function getZonedDurationLabel({
    startDate,
    startTime,
    startTimezone,
    endDate,
    endTime,
    endTimezone,
}: {
    startDate: string;
    startTime: string;
    startTimezone: string;
    endDate: string;
    endTime: string;
    endTimezone: string;
}) {
    if (
        !startDate ||
        !startTime ||
        !startTimezone ||
        !endDate ||
        !endTime ||
        !endTimezone
    ) {
        return "";
    }

    try {
        const start = zonedDateTimeToUtc(startDate, startTime, startTimezone);
        const end = zonedDateTimeToUtc(endDate, endTime, endTimezone);
        const minutes = Math.round((end.getTime() - start.getTime()) / 60000);

        return formatDurationLabelFromMinutes(minutes);
    } catch {
        return "";
    }
}
