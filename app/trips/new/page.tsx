import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import DelayedVaiviaLoadingScreen from "@/components/DelayedVaiviaLoadingScreen";
import NewTripForm, {
    type CreateTripFormState,
    type NewTripInviteOption,
} from "@/components/NewTripForm";
import {
    buildTripCoverPayloadFromForm,
    cleanupReplacedTripCover,
    deleteOwnedTripCoverObject,
} from "@/lib/tripCovers";
import {
    loadOnboardingProgress,
    markOnboardingStepCompleted,
} from "@/lib/onboarding";
import { slugifyTripTitle } from "@/lib/tripRoutes";
import { syncAutoBudgetExpense } from "@/lib/budgetAutoSync";
import { replaceTripItemParticipantsFromForm } from "@/lib/tripAudienceServer";
import { resolveTripLegIdForDate } from "@/lib/tripLegs";
import { maybeCreatePassportStampForTransportationArrival } from "@/lib/passportArrivalStamps";

type TripPayload = {
    user_id: string;
    title: string;
    slug: string;
    destination: string;
    start_date: string | null;
    end_date: string | null;
    notes: string;
    cover_image_url?: string | null;
    cover_image_source?: string | null;
    cover_image_storage_path?: string | null;
    cover_image_unsplash_id?: string | null;
    cover_image_photographer_name?: string | null;
    cover_image_photographer_url?: string | null;
};

type TripMatrixLeg = {
    name: string;
    startDate: string | null;
    endDate: string | null;
};

type TransportationRouteStop = {
    order: number;
    label: string;
};

type TransportationItemPayload = Record<
    string,
    string | number | boolean | null | TransportationRouteStop[]
>;

function parseInitialInviteIdentifiers(formData: FormData) {
    return Array.from(
        new Set(
            formData
                .getAll("initial_invites")
                .flatMap((value) => String(value || "").split(","))
                .map((value) => value.trim())
                .filter(Boolean)
        )
    );
}

function parseInitialFamilyMemberIds(formData: FormData) {
    return Array.from(
        new Set(
            formData
                .getAll("initial_family_member_ids")
                .map((value) => String(value || "").trim())
                .filter(Boolean)
        )
    );
}

function isMissingTripCoverColumnError(error: { code?: string; message?: string }) {
    const message = error.message?.toLowerCase() || "";

    return (
        error.code === "42703" ||
        error.code === "PGRST204" ||
        (message.includes("column") &&
            (message.includes("cover_image_url") ||
                message.includes("cover_image_source") ||
                message.includes("cover_image_storage_path") ||
                message.includes("cover_image_unsplash_id") ||
                message.includes("cover_image_photographer") ||
                message.includes("schema cache")))
    );
}

function removeTripCoverColumn(payload: TripPayload) {
    const {
        cover_image_url,
        cover_image_source,
        cover_image_storage_path,
        cover_image_unsplash_id,
        cover_image_photographer_name,
        cover_image_photographer_url,
        ...fallbackPayload
    } = payload;

    void cover_image_url;
    void cover_image_source;
    void cover_image_storage_path;
    void cover_image_unsplash_id;
    void cover_image_photographer_name;
    void cover_image_photographer_url;

    return fallbackPayload;
}

function normalizeMatrixValue(value: FormDataEntryValue | null) {
    return String(value || "").trim();
}

function getFirstMatrixValue(formData: FormData, names: string[]) {
    for (const name of names) {
        const value = normalizeMatrixValue(formData.get(name));
        if (value) return value;
    }

    return "";
}

