import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import ItineraryItemForm from "@/components/ItineraryItemForm";
import TransportationEditForm from "@/components/TransportationEditForm";
import DelayedVaiviaLoadingScreen from "@/components/DelayedVaiviaLoadingScreen";
import {
    FALLBACK_CATEGORY_LABEL,
    sortCategoriesByName,
    type UserCategory,
} from "@/lib/itineraryCategories";
import { syncAutoBudgetExpense } from "@/lib/budgetAutoSync";
import {
    loadBudgetParticipants,
    loadTripExpenseData,
} from "@/lib/budgetServer";
import type { BudgetParticipant, TripExpense, TripExpenseSplit } from "@/lib/budget";
import type { TripAudienceOption } from "@/lib/tripAudience";
import {
    buildItineraryCoverPayloadFromForm,
    cleanupReplacedItineraryCover,
    deleteItineraryCoverObject,
} from "@/lib/itineraryCovers";

type PageProps = {
    params: Promise<{
        tripId: string;
        itemId: string;
    }>;
};

type ItineraryItemUpdatePayload = {
    title: string;
    category: string;
    category_id?: string | null;
    status: string;
    item_date: string;
    end_date: string | null;
    start_time: string | null;
    end_time: string | null;
    location: string;
    formatted_address: string | null;
    google_place_id: string | null;
    location_lat: number | null;
    location_lng: number | null;
    timezone: string | null;
    timezone_source: string;
    url: string | null;
    notes: string;
    ticket_website?: string | null;
    location_website?: string | null;
    cover_image_url?: string | null;
    cover_image_source?: string | null;
    cover_image_storage_path?: string | null;
    is_private?: boolean;
};

type TransportationItemUpdatePayload = Record<string, string | number | boolean | null>;

const REMOVABLE_LEGACY_ITINERARY_COLUMNS = new Set([
    "ticket_website",
    "location_website",
    "cover_image_url",
    "cover_image_source",
    "cover_image_storage_path",
]);

function getBudgetParticipantValue(participant: BudgetParticipant) {
    if (participant.tripMemberId) return `member:${participant.tripMemberId}`;
    if (participant.userId) return `member:user:${participant.userId}`;
    if (participant.invitationId) return `invitation:${participant.invitationId}`;
    if (participant.familyMemberId) {
        return `family_member:${participant.familyMemberId}`;
    }
    return `guest:${participant.guestName || participant.label}`;
}

function getExpensePayerValue(
    row: TripExpense,
    userValueById: Map<string, string>
) {
    if (row.paid_by_trip_member_id) return `member:${row.paid_by_trip_member_id}`;
    if (row.paid_by_user_id) {
        return userValueById.get(row.paid_by_user_id) || "";
    }
    if (row.paid_by_invitation_id) {
        return `invitation:${row.paid_by_invitation_id}`;
    }
    if (row.paid_by_family_member_id) {
        return `family_member:${row.paid_by_family_member_id}`;
    }
    if (row.paid_by_guest_name) return `guest:${row.paid_by_guest_name}`;
    return "";
}

function getExpenseSplitValue(
    row: TripExpenseSplit,
    userValueById: Map<string, string>
) {
    if (row.trip_member_id) return `member:${row.trip_member_id}`;
    if (row.user_id) return userValueById.get(row.user_id) || "";
    if (row.invitation_id) return `invitation:${row.invitation_id}`;
    if (row.family_member_id) return `family_member:${row.family_member_id}`;
    if (row.guest_name) return `guest:${row.guest_name}`;
    return "";
}

function getMissingColumnName(error: { message?: string; details?: string }) {
    const text = `${error.message || ""} ${error.details || ""}`;
    return (
        text.match(/'([^']+)' column/)?.[1] ||
        text.match(/column "([^"]+)"/)?.[1] ||
        ""
    );
}

function isMissingOptionalColumnError(error: {
    code?: string;
    message?: string;
    details?: string;
}) {
    const message = error.message?.toLowerCase() || "";
    const missingColumn = getMissingColumnName(error);

    if (missingColumn) {
        return REMOVABLE_LEGACY_ITINERARY_COLUMNS.has(missingColumn);
    }

    return (
        message.includes("column") &&
        Array.from(REMOVABLE_LEGACY_ITINERARY_COLUMNS).some((column) =>
            message.includes(column)
        )
    );
}

function removeOptionalLinkColumns(payload: ItineraryItemUpdatePayload) {
    const {
        ticket_website,
        location_website,
        cover_image_url,
        cover_image_source,
        cover_image_storage_path,
        ...fallbackPayload
    } = payload;

    void ticket_website;
    void location_website;
    void cover_image_url;
    void cover_image_source;
    void cover_image_storage_path;

    return fallbackPayload;
}

