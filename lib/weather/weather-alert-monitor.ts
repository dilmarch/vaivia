import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { severityRank } from "@/lib/weather/adverse-rules";
import type {
    WeatherAlertProvider,
    WeatherMonitoringData,
} from "@/lib/weather/alerts-contracts";
import {
    buildWeatherNotificationDeduplicationKey,
    getMemberTripDateRange,
    isTripActiveOnDestinationDate,
    selectRelevantWeatherLocations,
    weatherEventsForMonitoringData,
    type AccommodationWeatherLocation,
    type ItineraryWeatherLocation,
    type MonitoredLocation,
    type TransportationWeatherLocation,
    type WeatherNotificationEvent,
} from "@/lib/weather/weather-alert-policy";
import type { Database, Json } from "@/src/types/supabase";

export const WEATHER_MONITOR_TRIP_LIMIT = 20;
const MAX_NOTIFICATIONS_PER_RECIPIENT = 3;
const TRIP_PROCESSING_CONCURRENCY = 4;

export type WeatherMonitorRecipient = {
    userId: string;
    tripMemberId: string | null;
    invitationId: string | null;
    startDate: string | null;
    endDate: string | null;
    enabled: boolean;
    itinerary: ItineraryWeatherLocation[];
    accommodations: AccommodationWeatherLocation[];
    transportation: TransportationWeatherLocation[];
};

export type WeatherMonitorTrip = {
    id: string;
    slug: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    primaryDestination: MonitoredLocation | null;
    recipients: WeatherMonitorRecipient[];
};

export type WeatherNotificationInsert = {
    id: string;
    userId: string;
    tripId: string;
    title: string;
    body: string;
    severity: string;
    deepLink: string;
    deduplicationKey: string;
    metadata: Record<string, Json>;
};

export type WeatherAlertRunSummary = {
    ok: boolean;
    skippedConcurrentRun: boolean;
    tripsConsidered: number;
    tripsProcessed: number;
    locationsChecked: number;
    notificationsCreated: number;
    duplicatesSkipped: number;
    errors: number;
};

export interface WeatherAlertMonitorRepository {
    claimRun(runKey: string): Promise<boolean>;
    completeRun(
        runKey: string,
        summary: WeatherAlertRunSummary,
        status: "completed" | "failed"
    ): Promise<void>;
    loadEligibleTripCandidates(
        now: Date,
        limit: number
    ): Promise<WeatherMonitorTrip[]>;
    insertNotification(
        notification: WeatherNotificationInsert
    ): Promise<"created" | "duplicate">;
}

type TripRow = {
    id: string;
    slug: string;
    title: string;
    user_id: string;
    start_date: string | null;
    end_date: string | null;
};

type MemberRow = {
    id: string;
    trip_id: string;
    user_id: string;
    invitation_id: string | null;
};

type ParticipantRow = {
    trip_id: string;
    item_type: string;
    item_id: string;
    trip_member_id: string | null;
    invitation_id: string | null;
    user_id: string | null;
};

type VisibilityItem = {
    id: string;
    trip_id: string;
    created_by: string | null;
    is_private: boolean;
    audience_mode: string;
};

function addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result.toISOString().slice(0, 10);
}

function itemAudienceKey(itemType: string, itemId: string) {
    return `${itemType}:${itemId}`;
}

function isVisibleToRecipient({
    item,
    recipient,
    participantRows,
}: {
    item: VisibilityItem;
    recipient: Pick<WeatherMonitorRecipient, "userId" | "tripMemberId" | "invitationId">;
    participantRows: ParticipantRow[];
}) {
    if (item.created_by === recipient.userId) return true;
    if (item.is_private) return false;
    if (item.audience_mode === "everyone") return true;
    if (participantRows.length === 0) return true;
    return participantRows.some(
        (participant) =>
            participant.user_id === recipient.userId ||
            (recipient.tripMemberId &&
                participant.trip_member_id === recipient.tripMemberId) ||
            (recipient.invitationId &&
                participant.invitation_id === recipient.invitationId)
    );
}

function runKey(now: Date) {
    const hourBucket = Math.floor(now.getUTCHours() / 3) * 3;
    return `${now.toISOString().slice(0, 10)}T${String(hourBucket).padStart(2, "0")}:00Z`;
}