function getTripDateDestinationMatrix(formData: FormData) {
    const dateMode = getFirstMatrixValue(formData, [
        "date_mode_state",
        "date_mode",
    ]);
    const knowsDates = dateMode === "known";

    if (!knowsDates) {
        return {
            knowsDates,
            destination: normalizeMatrixValue(formData.get("destination")),
            startDate: "",
            endDate: "",
            legs: [] as TripMatrixLeg[],
            validationError: "",
        };
    }

    const startDestination = getFirstMatrixValue(formData, [
        "matrix_start_destination_state",
        "matrix_start_destination",
    ]);
    const startPlaceId = getFirstMatrixValue(formData, [
        "matrix_start_place_id_state",
        "matrix_start_place_id",
    ]);
    const startDate = getFirstMatrixValue(formData, [
        "matrix_start_date_state",
        "matrix_start_date",
    ]);
    const nextRows = Array.from({ length: 6 }, (_, index) => {
        const name = getFirstMatrixValue(formData, [
            `matrix_next_destination_state_${index}`,
            `matrix_next_destination_${index}`,
        ]);
        const placeId = getFirstMatrixValue(formData, [
            `matrix_next_place_id_state_${index}`,
            `matrix_next_place_id_${index}`,
        ]);
        const arrivalDate = getFirstMatrixValue(formData, [
            `matrix_next_arrival_date_state_${index}`,
            `matrix_next_arrival_date_${index}`,
        ]);

        return {
            name,
            placeId,
            arrivalDate,
        };
    }).filter((row) => row.name || row.arrivalDate);
    const returnDestination =
        getFirstMatrixValue(formData, [
            "matrix_return_destination_state",
            "matrix_return_destination",
        ]) || startDestination;
    const returnPlaceId =
        getFirstMatrixValue(formData, [
            "matrix_return_place_id_state",
            "matrix_return_place_id",
        ]) ||
        (returnDestination === startDestination ? startPlaceId : "");
    const returnDate = getFirstMatrixValue(formData, [
        "matrix_return_date_state",
        "matrix_return_date",
    ]);
    const missingValidatedDestination = [
        { name: startDestination, placeId: startPlaceId },
        ...nextRows.map((row) => ({ name: row.name, placeId: row.placeId })),
        { name: returnDestination, placeId: returnPlaceId },
    ].some((row) => row.name && !row.placeId);
    const timelineRows = [
        {
            name: startDestination,
            date: startDate,
        },
        ...nextRows.map((row) => ({
            name: row.name,
            date: row.arrivalDate,
        })),
        {
            name: returnDestination,
            date: returnDate,
        },
    ].filter((row) => row.name || row.date);
    const destination = timelineRows
        .map((row) => row.name)
        .filter(Boolean)
        .filter((name, index, values) => values.indexOf(name) === index)
        .join(", ");
    const legs = timelineRows
        .filter((row) => row.name)
        .map((row, index): TripMatrixLeg => {
            const nextDate = timelineRows[index + 1]?.date || null;

            return {
                name: row.name,
                startDate: row.date || null,
                endDate: nextDate,
            };
        });

    return {
        knowsDates,
        destination,
        startDate,
        endDate: returnDate,
        legs,
        validationError: missingValidatedDestination
            ? "Choose each destination from the Google location list."
            : startDestination && returnDestination && (!startDate || !returnDate)
              ? "Add start and return dates for this trip."
              : "",
    };
}

function getTransportationDbStatus(rawStatus: string) {
    return rawStatus === "planned" ||
        rawStatus === "booked" ||
        rawStatus === "confirmed" ||
        rawStatus === "cancelled" ||
        rawStatus === "completed"
        ? rawStatus
        : "planned";
}

function normalizeAirlineCode(rawCode?: string | null) {
    const compactCode = String(rawCode || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "");
    const codeFromFlightNumber = compactCode.match(/^([A-Z0-9]{2})(\d+)/)?.[1];

    return codeFromFlightNumber || compactCode;
}

function normalizeFlightNumber({
    flightNumber,
    airlineCode,
    fallbackFlightNumber,
}: {
    flightNumber?: string | null;
    airlineCode?: string | null;
    fallbackFlightNumber?: string | null;
}) {
    const compactFlightNumber = String(flightNumber || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "");
    if (compactFlightNumber) return compactFlightNumber;

    const compactFallback = String(fallbackFlightNumber || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "");
    if (compactFallback) return compactFallback;

    return String(airlineCode || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "");
}

function parseMoneyLike(value: FormDataEntryValue | null) {
    const parsed = Number(String(value || "").replace(/,/g, "").trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getMissingColumnName(error: { message?: string; details?: string }) {
    const text = `${error.message || ""} ${error.details || ""}`;
    return (
        text.match(/'([^']+)' column/)?.[1] ||
        text.match(/column "([^"]+)"/)?.[1] ||
        ""
    );
}

const PROTECTED_VISIBILITY_COLUMNS = new Set(["is_private", "audience_mode"]);

