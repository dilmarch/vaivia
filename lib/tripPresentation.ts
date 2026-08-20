export const TRIP_ACCENT_COLORS = [
  "var(--vaivia-neon-soft-solid)",
  "#7c3cff",
  "#ff3ca6",
  "#ff7a1a",
  "#00d5ff",
  "#4157ff",
] as const;

function parsePlainDate(value?: string | null) {
  if (!value) return null;

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

export function getTripAccentColor(index: number) {
  return TRIP_ACCENT_COLORS[Math.max(index, 0) % TRIP_ACCENT_COLORS.length];
}

export function getTripDurationDays(
  startDate?: string | null,
  endDate?: string | null,
) {
  const start = parsePlainDate(startDate);
  const end = parsePlainDate(endDate || startDate);

  if (!start || !end) return 0;

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / millisecondsPerDay) + 1,
  );
}
