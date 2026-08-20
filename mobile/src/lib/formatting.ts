function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function formatMobileDate(value?: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "Date to be confirmed";
  const date = parseDateOnly(value);
  if (!date) return value;

  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
    ...options,
  }).format(date);
}

export function formatMobileDateRange(
  startDate?: string | null,
  endDate?: string | null,
) {
  if (!startDate && !endDate) return "Dates to be confirmed";
  if (!endDate || startDate === endDate) return formatMobileDate(startDate || endDate);
  return `${formatMobileDate(startDate)} – ${formatMobileDate(endDate)}`;
}

export function formatMobileTime(value?: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const date = new Date(Date.UTC(2020, 0, 1, hours, minutes));
  return new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}