async function insertSetupTransportationPayloadWithFallback({
    supabase,
    payload,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    payload: TransportationItemPayload;
}) {
    let attempt = { ...payload };
    let lastError: {
        code?: string;
        message?: string;
        details?: string;
        hint?: string;
    } | null = null;

    for (let index = 0; index < Object.keys(payload).length + 8; index += 1) {
        const { data, error } = await supabase
            .from("transportation_items")
            .insert(attempt)
            .select("id")
            .single();

        if (!error) return { data: data as Record<string, unknown>, error: null };

        lastError = error;

        if (error.code !== "42703" && error.code !== "PGRST204") break;

        const missingColumn = getMissingColumnName(error);
        if (!missingColumn || !(missingColumn in attempt)) break;
        if (PROTECTED_VISIBILITY_COLUMNS.has(missingColumn)) break;

        console.warn(
            `Setup flight transportation insert is missing optional column "${missingColumn}". Retrying without it.`,
            error
        );

        const { [missingColumn]: _removedColumn, ...nextAttempt } = attempt;
        void _removedColumn;
        attempt = nextAttempt;
    }

    return { data: null, error: lastError };
}

async function createSetupFlightTransportation({
    supabase,
    userId,
    tripId,
    formData,
}: {
    supabase: Awaited<ReturnType<typeof createClient>>;
    userId: string;
    tripId: string;
    formData: FormData;
}) {
    if (formData.get("setup_save_flight") !== "true") return;

    const rawStatus = String(formData.get("status") || "").trim();
    const status = getTransportationDbStatus(rawStatus);
    const reservationCode = String(formData.get("reservation_code") || "").trim();
    const cost = parseMoneyLike(formData.get("cost"));
    const currency = String(formData.get("currency") || "CAD")
        .trim()
        .toUpperCase();
    const visaRequirements = String(formData.get("visa_requirements") || "").trim();
    const luggageRequirements = String(
        formData.get("luggage_requirements") || ""
    ).trim();
    const isPrivate =
        formData.get("is_private") === "on" ||
        formData.get("is_private") === "true";
    const flightLegCount = Math.max(1, Number(formData.get("flight_leg_count") || 1));
    const firstFlightNumber = String(
        formData.get("leg_0_flight_number") || formData.get("flight_number") || ""
    ).trim();
    const firstAirlineCode = normalizeAirlineCode(
        String(formData.get("leg_0_airline_code") || formData.get("airline_code") || "")
    );

    const flightLegDetails = Array.from({ length: flightLegCount }, (_, index) => {
        const departureLocation = String(
            formData.get(`leg_${index}_departure_location`) || ""
        ).trim();
        const departurePlaceId = String(
            formData.get(`leg_${index}_departure_google_place_id`) || ""
        ).trim();
        const arrivalLocation = String(
            formData.get(`leg_${index}_arrival_location`) || ""
        ).trim();
        const arrivalPlaceId = String(
            formData.get(`leg_${index}_arrival_google_place_id`) || ""
        ).trim();
        const departureDate = String(
            formData.get(`leg_${index}_departure_date`) || ""
        ).trim();
        const departureTime = String(
            formData.get(`leg_${index}_departure_time`) || ""
        ).trim();
        const arrivalDate = String(
            formData.get(`leg_${index}_arrival_date`) || ""
        ).trim();
        const arrivalTime = String(
            formData.get(`leg_${index}_arrival_time`) || ""
        ).trim();
        const departureTimezone = String(
            formData.get(`leg_${index}_departure_timezone`) || ""
        ).trim();
        const arrivalTimezone = String(
            formData.get(`leg_${index}_arrival_timezone`) || ""
        ).trim();
        const departureTerminal = String(
            formData.get(`leg_${index}_departure_terminal`) || ""
        ).trim();
        const arrivalTerminal = String(
            formData.get(`leg_${index}_arrival_terminal`) || ""
        ).trim();
        const flightNumber = normalizeFlightNumber({
            flightNumber: String(formData.get(`leg_${index}_flight_number`) || ""),
            airlineCode: String(formData.get(`leg_${index}_airline_code`) || ""),
        });
        const airlineCode = normalizeAirlineCode(
            String(formData.get(`leg_${index}_airline_code`) || flightNumber)
        );
        const airlineName = String(
            formData.get(`leg_${index}_airline_name`) || ""
        ).trim();
        const duration = String(formData.get(`leg_${index}_duration`) || "").trim();

        return {
            index,
            departureLocation,
            departurePlaceId,
            arrivalLocation,
            arrivalPlaceId,
            departureDate,
            departureTime,
            arrivalDate,
            arrivalTime,
            departureTimezone,
            arrivalTimezone,
            departureTerminal,
            arrivalTerminal,
            flightNumber,
            airlineCode,
            airlineName,
            duration,
        };
    }).filter(
        (leg) =>
            leg.departureLocation ||
            leg.arrivalLocation ||
            leg.departureDate ||
            leg.arrivalDate ||
            leg.flightNumber
    );

    if (flightLegDetails.length === 0) return;

    const hasUnvalidatedAirport = flightLegDetails.some(
        (leg) =>
            (leg.departureLocation && !leg.departurePlaceId) ||
            (leg.arrivalLocation && !leg.arrivalPlaceId)
    );

    if (hasUnvalidatedAirport) {
        throw new Error("Choose each airport from the Google location list.");
    }

    const createdTransportationItemIds: string[] = [];

    for (const leg of flightLegDetails) {
        const legTitle = leg.flightNumber
            ? `${leg.flightNumber} ${leg.departureLocation || ""} to ${
                  leg.arrivalLocation || ""
              }`.trim()
            : `Airplane: ${leg.departureLocation || "Departure"} to ${
                  leg.arrivalLocation || "Arrival"
              }`;
        const legNotes = [
            flightLegDetails.length > 1
                ? `Scenario leg ${leg.index + 1} of ${flightLegDetails.length}`
                : "",
            leg.duration ? `Duration: ${leg.duration}` : "",
            leg.departureTimezone ? `Departure time zone: ${leg.departureTimezone}` : "",
            leg.arrivalTimezone ? `Arrival time zone: ${leg.arrivalTimezone}` : "",
            leg.departureTerminal
                ? `Departure terminal/platform: ${leg.departureTerminal}`
                : "",
            leg.arrivalTerminal
                ? `Arrival terminal/platform: ${leg.arrivalTerminal}`
                : "",
            visaRequirements ? `VISA requirements:\n${visaRequirements}` : "",
            luggageRequirements
                ? `Luggage requirements:\n${luggageRequirements}`
                : "",
        ]
            .filter(Boolean)
            .join("\n\n");
        const effectiveFlightNumber =
            leg.flightNumber ||
            normalizeFlightNumber({
                flightNumber: firstFlightNumber,
                airlineCode: firstAirlineCode,
            }) ||
            "";
        const effectiveAirlineCode =
            leg.airlineCode || firstAirlineCode || null;
        const legDate = leg.departureDate || null;
        const legArrivalDate = leg.arrivalDate || null;
        const legLocation = [leg.departureLocation, leg.arrivalLocation]
            .filter(Boolean)
            .join(" → ");

        const payload: TransportationItemPayload = {
            user_id: userId,
            trip_id: tripId,
            created_by: userId,
            title: legTitle,
            transport_type: "airplane",
            transportation_mode: "airplane",
            mode: "airplane",
            type: "airplane",
            status,
            item_date: legDate,
            date: legDate,
            departure_date: legDate,
            arrival_date: legArrivalDate,
            end_date: legArrivalDate,
            start_time: leg.departureTime || null,
            departure_time: leg.departureTime || null,
            end_time: leg.arrivalTime || null,
            arrival_time: leg.arrivalTime || null,
            departure_location: leg.departureLocation || null,
            arrival_location: leg.arrivalLocation || null,
            location: legLocation || null,
            route_stops: [
                { order: 0, label: leg.departureLocation },
                { order: 1, label: leg.arrivalLocation },
            ].filter((stop) => stop.label),
            departure_timezone: leg.departureTimezone || null,
            arrival_timezone: leg.arrivalTimezone || null,
            timezone: leg.departureTimezone || null,
            provider_name: leg.airlineName || null,
            provider_code: effectiveAirlineCode,
            airline_name: leg.airlineName || null,
            airline_code: effectiveAirlineCode,
            transport_number: effectiveFlightNumber || null,
            flight_number: effectiveFlightNumber || null,
            reservation_code: reservationCode || null,
            cost: leg.index === 0 ? cost : null,
            currency: leg.index === 0 && cost ? currency : null,
            duration: leg.duration || null,
            departure_terminal: leg.departureTerminal || null,
            arrival_terminal: leg.arrivalTerminal || null,
            baggage_info: luggageRequirements || null,
            flight_leg_count: 1,
            visa_requirements: visaRequirements || null,
            luggage_requirements: luggageRequirements || null,
            is_private: isPrivate,
            audience_mode: "everyone",
            trip_leg_id: await resolveTripLegIdForDate({
                supabase,
                tripId,
                itemDate: leg.departureDate,
            }),
            notes: legNotes || null,
        };

        const { data, error } = await insertSetupTransportationPayloadWithFallback({
            supabase,
            payload,
        });

        if (error || !data?.id) {
            console.error("Error creating setup flight transportation item:", {
                message: error?.message,
                code: error?.code,
                details: error?.details,
                hint: error?.hint,
                tripId,
            });
            throw new Error("Could not save the flight details.");
        }

        const transportationItemId = String(data.id);
        createdTransportationItemIds.push(transportationItemId);

        await syncAutoBudgetExpense({
            supabase,
            userId,
            tripId,
            sourceType: "transportation",
            sourceId: transportationItemId,
            amount: leg.index === 0 ? cost : null,
            currency,
            expenseDate: leg.departureDate,
            description: legTitle,
            formData,
        });

        const participantsError = await replaceTripItemParticipantsFromForm({
            tripId,
            itemType: "transportation",
            itemId: transportationItemId,
            formData,
        });

        if (participantsError) {
            console.error("Error saving setup flight participants:", {
                message: participantsError.message,
                code: participantsError.code,
                details: participantsError.details,
                hint: participantsError.hint,
                tripId,
                transportationItemId,
            });
            throw new Error("Could not save who this flight is for.");
        }

        await maybeCreatePassportStampForTransportationArrival({
            supabase,
            userId,
            tripId,
            transportationItemId,
            title: legTitle,
            departureLocation: leg.departureLocation,
            arrivalLocation: leg.arrivalLocation,
            arrivalDate: leg.arrivalDate,
            arrivalTime: leg.arrivalTime,
            arrivalTimezone: leg.arrivalTimezone,
        });
    }

    if (createdTransportationItemIds.length > 0 && !isPrivate) {
        await supabase.rpc("notify_trip_members", {
            target_trip_id: tripId,
            notification_type: "trip_item_added",
            notification_title: "Trip item added",
            notification_body:
                createdTransportationItemIds.length > 1
                    ? `${createdTransportationItemIds.length} transportation items were added to the trip.`
                    : "A flight was added to the trip.",
            notification_metadata: {
                itemType: "transportation_item",
                count: createdTransportationItemIds.length,
            },
        });
    }
}