async function getCategorySelectionForPayload({
    categoryId,
    fallbackName,
    userId,
}: {
    categoryId: string;
    fallbackName: string;
    userId: string;
}) {
    const cleanCategoryId = categoryId && categoryId !== "__shared__" ? categoryId : "";
    if (!cleanCategoryId) {
        return {
            category_id: null,
            category: fallbackName || FALLBACK_CATEGORY_LABEL,
        };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("user_categories")
        .select("id,name")
        .eq("id", cleanCategoryId)
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        console.warn("Could not resolve itinerary category for update:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            categoryId: cleanCategoryId,
        });
    }

    return {
        category_id: data ? cleanCategoryId : null,
        category:
            ((data as { name?: string | null } | null)?.name ||
                fallbackName ||
                FALLBACK_CATEGORY_LABEL).trim(),
    };
}

async function updateItineraryItem(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const tripId = formData.get("trip_id") as string;
    const itemId = formData.get("item_id") as string;
    const title = formData.get("title") as string;
    const categorySelection = await getCategorySelectionForPayload({
        categoryId: String(formData.get("category_id") || ""),
        fallbackName: String(formData.get("category") || FALLBACK_CATEGORY_LABEL),
        userId: user.id,
    });
    const status = formData.get("status") as string;
    const itemDate = formData.get("item_date") as string;
    const endDate = formData.get("end_date") as string;
    const startTime = formData.get("start_time") as string;
    const endTime = formData.get("end_time") as string;
    const location = formData.get("location") as string;
    const formattedAddress = formData.get("formatted_address") as string;
    const googlePlaceId = formData.get("google_place_id") as string;
    const locationLat = formData.get("location_lat") as string;
    const locationLng = formData.get("location_lng") as string;
    const timezone = formData.get("timezone") as string;
    const timezoneSource = formData.get("timezone_source") as string;
    const ticketWebsite = formData.get("ticket_website") as string;
    const locationWebsite = formData.get("location_website") as string;
    const url = ticketWebsite || (formData.get("url") as string);
    const notes = formData.get("notes") as string;
    const eventCost = formData.get("cost");
    const eventCurrency = formData.get("currency");
    const isPrivate =
        formData.get("is_private") === "on" ||
        formData.get("is_private") === "true";
    const { data: oldCover, error: oldCoverError } = await supabase
        .from("itinerary_items")
        .select("cover_image_source,cover_image_storage_path")
        .eq("id", itemId)
        .eq("trip_id", tripId)
        .maybeSingle();

    if (oldCoverError || !oldCover) {
        console.error("Could not load itinerary cover before update:", {
            message: oldCoverError?.message,
            code: oldCoverError?.code,
            tripId,
            itemId,
        });
        throw new Error("Could not update itinerary item.");
    }

    const coverResult = await buildItineraryCoverPayloadFromForm({
        supabase,
        userId: user.id,
        tripId,
        formData,
    });

    const payload: ItineraryItemUpdatePayload = {
        title,
        category: categorySelection.category,
        category_id: categorySelection.category_id,
        status,
        item_date: itemDate,
        end_date: endDate || null,
        start_time: startTime || null,
        end_time: endTime || null,
        location,
        formatted_address: formattedAddress || null,
        google_place_id: googlePlaceId || null,
        location_lat: locationLat ? Number(locationLat) : null,
        location_lng: locationLng ? Number(locationLng) : null,
        timezone: timezone || null,
        timezone_source: timezoneSource || "manual",
        url: url || null,
        ticket_website: ticketWebsite || null,
        location_website: locationWebsite || null,
        ...coverResult.payload,
        is_private: isPrivate,
        notes,
    };

    let { error } = await supabase
        .from("itinerary_items")
        .update(payload)
        .eq("id", itemId)
        .eq("trip_id", tripId);

    if (error && isMissingOptionalColumnError(error)) {
        console.warn(
            "Optional itinerary link columns are missing. Falling back to legacy url column.",
            error
        );
        ({ error } = await supabase
            .from("itinerary_items")
            .update(removeOptionalLinkColumns(payload))
            .eq("id", itemId)
            .eq("trip_id", tripId));
    }

    if (error) {
        if (coverResult.uploadedStoragePath) {
            await deleteItineraryCoverObject({
                supabase,
                storagePath: coverResult.uploadedStoragePath,
            });
        }
        console.error("Error updating itinerary item:", error);
        throw new Error("Could not update itinerary item");
    }

    await cleanupReplacedItineraryCover({
        supabase,
        oldCover,
        nextPayload: coverResult.payload,
    });

    await syncAutoBudgetExpense({
        supabase,
        userId: user.id,
        tripId,
        sourceType: "itinerary_event",
        sourceId: itemId,
        amount: eventCost,
        currency: eventCurrency,
        expenseDate: itemDate,
        description: title,
        formData,
    });

    redirect(`/trips/${tripId}/itinerary`);
}