function cleanLabel(value: string, fallback: string) {
    return value.replace(/\s+/g, " ").trim().slice(0, 180) || fallback;
}

function formatEventWindow(event: WeatherNotificationEvent, timeZone: string) {
    const start = new Date(event.startsAt);
    const end = new Date(event.expiresAt);
    try {
        const formatter = new Intl.DateTimeFormat("en", {
            timeZone,
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
        return `${formatter.format(start)} to ${formatter.format(end)}`;
    } catch {
        return `${start.toISOString()} to ${end.toISOString()}`;
    }
}

function notificationCopy(
    event: WeatherNotificationEvent,
    location: MonitoredLocation,
    timeZone: string
) {
    const locationLabel = cleanLabel(location.label, "your trip area");
    const impact =
        location.affectedItineraryItemIds.length > 0
            ? "and may affect your upcoming saved plans"
            : "and may affect local travel plans";
    const origin =
        event.kind === "official"
            ? `Official alert from ${event.sourceName}`
            : "VAIVIA forecast-derived travel warning";
    return {
        title: `${event.severity === "EXTREME" ? "Extreme" : event.severity === "SEVERE" ? "Severe" : "Adverse"} weather near ${locationLabel}`,
        body: `${event.title} is expected near ${locationLabel} ${impact}. ${origin}. Review the timing and your itinerary.`,
        windowLabel: formatEventWindow(event, timeZone),
    };
}

function notificationMetadata({
    event,
    location,
    timeZone,
    windowLabel,
}: {
    event: WeatherNotificationEvent;
    location: MonitoredLocation;
    timeZone: string;
    windowLabel: string;
}): Record<string, Json> {
    return {
        weatherAlertKind: event.kind,
        provider: event.provider,
        providerAlertId: event.sourceIdentity,
        eventType: event.eventType,
        severity: event.severity,
        certainty: event.certainty,
        urgency: event.urgency,
        locationLabel: cleanLabel(location.label, "Trip location"),
        eventStartsAt: event.startsAt,
        eventExpiresAt: event.expiresAt,
        eventWindowLabel: windowLabel,
        timeZone,
        description: event.description.slice(0, 1_500),
        instructions: event.instructions.slice(0, 5),
        safetyRecommendations: event.safetyRecommendations.slice(0, 5),
        sourceName: event.sourceName,
        sourceAuthorityUrl: event.sourceAuthorityUrl,
        affectedItineraryItemIds: location.affectedItineraryItemIds.slice(0, 20),
        googleAttribution: "Source: Includes weather data from Google",
        disclaimer:
            "VAIVIA weather notifications may be delayed or unavailable and do not replace official emergency alerts or local authority guidance.",
    };
}

function eventPriority(event: WeatherNotificationEvent) {
    return severityRank(event.severity) * 10 + (event.kind === "official" ? 1 : 0);
}

export async function processWeatherAlertRun({
    repository,
    provider,
    now = new Date(),
    tripLimit = WEATHER_MONITOR_TRIP_LIMIT,
}: {
    repository: WeatherAlertMonitorRepository;
    provider: WeatherAlertProvider;
    now?: Date;
    tripLimit?: number;
}): Promise<WeatherAlertRunSummary> {
    const key = runKey(now);
    const summary: WeatherAlertRunSummary = {
        ok: true,
        skippedConcurrentRun: false,
        tripsConsidered: 0,
        tripsProcessed: 0,
        locationsChecked: 0,
        notificationsCreated: 0,
        duplicatesSkipped: 0,
        errors: 0,
    };
    const claimed = await repository.claimRun(key);
    if (!claimed) {
        return { ...summary, skippedConcurrentRun: true };
    }

    try {
        const trips = await repository.loadEligibleTripCandidates(
            now,
            Math.min(50, Math.max(1, tripLimit))
        );
        summary.tripsConsidered = trips.length;
        const requestCache = new Map<string, Promise<WeatherMonitoringData | null>>();

        const loadWeather = (location: MonitoredLocation) => {
            const cacheKey = `${Math.round(location.latitude * 10_000) / 10_000},${Math.round(location.longitude * 10_000) / 10_000}`;
            const existing = requestCache.get(cacheKey);
            if (existing) return existing;
            summary.locationsChecked += 1;
            const promise = provider
                .getMonitoringData({
                    latitude: location.latitude,
                    longitude: location.longitude,
                    languageCode: "en",
                    hours: 48,
                })
                .then((result) => {
                    if (result.status === "success") {
                        if (result.data.partialFailures.length > 0) {
                            console.warn("Weather monitor provider partial response", {
                                partialFailures: result.data.partialFailures,
                            });
                        }
                        return result.data;
                    }
                    summary.errors += 1;
                    console.warn("Weather monitor location failed", {
                        reason: result.reason,
                    });
                    return null;
                })
                .catch(() => {
                    summary.errors += 1;
                    console.warn("Weather monitor location failed", {
                        reason: "unexpected_provider_error",
                    });
                    return null;
                });
            requestCache.set(cacheKey, promise);
            return promise;
        };

        const processTrip = async (trip: WeatherMonitorTrip) => {
            try {
                if (!trip.primaryDestination) return;
                if (!trip.recipients.some((recipient) => recipient.enabled)) {
                    return;
                }
                const primaryWeather = await loadWeather(
                    trip.primaryDestination
                );
                if (!primaryWeather) return;

                let processedRecipient = false;
                for (const recipient of trip.recipients) {
                    if (!recipient.enabled) continue;
                    if (
                        !isTripActiveOnDestinationDate({
                            now,
                            timeZone: primaryWeather.timeZone,
                            startDate: recipient.startDate,
                            endDate: recipient.endDate,
                        })
                    ) {
                        continue;
                    }

                    processedRecipient = true;
                    const locations = selectRelevantWeatherLocations({
                        now,
                        tripTimeZone: primaryWeather.timeZone,
                        primaryDestination: trip.primaryDestination,
                        itinerary: recipient.itinerary,
                        accommodations: recipient.accommodations,
                        transportation: recipient.transportation,
                    });
                    const eventCandidates: Array<{
                        location: MonitoredLocation;
                        event: WeatherNotificationEvent;
                        timeZone: string;
                    }> = [];

                    const locationWeather = await Promise.all(
                        locations.map(async (location) => ({
                            location,
                            weather: await loadWeather(location),
                        }))
                    );
                    for (const { location, weather } of locationWeather) {
                        if (!weather) continue;
                        const events = weatherEventsForMonitoringData({
                            officialAlerts: weather.officialAlerts,
                            hourlyForecast: weather.hourlyForecast,
                            now,
                        });
                        events.forEach((event) =>
                            eventCandidates.push({
                                location,
                                event,
                                timeZone: weather.timeZone,
                            })
                        );
                    }

                    const selectedEvents = eventCandidates
                        .toSorted(
                            (first, second) =>
                                eventPriority(second.event) -
                                    eventPriority(first.event) ||
                                first.event.startsAt.localeCompare(
                                    second.event.startsAt
                                )
                        )
                        .slice(0, MAX_NOTIFICATIONS_PER_RECIPIENT);

                    for (const candidate of selectedEvents) {
                        const id = randomUUID();
                        const deepLink = `/trips/${encodeURIComponent(trip.slug)}/assistant?weatherAlert=${encodeURIComponent(id)}`;
                        const deduplicationKey =
                            buildWeatherNotificationDeduplicationKey({
                                userId: recipient.userId,
                                tripId: trip.id,
                                location: candidate.location,
                                event: candidate.event,
                            });
                        const copy = notificationCopy(
                            candidate.event,
                            candidate.location,
                            candidate.timeZone
                        );
                        const outcome = await repository.insertNotification({
                            id,
                            userId: recipient.userId,
                            tripId: trip.id,
                            title: copy.title,
                            body: copy.body,
                            severity: candidate.event.severity,
                            deepLink,
                            deduplicationKey,
                            metadata: {
                                ...notificationMetadata({
                                    event: candidate.event,
                                    location: candidate.location,
                                    timeZone: candidate.timeZone,
                                    windowLabel: copy.windowLabel,
                                }),
                                deepLink,
                                tripName: cleanLabel(trip.title, "Your trip"),
                            },
                        });
                        if (outcome === "created") {
                            summary.notificationsCreated += 1;
                        } else {
                            summary.duplicatesSkipped += 1;
                        }
                    }
                }
                if (processedRecipient) summary.tripsProcessed += 1;
            } catch {
                summary.errors += 1;
                console.warn("Weather monitor trip failed", {
                    tripId: trip.id,
                });
            }
        };

        for (
            let index = 0;
            index < trips.length;
            index += TRIP_PROCESSING_CONCURRENCY
        ) {
            await Promise.all(
                trips
                    .slice(index, index + TRIP_PROCESSING_CONCURRENCY)
                    .map(processTrip)
            );
        }
    } catch {
        summary.ok = false;
        summary.errors += 1;
    }

    await repository.completeRun(
        key,
        summary,
        summary.ok ? "completed" : "failed"
    );
    return summary;
}

function rowsForTrip<T extends { trip_id: string }>(rows: T[], tripId: string) {
    return rows.filter((row) => row.trip_id === tripId);
}

export class SupabaseWeatherAlertMonitorRepository
    implements WeatherAlertMonitorRepository
{
    constructor(
        private readonly supabase: SupabaseClient<Database>
    ) {}

    async claimRun(key: string) {
        const { error } = await this.supabase
            .from("weather_alert_job_runs")
            .insert({ run_key: key });
        if (!error) return true;
        if (error.code === "23505") return false;
        throw new Error("Could not claim weather monitor run");
    }

    async completeRun(
        key: string,
        summary: WeatherAlertRunSummary,
        status: "completed" | "failed"
    ) {
        const { error } = await this.supabase
            .from("weather_alert_job_runs")
            .update({
                status,
                trips_considered: summary.tripsConsidered,
                trips_processed: summary.tripsProcessed,
                locations_checked: summary.locationsChecked,
                notifications_created: summary.notificationsCreated,
                errors: summary.errors,
                completed_at: new Date().toISOString(),
            })
            .eq("run_key", key);
        if (error) throw new Error("Could not finish weather monitor run");
    }

    async insertNotification(notification: WeatherNotificationInsert) {
        const { data, error } = await this.supabase
            .from("notifications")
            .upsert(
                {
                    id: notification.id,
                    user_id: notification.userId,
                    trip_id: notification.tripId,
                    type: "weather_alert",
                    title: notification.title,
                    body: notification.body,
                    severity: notification.severity,
                    deep_link: notification.deepLink,
                    deduplication_key: notification.deduplicationKey,
                    metadata: notification.metadata,
                },
                {
                    onConflict: "user_id,deduplication_key",
                    ignoreDuplicates: true,
                }
            )
            .select("id");
        if (error) throw new Error("Could not create weather notification");
        return data && data.length > 0 ? "created" : "duplicate";
    }

    async loadEligibleTripCandidates(now: Date, limit: number) {
        const minimumDate = addDays(now, -1);
        const maximumDate = addDays(now, 1);
        const { data: tripData, error: tripError } = await this.supabase
            .from("trips")
            .select("id,slug,title,user_id,start_date,end_date")
            .is("archived_at", null)
            .not("start_date", "is", null)
            .lte("start_date", maximumDate)
            .or(
                `end_date.gte.${minimumDate},and(end_date.is.null,start_date.gte.${minimumDate})`
            )
            .order("start_date", { ascending: true })
            .limit(limit);
        if (tripError) throw new Error("Could not load weather monitor trips");
        const trips = (tripData || []) as TripRow[];
        const tripIds = trips.map((trip) => trip.id);
        if (tripIds.length === 0) return [];

        const [
            destinationsResult,
            membersResult,
            memberLegsResult,
            itineraryResult,
            accommodationsResult,
            transportationResult,
            participantsResult,
        ] = await Promise.all([
            this.supabase
                .from("trip_destinations")
                .select(
                    "trip_id,label,google_place_id,latitude,longitude,sort_order"
                )
                .in("trip_id", tripIds)
                .order("sort_order", { ascending: true }),
            this.supabase
                .from("trip_members")
                .select("id,trip_id,user_id,invitation_id,status,left_at")
                .in("trip_id", tripIds)
                .eq("status", "active")
                .is("left_at", null),
            this.supabase
                .from("trip_member_legs")
                .select("trip_id,trip_member_id,is_joining,start_date,end_date")
                .in("trip_id", tripIds)
                .eq("is_joining", true),
            this.supabase
                .from("itinerary_items")
                .select(
                    "id,trip_id,title,item_date,end_date,start_time,end_time,timezone,location,formatted_address,google_place_id,location_lat,location_lng,created_by,is_private,audience_mode,status"
                )
                .in("trip_id", tripIds)
                .gte("item_date", minimumDate)
                .lte("item_date", addDays(now, 3)),
            this.supabase
                .from("trip_accommodations")
                .select(
                    "id,trip_id,hotel_name,city,country,google_place_id,latitude,longitude,check_in_date,check_out_date,created_by,is_private,audience_mode,status,is_planning_option"
                )
                .in("trip_id", tripIds)
                .lte("check_in_date", addDays(now, 3))
                .gte("check_out_date", minimumDate),
            this.supabase
                .from("transportation_items")
                .select(
                    "id,trip_id,departure_date,departure_time,departure_timezone,departure_location,departure_google_place_id,departure_lat,departure_lng,arrival_date,arrival_time,arrival_timezone,arrival_location,arrival_google_place_id,arrival_lat,arrival_lng,created_by,is_private,audience_mode,status"
                )
                .in("trip_id", tripIds)
                .or(
                    `and(departure_date.gte.${minimumDate},departure_date.lte.${addDays(now, 3)}),and(arrival_date.gte.${minimumDate},arrival_date.lte.${addDays(now, 3)})`
                ),
            this.supabase
                .from("trip_item_participants")
                .select(
                    "trip_id,item_type,item_id,trip_member_id,invitation_id,user_id"
                )
                .in("trip_id", tripIds),
        ]);

        const requiredResults = [
            destinationsResult,
            membersResult,
            memberLegsResult,
            itineraryResult,
            accommodationsResult,
            transportationResult,
            participantsResult,
        ];
        if (requiredResults.some((result) => result.error)) {
            throw new Error("Could not load weather monitor trip context");
        }

        const members = (membersResult.data || []) as MemberRow[];
        const recipientUserIds = Array.from(
            new Set([
                ...trips.map((trip) => trip.user_id),
                ...members.map((member) => member.user_id),
            ])
        );
        const { data: preferenceData, error: preferenceError } =
            await this.supabase
                .from("user_notification_preferences")
                .select(
                    "user_id,notification_type,master_enabled,in_app_enabled,email_enabled,push_enabled"
                )
                .in("user_id", recipientUserIds)
                .eq("notification_type", "weather_alert");
        if (preferenceError) {
            throw new Error("Could not load weather preferences");
        }

        const participants = (participantsResult.data || []) as ParticipantRow[];
        const preferences = new Map(
            (preferenceData || []).map((preference) => [
                preference.user_id,
                preference.master_enabled &&
                    (preference.in_app_enabled ||
                        preference.email_enabled ||
                        preference.push_enabled),
            ])
        );
        const memberLegs = memberLegsResult.data || [];
        const destinations = destinationsResult.data || [];
        const itineraryRows = itineraryResult.data || [];
        const accommodationRows = accommodationsResult.data || [];
        const transportationRows = transportationResult.data || [];

        return trips.map<WeatherMonitorTrip>((trip) => {
            const primaryRow = destinations.find(
                (destination) => destination.trip_id === trip.id
            );
            const primaryDestination =
                primaryRow &&
                typeof primaryRow.latitude === "number" &&
                typeof primaryRow.longitude === "number"
                    ? {
                          key:
                              primaryRow.google_place_id ||
                              `${primaryRow.latitude},${primaryRow.longitude}`,
                          label: primaryRow.label,
                          latitude: primaryRow.latitude,
                          longitude: primaryRow.longitude,
                          priority: 2,
                          source: "destination" as const,
                          affectedItineraryItemIds: [],
                      }
                    : null;
            const tripMembers = rowsForTrip(members, trip.id);
            if (!tripMembers.some((member) => member.user_id === trip.user_id)) {
                tripMembers.push({
                    id: "",
                    trip_id: trip.id,
                    user_id: trip.user_id,
                    invitation_id: null,
                });
            }

            const recipients = tripMembers.map<WeatherMonitorRecipient>((member) => {
                const range = getMemberTripDateRange({
                    tripStartDate: trip.start_date,
                    tripEndDate: trip.end_date,
                    joiningLegs: memberLegs
                        .filter(
                            (leg) =>
                                leg.trip_id === trip.id &&
                                leg.trip_member_id === member.id
                        )
                        .map((leg) => ({
                            startDate: leg.start_date,
                            endDate: leg.end_date,
                        })),
                });
                const baseRecipient = {
                    userId: member.user_id,
                    tripMemberId: member.id || null,
                    invitationId: member.invitation_id,
                    startDate: range.startDate,
                    endDate: range.endDate,
                    enabled: preferences.get(member.user_id) ?? true,
                };
                const visibleParticipants = (itemType: string, itemId: string) =>
                    participants.filter(
                        (participant) =>
                            itemAudienceKey(participant.item_type, participant.item_id) ===
                            itemAudienceKey(itemType, itemId)
                    );
                const itinerary = itineraryRows
                    .filter(
                        (item) =>
                            item.trip_id === trip.id &&
                            item.status !== "cancelled" &&
                            typeof item.location_lat === "number" &&
                            typeof item.location_lng === "number" &&
                            isVisibleToRecipient({
                                item,
                                recipient: baseRecipient,
                                participantRows: visibleParticipants(
                                    "itinerary",
                                    item.id
                                ),
                            })
                    )
                    .map((item) => ({
                        id: item.id,
                        title: item.title,
                        itemDate: item.item_date,
                        endDate: item.end_date,
                        startTime: item.start_time,
                        endTime: item.end_time,
                        timeZone: item.timezone,
                        label:
                            item.location || item.formatted_address || item.title,
                        latitude: item.location_lat as number,
                        longitude: item.location_lng as number,
                        key: item.google_place_id,
                    }));
                const accommodations = accommodationRows
                    .filter(
                        (item) =>
                            item.trip_id === trip.id &&
                            item.status !== "cancelled" &&
                            !item.is_planning_option &&
                            typeof item.latitude === "number" &&
                            typeof item.longitude === "number" &&
                            isVisibleToRecipient({
                                item,
                                recipient: baseRecipient,
                                participantRows: visibleParticipants(
                                    "accommodation",
                                    item.id
                                ),
                            })
                    )
                    .map((item) => ({
                        id: item.id,
                        label:
                            item.hotel_name ||
                            [item.city, item.country].filter(Boolean).join(", "),
                        checkInDate: item.check_in_date,
                        checkOutDate: item.check_out_date,
                        latitude: item.latitude as number,
                        longitude: item.longitude as number,
                        key: item.google_place_id,
                    }));
                const transportation = transportationRows
                    .filter(
                        (item) =>
                            item.trip_id === trip.id &&
                            item.status !== "cancelled" &&
                            isVisibleToRecipient({
                                item,
                                recipient: baseRecipient,
                                participantRows: visibleParticipants(
                                    "transportation",
                                    item.id
                                ),
                            })
                    )
                    .map((item) => ({
                        id: item.id,
                        departureDate: item.departure_date,
                        departureTime: item.departure_time,
                        departureTimeZone: item.departure_timezone,
                        departureLabel: item.departure_location,
                        departureLatitude: item.departure_lat,
                        departureLongitude: item.departure_lng,
                        departureKey: item.departure_google_place_id,
                        arrivalDate: item.arrival_date,
                        arrivalTime: item.arrival_time,
                        arrivalTimeZone: item.arrival_timezone,
                        arrivalLabel: item.arrival_location,
                        arrivalLatitude: item.arrival_lat,
                        arrivalLongitude: item.arrival_lng,
                        arrivalKey: item.arrival_google_place_id,
                    }));

                return {
                    ...baseRecipient,
                    itinerary,
                    accommodations,
                    transportation,
                };
            });

            return {
                id: trip.id,
                slug: trip.slug || trip.id,
                title: trip.title,
                startDate: trip.start_date,
                endDate: trip.end_date,
                primaryDestination,
                recipients,
            };
        });
    }
}
