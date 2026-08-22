import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { processTravelEmailImport } from "@/lib/travelEmailImportProcessor";
import { isTravelImportReviewSchemaMissingError } from "@/lib/travelEmailImports";
import type { Database, Json } from "@/src/types/supabase";

type ImportClient = SupabaseClient<Database>;

export class TravelImportError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "TravelImportError";
  }
}

export type ImportTravelerSelection = {
  userIds: string[];
  familyMemberIds: string[];
  guestNames: string[];
};

export type SubmittedImportFlight = {
  item_id: string;
  include: boolean;
  match_action: "create" | "merge" | "separate";
  reviewed_data: Record<string, string>;
};

export type TravelImportInboxRow = Record<string, unknown> & {
  id: string;
  created_at?: string;
  extraction_confidence?: number | null;
  import_type?: string | null;
  matched_trip_id?: string | null;
  sender_email?: string | null;
  status?: string;
  subject?: string | null;
};

function uniqueStrings(value: unknown, maxLength = 120) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, maxLength))
        .filter(Boolean),
    ),
  );
}

export function normalizeTravelerSelection(
  value: unknown,
): ImportTravelerSelection {
  const row =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    userIds: uniqueStrings(row.userIds, 64),
    familyMemberIds: uniqueStrings(row.familyMemberIds, 64),
    guestNames: uniqueStrings(row.guestNames),
  };
}

async function requireOwnedImport(
  supabase: ImportClient,
  userId: string,
  importId: string,
) {
  const result = await supabase
    .from("travel_email_imports")
    .select("id,status,user_id,processed_at")
    .eq("id", importId)
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new TravelImportError(
      "Travel import was not found.",
      "not_found",
      404,
    );
  }
  return result.data;
}

