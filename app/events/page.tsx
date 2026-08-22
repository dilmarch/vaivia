import type { Metadata } from "next";
import { EventsPageClient } from "@/components/events/EventsPageClient";
import { listAttendeeEvents } from "@/lib/events/attendee";

export const metadata: Metadata = {
  title: "Events – VAIVIA",
  description: "Discover curated Dream Haus and VAIVIA events.",
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const value = (name: string) =>
    typeof params[name] === "string" ? (params[name] as string) : "";
  const result = await listAttendeeEvents({
    query: value("q"),
    category: value("category"),
    city: value("city"),
    price:
      value("price") === "free" || value("price") === "paid"
        ? (value("price") as "free" | "paid")
        : undefined,
    from: value("from") || undefined,
    to: value("to") || undefined,
    page: Number(value("page")) || 1,
  });
  const totalPages = Math.max(1, Math.ceil(result.count / result.pageSize));

  return (
    <EventsPageClient
      initialValues={{ q: value("q"), city: value("city"), category: value("category"), from: value("from"), to: value("to"), price: value("price") }}
      events={result.events}
      page={result.page}
      totalPages={totalPages}
    />
  );
}