async function createTrip(
    _state: CreateTripFormState,
    formData: FormData
): Promise<CreateTripFormState> {
    "use server";

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const createMode = String(formData.get("create_mode") || "");

    if (createMode === "finish_existing" || createMode === "save_setup_flight") {
        const createdTripId = String(formData.get("created_trip_id") || "").trim();
        if (!createdTripId) {
            return { error: "Create the trip before adding flight details." };
        }

        const { data: trip, error: tripError } = await supabase
            .from("trips")
            .select("id,slug,title")
            .eq("id", createdTripId)
            .eq("user_id", user.id)
            .maybeSingle();

        if (tripError || !trip?.id) {
            console.error("Could not load background-created trip:", {
                message: tripError?.message,
                code: tripError?.code,
                details: tripError?.details,
                hint: tripError?.hint,
                createdTripId,
            });
            return { error: "Could not find the trip to add these flight details." };
        }

        try {
            await createSetupFlightTransportation({
                supabase,
                userId: user.id,
                tripId: trip.id,
                formData,
            });
        } catch (error) {
            console.error("Could not save setup flight:", error);
            return {
                error:
                    error instanceof Error
                        ? error.message
                        : "Could not save the flight details.",
            };
        }

        const tripSlug = trip.slug || trip.id;
        const tripHref = `/trips/${tripSlug}?tab=itinerary&onboarding=first-item`;

        if (createMode === "save_setup_flight") {
            const { data: ownerMembership, error: ownerMembershipError } =
                await supabase
                    .from("trip_members")
                    .select("id")
                    .eq("trip_id", trip.id)
                    .eq("user_id", user.id)
                    .maybeSingle();

            if (ownerMembershipError) {
                console.warn("Could not load owner trip membership after setup flight:", {
                    message: ownerMembershipError.message,
                    code: ownerMembershipError.code,
                    details: ownerMembershipError.details,
                    hint: ownerMembershipError.hint,
                    tripId: trip.id,
                });
            }

            return {
                error: null,
                fieldErrors: {},
                savedSetupStep: "flight",
                values: {
                    title: trip.title || "",
                    slug: tripSlug,
                },
                createdTrip: {
                    id: trip.id,
                    slug: tripSlug,
                    href: tripHref,
                    currentUserTripMemberId: ownerMembership?.id || null,
                },
            };
        }

        redirect(tripHref);
    }

    const title = String(formData.get("title") || "").trim();
    const { count: existingTripCount, error: tripCountError } = await supabase
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
    const nextTripNumber = (existingTripCount ?? 0) + 1;
    const requestedSlug = slugifyTripTitle(
        String(formData.get("slug") || title),
        nextTripNumber
    );
    const slugWasManual = String(formData.get("slug_was_manual") || "") === "true";
    const matrix = getTripDateDestinationMatrix(formData);
    const destination = matrix.destination;
    const startDate = matrix.startDate;
    const endDate = matrix.endDate;
    const notes = formData.get("notes") as string;

    if (!title) {
        return {
            fieldErrors: {
                title: "Add a trip title.",
            },
            values: {
                title,
                slug: requestedSlug,
            },
        };
    }

    if (matrix.validationError) {
        return {
            error: matrix.validationError,
            values: {
                title,
                slug: requestedSlug,
            },
        };
    }

    if (tripCountError) {
        console.error("Error checking trip count:", tripCountError);
        return {
            error: "Could not prepare a trip link for this trip.",
            values: {
                title,
                slug: requestedSlug,
            },
        };
    }

    const { data: availableSlug, error: slugError } = await supabase.rpc(
        "get_available_trip_slug",
        {
            base_slug: requestedSlug,
            excluded_trip_id: null,
        }
    );

    if (slugError) {
        console.error("Error checking trip slug:", slugError);
        return {
            error: "Could not check whether that trip link is available.",
            values: {
                title,
                slug: requestedSlug,
            },
        };
    }

    const finalSlug =
        typeof availableSlug === "string" && availableSlug
            ? availableSlug
            : requestedSlug;

    if (slugWasManual && finalSlug !== requestedSlug) {
        return {
            fieldErrors: {
                slug: "That trip link is already in use. Choose a unique slug.",
            },
            values: {
                title,
                slug: requestedSlug,
            },
        };
    }

    const payload: TripPayload = {
        user_id: user.id,
        title,
        slug: finalSlug,
        destination,
        start_date: startDate || null,
        end_date: endDate || null,
        notes,
    };

    let { data: createdTrip, error } = await supabase
        .from("trips")
        .insert(payload)
        .select("id,cover_image_source,cover_image_storage_path")
        .single();

    if (error && isMissingTripCoverColumnError(error)) {
        console.warn(
            "Optional trip cover column is missing. Falling back to legacy trip fields.",
            error
        );
        const fallbackResult = await supabase
            .from("trips")
            .insert(removeTripCoverColumn(payload))
            .select("id,cover_image_source,cover_image_storage_path")
            .single();
        createdTrip = fallbackResult.data;
        error = fallbackResult.error;
    }

    if (error) {
        console.error("Error creating trip:", error);
        return {
            error:
                error.code === "23505"
                    ? "That trip link is already in use. Choose a unique slug."
                    : "Could not create trip.",
            values: {
                title,
                slug: requestedSlug,
            },
        };
    }

    if (createdTrip?.id) {
        if (matrix.legs.length > 0) {
            const now = new Date().toISOString();
            const { error: legsError } = await supabase.from("trip_legs").insert(
                matrix.legs.map((leg) => ({
                    trip_id: createdTrip.id,
                    name: leg.name,
                    city_name: leg.name,
                    start_date: leg.startDate,
                    end_date: leg.endDate,
                    leg_type: "custom",
                    created_by: user.id,
                    updated_at: now,
                }))
            );

            if (legsError) {
                console.error("Error creating trip date matrix legs:", {
                    message: legsError.message,
                    code: legsError.code,
                    details: legsError.details,
                    hint: legsError.hint,
                    tripId: createdTrip.id,
                });
            }
        }

        const initialInviteIdentifiers = parseInitialInviteIdentifiers(formData);
        if (initialInviteIdentifiers.length > 0) {
            for (const inviteeIdentifier of initialInviteIdentifiers) {
                const { error: inviteError } = await supabase.rpc(
                    "create_trip_invitation",
                    {
                        target_trip_id: createdTrip.id,
                        invitee_identifier: inviteeIdentifier,
                        consent_confirmed: true,
                    }
                );

                if (inviteError) {
                    console.warn("Could not create initial trip invite:", {
                        message: inviteError.message,
                        code: inviteError.code,
                        details: inviteError.details,
                        hint: inviteError.hint,
                        tripId: createdTrip.id,
                        inviteeIdentifier,
                    });
                }
            }
        }

        const initialFamilyMemberIds = parseInitialFamilyMemberIds(formData);
        if (initialFamilyMemberIds.length > 0) {
            const { error: familyMembersError } = await supabase
                .from("trip_family_members")
                .upsert(
                    initialFamilyMemberIds.map((familyMemberId) => ({
                        trip_id: createdTrip.id,
                        family_member_id: familyMemberId,
                        added_by: user.id,
                        status: "going",
                        updated_at: new Date().toISOString(),
                    })),
                    { onConflict: "trip_id,family_member_id" }
                );

            if (familyMembersError) {
                console.warn("Could not add initial family members to trip:", {
                    message: familyMembersError.message,
                    code: familyMembersError.code,
                    details: familyMembersError.details,
                    hint: familyMembersError.hint,
                    tripId: createdTrip.id,
                    initialFamilyMemberIds,
                });
            }
        }

        let uploadedStoragePath: string | null | undefined = null;
        try {
            const coverResult = await buildTripCoverPayloadFromForm({
                supabase,
                userId: user.id,
                tripId: createdTrip.id,
                formData,
            });
            uploadedStoragePath = coverResult.uploadedStoragePath;

            if (Object.keys(coverResult.payload).length > 0) {
                const { error: coverError } = await supabase
                    .from("trips")
                    .update(coverResult.payload)
                    .eq("id", createdTrip.id);

                if (coverError) throw coverError;

                await cleanupReplacedTripCover({
                    supabase,
                    userId: user.id,
                    oldCover: createdTrip,
                    nextPayload: coverResult.payload,
                });
            }
        } catch (coverError) {
            await deleteOwnedTripCoverObject({
                supabase,
                userId: user.id,
                storagePath: uploadedStoragePath,
            });
            console.error("Error saving trip cover:", coverError);
            return {
                error:
                    coverError instanceof Error
                        ? coverError.message
                        : "Could not save trip cover.",
                values: {
                    title,
                    slug: requestedSlug,
                },
            };
        }
    }

    await markOnboardingStepCompleted({
        supabase,
        userId: user.id,
        step: "create_trip",
        nextStep: "add_first_item",
    });

    const tripHref = `/trips/${finalSlug}?tab=itinerary&onboarding=first-item`;

    if (createMode === "background" && createdTrip?.id) {
        const { data: ownerMembership, error: ownerMembershipError } =
            await supabase
                .from("trip_members")
                .select("id")
                .eq("trip_id", createdTrip.id)
                .eq("user_id", user.id)
                .maybeSingle();

        if (ownerMembershipError) {
            console.warn("Could not load owner trip membership for setup flow:", {
                message: ownerMembershipError.message,
                code: ownerMembershipError.code,
                details: ownerMembershipError.details,
                hint: ownerMembershipError.hint,
                tripId: createdTrip.id,
            });
        }

        return {
            error: null,
            fieldErrors: {},
            values: {
                title,
                slug: finalSlug,
            },
            createdTrip: {
                id: createdTrip.id,
                slug: finalSlug,
                href: tripHref,
                currentUserTripMemberId: ownerMembership?.id || null,
            },
        };
    }

    redirect(tripHref);
}

