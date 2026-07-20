const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function addDaysToDateKey(dateKey: string, days: number) {
  if (!ISO_DATE_PATTERN.test(dateKey)) return "";

  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getValidEndDate(startDate: string, endDate: string) {
  if (!startDate || !ISO_DATE_PATTERN.test(startDate)) return endDate;
  if (endDate && !ISO_DATE_PATTERN.test(endDate)) return endDate;
  if (endDate && endDate >= startDate) return endDate;
  return addDaysToDateKey(startDate, 1);
}

export function isDateRangeOrdered(startDate: string, endDate: string) {
  return !startDate || !endDate || endDate >= startDate;
}

export function assertDateRangeOrdered(
  startDate: string,
  endDate: string,
  message = "End date cannot be before start date.",
) {
  if (!isDateRangeOrdered(startDate, endDate)) {
    throw new Error(message);
  }
}