async function updateTransportationItem(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const tripId = formData.get("trip_id") as string;
    const rawItemId = formData.get("item_id") as string;
    const itemId = rawItemId.replace("transportation:", "");
    const departureLocation = formData.get("departure_location") as string;
    const arrivalLocation = formData.get("arrival_location") as string;
    const itemDate = formData.get("item_date") as string;
    const endDate = formData.get("end_date") as string;
    const startTime = formData.get("start_time") as string;
    const endTime = formData.get("end_time") as string;
    const status = formData.get("status") as string;
    const airlineName = formData.get("airline_name") as string;
    const airlineCode = formData.get("airline_code") as string;
    const flightNumber = formData.get("flight_number") as string;
    const reservationCode = String(formData.get("reservation_code") || "").trim();
    const transportationCost = formData.get("cost");
    const transportationCurrency = formData.get("currency");
    const departureTerminal = formData.get("departure_terminal") as string;
    const arrivalTerminal = formData.get("arrival_terminal") as string;
    const departureTimezone = formData.get("departure_timezone") as string;
    const arrivalTimezone = formData.get("arrival_timezone") as string;
    const duration = formData.get("duration") as string;
    const notes = formData.get("notes") as string;
    const isPrivate =
        formData.get("is_private") === "on" ||
        formData.get("is_private") === "true";
    const title = flightNumber
        ? `${flightNumber} ${departureLocation || ""} to ${arrivalLocation || ""}`.trim()
        : `Airplane: ${departureLocation || "Departure"} to ${
              arrivalLocation || "Arrival"
          }`;
    const payload: TransportationItemUpdatePayload = {
        title,
        status: status || "tentative",
        item_date: itemDate || null,
        date: itemDate || null,
        departure_date: itemDate || null,
        arrival_date: endDate || null,
        end_date: endDate || null,
        start_time: startTime || null,
        departure_time: startTime || null,
        end_time: endTime || null,
        arrival_time: endTime || null,
        departure_location: departureLocation || null,
        arrival_location: arrivalLocation || null,
        location: [departureLocation, arrivalLocation].filter(Boolean).join(" → "),
        departure_timezone: departureTimezone || null,
        arrival_timezone: arrivalTimezone || null,
        timezone: departureTimezone || null,
        airline_name: airlineName || null,
        airline_code: airlineCode || null,
        flight_number: flightNumber || null,
        reservation_code: reservationCode || null,
        cost: transportationCost
            ? Number(String(transportationCost).replace(/,/g, ""))
            : null,
        currency: String(transportationCurrency || "").trim().toUpperCase() || null,
        duration: duration || null,
        departure_terminal: departureTerminal || null,
        arrival_terminal: arrivalTerminal || null,
        is_private: isPrivate,
        notes,
    };

    const { error } = await supabase
        .from("transportation_items")
        .update(payload)
        .eq("id", itemId)
        .eq("trip_id", tripId);

    if (error) {
        console.error("Error updating transportation item:", error);
        throw new Error("Could not update transportation item");
    }

    await syncAutoBudgetExpense({
        supabase,
        userId: user.id,
        tripId,
        sourceType: "transportation",
        sourceId: itemId,
        amount: transportationCost,
        currency: transportationCurrency,
        expenseDate: itemDate,
        description: title,
    });

    redirect(`/trips/${tripId}/itinerary`);
}