async function NewTripContent() {
    await connection();

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login");
    }

    const { count: existingTripCount } = await supabase
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
    const nextTripNumber = (existingTripCount ?? 0) + 1;
    const { data: onboardingProgress } = await loadOnboardingProgress(
        supabase,
        user.id
    );
    const isOnboardingTripCreate =
        onboardingProgress?.status === "in_progress" &&
        onboardingProgress.current_step === "create_trip";
    const { data: currentProfile, error: currentProfileError } = await supabase
        .from("user_profiles")
        .select("first_name,last_name,username,avatar_url,email")
        .eq("id", user.id)
        .maybeSingle();

    if (currentProfileError) {
        console.warn("Could not load current user profile for new trip form:", {
            message: currentProfileError.message,
            code: currentProfileError.code,
            details: currentProfileError.details,
            hint: currentProfileError.hint,
            userId: user.id,
        });
    }

    const currentUserDisplayName =
        [currentProfile?.first_name, currentProfile?.last_name]
            .filter(Boolean)
            .join(" ")
            .trim() ||
        currentProfile?.username ||
        user.email?.split("@")[0] ||
        "Me";
    const { data: friendships, error: friendshipsError } = await supabase
        .from("user_friendships")
        .select("requester_user_id,addressee_user_id,status")
        .or(`requester_user_id.eq.${user.id},addressee_user_id.eq.${user.id}`)
        .eq("status", "accepted");

    if (friendshipsError) {
        console.warn("Could not load friends for new trip invites:", {
            message: friendshipsError.message,
            code: friendshipsError.code,
            details: friendshipsError.details,
            hint: friendshipsError.hint,
            userId: user.id,
        });
    }

    const friendIds = Array.from(
        new Set(
            ((friendships || []) as Array<{
                requester_user_id?: string | null;
                addressee_user_id?: string | null;
            }>)
                .map((friendship) =>
                    friendship.requester_user_id === user.id
                        ? friendship.addressee_user_id
                        : friendship.requester_user_id
                )
                .filter(
                    (friendId): friendId is string =>
                        Boolean(friendId) && friendId !== user.id
                )
        )
    );
    const { data: friendProfiles, error: friendProfilesError } =
        friendIds.length > 0
            ? await supabase
                  .from("connected_public_user_profiles")
                  .select("id,first_name,last_name,username,avatar_url")
                  .in("id", friendIds)
            : { data: [], error: null };

    if (friendProfilesError) {
        console.warn("Could not load friend profiles for new trip invites:", {
            message: friendProfilesError.message,
            code: friendProfilesError.code,
            details: friendProfilesError.details,
            hint: friendProfilesError.hint,
            userId: user.id,
        });
    }

    const friendInviteOptions: NewTripInviteOption[] = (
        (friendProfiles || []) as Array<{
            id: string;
            first_name?: string | null;
            last_name?: string | null;
            username?: string | null;
            avatar_url?: string | null;
        }>
    ).map((friend) => {
        const name =
            [friend.first_name, friend.last_name].filter(Boolean).join(" ").trim() ||
            friend.username ||
            "VAIVIA friend";

        return {
            id: friend.id,
            name,
            secondaryLabel: friend.username ? `@${friend.username}` : null,
            avatarUrl: friend.avatar_url || null,
            identifier: friend.username || null,
        };
    });
    const { data: familyMembers, error: familyMembersError } = await supabase
        .from("user_family_members")
        .select("id,name,relationship,avatar_url")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

    if (familyMembersError) {
        console.warn("Could not load family members for new trip invites:", {
            message: familyMembersError.message,
            code: familyMembersError.code,
            details: familyMembersError.details,
            hint: familyMembersError.hint,
            userId: user.id,
        });
    }

    const familyInviteOptions: NewTripInviteOption[] = (
        (familyMembers || []) as Array<{
            id: string;
            name: string;
            relationship?: string | null;
            avatar_url?: string | null;
        }>
    ).map((member) => ({
        id: member.id,
        name: member.name,
        secondaryLabel: member.relationship || "Family member",
        avatarUrl: member.avatar_url || null,
    }));

    return (
        <main className="min-h-screen bg-[#0c0115] px-6 py-10">
            <div className="mx-auto max-w-2xl">
                <Link href="/" className="text-sm font-semibold text-lime-200 hover:text-lime-100">
                    ← Back to dashboard
                </Link>

                <header className="mt-6 mb-8">
                    <p className="text-sm font-bold uppercase tracking-[0.35em] text-lime-200/80">
                        VAIVIA
                    </p>
                    <h1 className="mt-2 text-3xl font-black text-white">
                        New Trip
                    </h1>
                    <p className="mt-2 text-slate-300">
                        Add the basic details for your trip.
                    </p>
                </header>

                <NewTripForm
                    action={createTrip}
                    nextTripNumber={nextTripNumber}
                    isOnboarding={isOnboardingTripCreate}
                    currentUser={{
                        displayName: currentUserDisplayName,
                        username: currentProfile?.username || null,
                        avatarUrl: currentProfile?.avatar_url || null,
                    }}
                    inviteOptions={{
                        friends: friendInviteOptions,
                        familyMembers: familyInviteOptions,
                    }}
                />
            </div>
        </main>
    );
}

export default function NewTripPage() {
    return (
        <Suspense
            fallback={
                <DelayedVaiviaLoadingScreen
                    title="Preparing your trip form"
                    subtitle="Getting the details ready for your next adventure."
                    compact
                />
            }
        >
            <NewTripContent />
        </Suspense>
    );
}