export async function loadTravelImportInbox(
  supabase: ImportClient,
  userId: string,
) {
  const rich = await supabase
    .from("travel_email_imports")
    .select(
      "id,created_at,extraction_confidence,extraction_error,import_type,imported_at,matched_trip_id,sender_email,status,subject,processed_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const imports =
    rich.error && isTravelImportReviewSchemaMissingError(rich.error)
      ? await supabase
          .from("travel_email_imports")
          .select(
            "id,created_at,extraction_confidence,extraction_error,import_type,sender_email,status,subject,processed_at",
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
      : rich;
  if (imports.error) throw imports.error;
  const rows = (imports.data || []) as TravelImportInboxRow[];
  const ids = rows.map((row) => row.id);
  const items = ids.length
    ? await supabase
        .from("travel_email_import_items")
        .select("id,import_id,item_type,extracted_data")
        .in("import_id", ids)
    : { data: [], error: null };
  if (items.error) throw items.error;
  const counts = new Map<string, number>();
  for (const item of items.data || []) {
    counts.set(item.import_id, (counts.get(item.import_id) || 0) + 1);
  }
  return {
    imports: rows.map((row): TravelImportInboxRow & { itemCount: number } => ({
      ...row,
      itemCount: counts.get(row.id) || 0,
    })),
  };
}

export async function loadTravelImportReview(
  supabase: ImportClient,
  userId: string,
  importId: string,
) {
  await requireOwnedImport(supabase, userId, importId);
  // Review columns are deployed but not all are represented in the generated
  // client schema in this checkout.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rich = await (supabase.from as any)("travel_email_imports")
    .select(
      "id,attachment_count,created_at,extracted_data,extraction_confidence,extraction_error,extraction_model,import_type,processed_at,provider,recipient_email,requires_data_review,sender_email,status,subject,matched_trip_id,imported_at",
    )
    .eq("id", importId)
    .eq("user_id", userId)
    .maybeSingle();
  const importResult =
    rich.error && isTravelImportReviewSchemaMissingError(rich.error)
      ? await supabase
          .from("travel_email_imports")
          .select(
            "id,attachment_count,created_at,extracted_data,extraction_confidence,extraction_error,extraction_model,import_type,processed_at,provider,recipient_email,requires_data_review,sender_email,status,subject",
          )
          .eq("id", importId)
          .eq("user_id", userId)
          .maybeSingle()
      : rich;
  if (importResult.error || !importResult.data) {
    throw (
      importResult.error ||
      new TravelImportError("Travel import was not found.", "not_found", 404)
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const richItems = await (supabase.from as any)("travel_email_import_items")
    .select(
      "id,confidence,extracted_data,item_order,item_type,reviewed_data,imported_record_id,imported_at,is_excluded,matched_trip_id",
    )
    .eq("import_id", importId)
    .order("item_order", { ascending: true });
  const itemResult =
    richItems.error && isTravelImportReviewSchemaMissingError(richItems.error)
      ? await supabase
          .from("travel_email_import_items")
          .select("id,confidence,extracted_data,item_order,item_type")
          .eq("import_id", importId)
          .order("item_order", { ascending: true })
      : richItems;
  if (itemResult.error) throw itemResult.error;
  const [ownerTrips, memberships, family] = await Promise.all([
    supabase
      .from("trips")
      .select("id,slug,title,destination,start_date,end_date,user_id")
      .eq("user_id", userId)
      .is("archived_at", null),
    supabase
      .from("trip_members")
      .select("trip_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .is("left_at", null),
    supabase
      .from("user_family_members")
      .select("id,name,relationship")
      .eq("user_id", userId)
      .order("name"),
  ]);
  if (ownerTrips.error || memberships.error || family.error) {
    throw ownerTrips.error || memberships.error || family.error;
  }
  const memberTripIds = (memberships.data || []).map((row) => row.trip_id);
  const memberTrips = memberTripIds.length
    ? await supabase
        .from("trips")
        .select("id,slug,title,destination,start_date,end_date,user_id")
        .in("id", memberTripIds)
        .is("archived_at", null)
    : { data: [], error: null };
  if (memberTrips.error) throw memberTrips.error;
  const trips = Array.from(
    new Map(
      [...(ownerTrips.data || []), ...(memberTrips.data || [])].map((trip) => [
        trip.id,
        trip,
      ]),
    ).values(),
  );
  return {
    import: importResult.data,
    items: itemResult.data || [],
    trips,
    familyMembers: family.data || [],
  };
}

export async function retryTravelImport({
  supabase,
  userId,
  importId,
}: {
  supabase: ImportClient;
  userId: string;
  importId: string;
}) {
  const row = await requireOwnedImport(supabase, userId, importId);
  const processedAt = row.processed_at
    ? new Date(row.processed_at).getTime()
    : 0;
  const stale = processedAt > 0 && Date.now() - processedAt > 5 * 60_000;
  if (!(row.status === "failed" || (row.status === "processing" && stale))) {
    throw new TravelImportError(
      "This import cannot be retried right now.",
      "conflict",
      409,
    );
  }
  await processTravelEmailImport(importId);
  return { importId, retried: true };
}

export async function ignoreTravelImport({
  supabase,
  userId,
  importId,
}: {
  supabase: ImportClient;
  userId: string;
  importId: string;
}) {
  const row = await requireOwnedImport(supabase, userId, importId);
  if (row.status === "imported") {
    throw new TravelImportError(
      "Imported travel cannot be ignored.",
      "conflict",
      409,
    );
  }
  const service = createServiceRoleClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemUpdate = await (service.from as any)("travel_email_import_items")
    .update({ is_excluded: true })
    .eq("import_id", importId);
  if (
    itemUpdate.error &&
    !isTravelImportReviewSchemaMissingError(itemUpdate.error)
  ) {
    throw itemUpdate.error;
  }
  const update = await service
    .from("travel_email_imports")
    .update({ status: "rejected" })
    .eq("id", importId)
    .eq("user_id", userId);
  if (update.error) throw update.error;
  await service
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("type", [
      "travel_email_ready",
      "travel_email_needs_review",
      "travel_email_failed",
    ])
    .eq("metadata->>importId", importId);
  return { importId, ignored: true };
}

export async function validateImportTravelerSelection({
  supabase,
  userId,
  tripId,
  selection,
}: {
  supabase: ImportClient;
  userId: string;
  tripId: string;
  selection: ImportTravelerSelection;
}) {
  const selectedCount =
    selection.userIds.length +
    selection.familyMemberIds.length +
    selection.guestNames.length;
  if (selectedCount === 0 || selectedCount > 50) {
    throw new TravelImportError(
      "Select between 1 and 50 travelers.",
      "validation_error",
      422,
    );
  }
  const [trip, members, tripFamily, ownedFamily] = await Promise.all([
    supabase
      .from("trips")
      .select("id,user_id,archived_at")
      .eq("id", tripId)
      .maybeSingle(),
    supabase
      .from("trip_members")
      .select("user_id")
      .eq("trip_id", tripId)
      .eq("status", "active")
      .is("left_at", null),
    selection.familyMemberIds.length
      ? supabase
          .from("trip_family_members")
          .select("family_member_id")
          .eq("trip_id", tripId)
          .eq("status", "going")
          .in("family_member_id", selection.familyMemberIds)
      : Promise.resolve({ data: [], error: null }),
    selection.familyMemberIds.length
      ? supabase
          .from("user_family_members")
          .select("id")
          .eq("user_id", userId)
          .in("id", selection.familyMemberIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (trip.error || members.error || tripFamily.error || ownedFamily.error) {
    throw trip.error || members.error || tripFamily.error || ownedFamily.error;
  }
  if (!trip.data || trip.data.archived_at) {
    throw new TravelImportError("Select an active trip.", "not_found", 404);
  }
  const validUsers = new Set((members.data || []).map((row) => row.user_id));
  validUsers.add(trip.data.user_id);
  if (
    !validUsers.has(userId) ||
    selection.userIds.some((id) => !validUsers.has(id))
  ) {
    throw new TravelImportError(
      "One or more travelers are unavailable for this trip.",
      "forbidden",
      403,
    );
  }
  if (
    (tripFamily.data || []).length !== selection.familyMemberIds.length ||
    (ownedFamily.data || []).length !== selection.familyMemberIds.length
  ) {
    throw new TravelImportError(
      "One or more family travelers are unavailable for this trip.",
      "forbidden",
      403,
    );
  }
}

export async function saveImportedFlightTravelers({
  userId,
  tripId,
  transportationItemIds,
  selection,
}: {
  userId: string;
  tripId: string;
  transportationItemIds: string[];
  selection: ImportTravelerSelection;
}) {
  const itemIds = Array.from(new Set(transportationItemIds.filter(Boolean)));
  if (!itemIds.length) {
    throw new TravelImportError(
      "VAIVIA could not confirm the imported flights.",
      "import_not_verified",
      500,
    );
  }
  const service = createServiceRoleClient();
  const deleteTravelers = await service
    .from("transportation_item_travelers")
    .delete()
    .eq("trip_id", tripId)
    .in("transportation_item_id", itemIds);
  if (deleteTravelers.error) throw deleteTravelers.error;
  const rows = itemIds.flatMap((itemId) => [
    ...selection.userIds.map((id) => ({
      transportation_item_id: itemId,
      trip_id: tripId,
      user_id: id,
      created_by: userId,
    })),
    ...selection.familyMemberIds.map((id) => ({
      transportation_item_id: itemId,
      trip_id: tripId,
      family_member_id: id,
      created_by: userId,
    })),
    ...selection.guestNames.map((name) => ({
      transportation_item_id: itemId,
      trip_id: tripId,
      guest_name: name,
      created_by: userId,
    })),
  ]);
  const inserted = await service
    .from("transportation_item_travelers")
    .insert(rows);
  if (inserted.error) throw inserted.error;
  const deleteParticipants = await service
    .from("trip_item_participants")
    .delete()
    .eq("trip_id", tripId)
    .eq("item_type", "transportation")
    .in("item_id", itemIds);
  if (deleteParticipants.error) throw deleteParticipants.error;
  const participantRows = itemIds.flatMap((itemId) => [
    ...selection.userIds.map((id) => ({
      trip_id: tripId,
      item_type: "transportation",
      item_id: itemId,
      participant_kind: "user",
      user_id: id,
      created_by: userId,
    })),
    ...selection.familyMemberIds.map((id) => ({
      trip_id: tripId,
      item_type: "transportation",
      item_id: itemId,
      participant_kind: "family_member",
      family_member_id: id,
      created_by: userId,
    })),
    ...selection.guestNames.map((name) => ({
      trip_id: tripId,
      item_type: "transportation",
      item_id: itemId,
      participant_kind: "guest",
      guest_name: name,
      created_by: userId,
    })),
  ]);
  const participants = await service
    .from("trip_item_participants")
    .insert(participantRows);
  if (participants.error) throw participants.error;
  const justMe =
    selection.userIds.length === 1 &&
    selection.userIds[0] === userId &&
    !selection.familyMemberIds.length &&
    !selection.guestNames.length;
  const audience = await service
    .from("transportation_items")
    .update({ audience_mode: justMe ? "just_me" : "custom" })
    .eq("trip_id", tripId)
    .in("id", itemIds);
  if (audience.error) throw audience.error;
}

export async function addImportedFlights({
  supabase,
  userId,
  importId,
  tripId,
  items,
  travelers,
}: {
  supabase: ImportClient;
  userId: string;
  importId: string;
  tripId: string;
  items: SubmittedImportFlight[];
  travelers: ImportTravelerSelection;
}) {
  await requireOwnedImport(supabase, userId, importId);
  await validateImportTravelerSelection({
    supabase,
    userId,
    tripId,
    selection: travelers,
  });
  const included = items.filter((item) => item.include);
  if (
    !included.length ||
    included.some((item) => item.match_action === "separate")
  ) {
    throw new TravelImportError(
      included.some((item) => item.match_action === "separate")
        ? "Adding this flight separately is currently available on the web review screen."
        : "Select at least one flight.",
      "validation_error",
      422,
    );
  }
  const rpc = await (
    supabase as unknown as {
      rpc: (
        name: "import_travel_email_flights",
        args: { p_import_id: string; p_trip_id: string; p_items: Json },
      ) => Promise<{
        data: {
          status?: string;
          tripId?: string;
          tripSlug?: string | null;
          transportationItemIds?: unknown;
        } | null;
        error: unknown;
      }>;
    }
  ).rpc("import_travel_email_flights", {
    p_import_id: importId,
    p_trip_id: tripId,
    p_items: included as unknown as Json,
  });
  if (rpc.error) throw rpc.error;
  const ids = Array.isArray(rpc.data?.transportationItemIds)
    ? rpc.data.transportationItemIds.filter(
        (id: unknown): id is string => typeof id === "string",
      )
    : [];
  await saveImportedFlightTravelers({
    userId,
    tripId,
    transportationItemIds: ids,
    selection: travelers,
  });
  const notifications = await supabase
    .from("notifications")
    .select("id,metadata")
    .eq("user_id", userId)
    .in("type", [
      "travel_email_ready",
      "travel_email_needs_review",
      "travel_email_failed",
    ]);
  if (!notifications.error) {
    await Promise.all(
      (notifications.data || [])
        .filter(
          (row) =>
            row.metadata &&
            typeof row.metadata === "object" &&
            !Array.isArray(row.metadata) &&
            row.metadata.importId === importId,
        )
        .map((row) =>
          supabase.rpc("mark_app_alert_read", { alert_id: row.id }),
        ),
    );
  }
  return {
    status: rpc.data?.status || "imported",
    tripId: rpc.data?.tripId || tripId,
    tripSlug: rpc.data?.tripSlug || null,
    transportationItemIds: ids,
  };
}
