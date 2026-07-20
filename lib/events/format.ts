export function formatEventDateTime(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone || "UTC",
    }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  }
}

export function formatEventMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency || "CAD",
  }).format(amountMinor / 100);
}

export function eventLocationLabel(event: {
  venue_type?: string | null;
  venue_name?: string | null;
  city?: string | null;
  region?: string | null;
}) {
  if (event.venue_type === "online") return "Online";
  return (
    event.venue_name ||
    [event.city, event.region].filter(Boolean).join(", ") ||
    "Location coming soon"
  );
}

export function slugifyEventTitle(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