async function EditItineraryItemContent({
    params,
}: PageProps) {
    await connection();

    const { tripId, itemId: rawRouteItemId } = await params;
    const itemId = decodeURIComponent(rawRouteItemId);

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("*")
        .eq("id", tripId)
        .single();

    if (tripError || !trip) {
        notFound();
    }

    const isTransportationItem = itemId.startsWith("transportation:");
    const normalizedTransportationItemId = itemId.replace("transportation:", "");
    const { data: item, error: itemError } = isTransportationItem
        ? await supabase
              .from("transportation_items")
              .select("*")
              .eq("id", normalizedTransportationItemId)
              .eq("trip_id", tripId)
              .single()
        : await supabase
              .from("itinerary_items")
              .select("*")
              .eq("id", itemId)
              .eq("trip_id", tripId)
              .single();

    if (itemError || !item) {
        notFound();
    }

    const { data: categoryRows, error: categoryRowsError } = await supabase
        .from("user_categories")
        .select("id,user_id,name,color_key,is_default,created_at,updated_at")
        .eq("user_id", user.id);

    if (categoryRowsError) {
        console.warn("Could not load user categories for itinerary edit:", {
            message: categoryRowsError.message,
            code: categoryRowsError.code,
            details: categoryRowsError.details,
            hint: categoryRowsError.hint,
        });
    }

    const categories = sortCategoriesByName((categoryRows || []) as UserCategory[]);
    const [budgetParticipants, expenseData] = await Promise.all([
        loadBudgetParticipants(tripId, user.id),
        loadTripExpenseData(tripId),
    ]);
    const audienceOptions: TripAudienceOption[] = budgetParticipants.map(
        (participant) => ({
            kind: participant.kind,
            id:
                participant.kind === "member"
                    ? participant.tripMemberId || `user:${participant.userId}`
                    : participant.kind === "invitation"
                      ? participant.invitationId || participant.id
                      : participant.kind === "family_member"
                        ? participant.familyMemberId || participant.id
                        : participant.guestName || participant.label,
            displayName: participant.label,
            avatarUrl: participant.avatarUrl,
            secondaryLabel: participant.secondaryLabel,
            status:
                participant.kind === "invitation"
                    ? "invited"
                    : participant.kind === "family_member"
                      ? "family_member"
                      : participant.kind === "guest"
                        ? "guest"
                        : "accepted",
            isCurrentUser: participant.isCurrentUser,
        })
    );
    const currentUserTripMemberId = audienceOptions.find(
        (participant) => participant.kind === "member" && participant.isCurrentUser
    )?.id;
    const userValueById = new Map(
        budgetParticipants
            .filter((participant) => participant.kind === "member" && participant.userId)
            .map((participant) => [
                participant.userId as string,
                getBudgetParticipantValue(participant),
            ])
    );
    let decoratedItem = item;

    if (!isTransportationItem && (item as { category_id?: string | null }).category_id) {
        const { data: currentCategory } = await supabase
            .from("user_categories")
            .select("id,user_id,name,color_key")
            .eq("id", (item as { category_id?: string }).category_id || "")
            .maybeSingle();

        if (currentCategory) {
            decoratedItem = {
                ...(item as Record<string, unknown>),
                category_name: (currentCategory as { name?: string | null }).name,
                category_owner_id: (currentCategory as { user_id?: string | null }).user_id,
            };
        }
    }

    if (!isTransportationItem) {
        const linkedExpense = expenseData.expenses.find(
            (expense) =>
                expense.source_type === "itinerary_event" &&
                expense.itinerary_event_id === itemId
        );

        decoratedItem = {
            ...(decoratedItem as Record<string, unknown>),
            linked_expense: linkedExpense
                ? {
                      amount: linkedExpense.amount,
                      currency: linkedExpense.currency,
                      splitMethod: linkedExpense.split_method,
                      payerValue: getExpensePayerValue(
                          linkedExpense,
                          userValueById
                      ),
                      participantValues: expenseData.splits
                          .filter((split) => split.expense_id === linkedExpense.id)
                          .map((split) =>
                              getExpenseSplitValue(split, userValueById)
                          )
                          .filter(Boolean),
                  }
                : null,
        };
    }

    async function updateWithItemId(formData: FormData) {
        "use server";
        formData.set("item_id", itemId);
        await updateItineraryItem(formData);
    }

    async function updateTransportationWithItemId(formData: FormData) {
        "use server";
        formData.set("item_id", itemId);
        await updateTransportationItem(formData);
    }

    return (
        <main className="min-h-screen bg-[#0c0115] px-6 py-10">
            <div className="mx-auto max-w-2xl">
                <Link
                    href={`/trips/${trip.id}`}
                    className="text-sm font-semibold text-lime-200 hover:text-lime-100"
                >
                    ← Back to {trip.title}
                </Link>

                <header className="mt-6 mb-8">
                    <p className="text-sm font-bold uppercase tracking-[0.35em] text-lime-200/80">
                        VAIVIA
                    </p>
                    <h1 className="mt-2 text-3xl font-black text-white">
                        Edit itinerary item
                    </h1>
                    <p className="mt-2 text-slate-300">{trip.title}</p>
                </header>

                {isTransportationItem ? (
                    <TransportationEditForm
                        tripId={trip.id}
                        itemId={itemId}
                        submitAction={updateTransportationWithItemId}
                        initialItem={item}
                    />
                ) : (
                    <ItineraryItemForm
                        tripId={trip.id}
                        itemId={itemId}
                        submitAction={updateWithItemId}
                        initialItem={decoratedItem}
                        submitLabel="Save changes"
                        categories={categories}
                        audienceOptions={audienceOptions}
                        currentUserTripMemberId={currentUserTripMemberId}
                    />
                )}
            </div>
        </main>
    );
}

export default function EditItineraryItemPage({ params }: PageProps) {
    return (
        <Suspense
            fallback={
                <DelayedVaiviaLoadingScreen
                    title="Loading itinerary item"
                    subtitle="Bringing the saved details back into view."
                    compact
                />
            }
        >
            <EditItineraryItemContent params={params} />
        </Suspense>
    );
}
