import Link from "next/link";
import { redirect } from "next/navigation";
import {
  TravelImportsPresentation,
  type TravelImportPresentationItem,
} from "@/components/imports/TravelImportsPresentation";
import { createClient } from "@/lib/supabase/server";
import { loadTravelImportInbox } from "@/lib/travel-imports/domain";
import { getImportItemRouteLabel } from "@/lib/travelEmailImports";

export default async function ImportsInboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  let data;
  try {
    data = await loadTravelImportInbox(supabase, user.id);
  } catch (error) {
    console.error("Could not load travel imports:", {
      userId: user.id,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw new Error("Could not load travel imports");
  }

  const ids = data.imports.map((item) => item.id);
  const items = ids.length
    ? await supabase
        .from("travel_email_import_items")
        .select("import_id,extracted_data,item_order")
        .in("import_id", ids)
        .order("item_order")
    : { data: [], error: null };
  if (items.error) throw new Error("Could not load travel import items");
  const firstByImport = new Map<string, (typeof items.data)[number]>();
  for (const item of items.data || []) {
    if (!firstByImport.has(item.import_id))
      firstByImport.set(item.import_id, item);
  }

  const matchedTripIds = data.imports
    .map((item) =>
      typeof item.matched_trip_id === "string" ? item.matched_trip_id : "",
    )
    .filter(Boolean);
  const trips = matchedTripIds.length
    ? await supabase
        .from("trips")
        .select("id,slug,title")
        .in("id", matchedTripIds)
    : { data: [], error: null };
  if (trips.error) throw new Error("Could not load imported trips");
  const tripById = new Map((trips.data || []).map((trip) => [trip.id, trip]));

  const imports: TravelImportPresentationItem[] = data.imports.map((item) => {
    const first = firstByImport.get(item.id);
    const matched =
      typeof item.matched_trip_id === "string"
        ? tripById.get(item.matched_trip_id)
        : null;
    return {
      id: item.id,
      createdAt: String(item.created_at),
      subject:
        typeof item.subject === "string"
          ? item.subject
          : "Forwarded confirmation",
      senderEmail:
        typeof item.sender_email === "string"
          ? item.sender_email
          : "Unknown sender",
      status: String(item.status),
      importType:
        typeof item.import_type === "string"
          ? item.import_type.replaceAll("_", " ")
          : "Unknown",
      confidence:
        typeof item.extraction_confidence === "number"
          ? item.extraction_confidence
          : null,
      itemCount: Number(item.itemCount || 0),
      firstItemLabel: first
        ? getImportItemRouteLabel(first.extracted_data)
        : undefined,
      matchedTripTitle: matched?.title || null,
    };
  });

  return (
    <TravelImportsPresentation
      imports={imports}
      renderSettingsAction={(props) => (
        <Link href="/settings?section=communications" {...props} />
      )}
      renderImportAction={(item, props) => {
        const source = data.imports.find(
          (candidate) => candidate.id === item.id,
        );
        const matched =
          source && typeof source.matched_trip_id === "string"
            ? tripById.get(source.matched_trip_id)
            : null;
        return (
          <Link
            href={
              item.status === "imported" && matched
                ? `/trips/${matched.slug || matched.id}?tab=journey`
                : `/imports/${item.id}`
            }
            {...props}
          />
        );
      }}
    />
  );
}
