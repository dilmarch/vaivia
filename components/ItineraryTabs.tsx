"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import IdeasTab from "@/components/IdeasTab";
import ItineraryCalendar, {
    type CalendarAccommodation,
    type CalendarMemberLocation,
    type ItineraryCalendarItem,
} from "@/components/ItineraryCalendar";
import ItineraryQuickAdd from "@/components/ItineraryQuickAdd";
import JourneyPlanningTab from "@/components/JourneyPlanningTab";
import TripLegLocationLine, {
    type TripLegLocation,
    type TripLegMemberOption,
} from "@/components/TripLegLocationLine";
import type { UserCategory } from "@/lib/itineraryCategories";
import type { MoveTargetTrip } from "@/lib/tripMove";
import type { TripAudienceOption } from "@/lib/tripAudience";
import type { TripIdea } from "@/lib/tripIdeas";
import type { TransportationTravelerOptions } from "@/lib/travelers";
import type { OnboardingProgress } from "@/lib/onboarding";
import { buildItineraryTimezoneHints } from "@/lib/itineraryTimezoneHints";
import { buildAccommodationItineraryHolds } from "@/lib/accommodationItineraryHolds";
import { resolveAccommodationTimezones } from "@/lib/accommodationTimezones";

type ItineraryTabsProps = {
    tripId: string;
    items: ItineraryCalendarItem[];
    accommodations?: CalendarAccommodation[];
    memberLocations?: CalendarMemberLocation[];
    tripLegLocations?: TripLegLocation[];
    tripLegMemberOptions?: TripLegMemberOption[];
    ideas: TripIdea[];
    tripStartDate?: string | null;
    tripEndDate?: string | null;
    tripDestination?: string | null;
    deleteItineraryAction: (formData: FormData) => Promise<void>;
    upsertTripLegAction?: (formData: FormData) => Promise<void>;
    deleteTripLegAction?: (formData: FormData) => Promise<void>;
    tripLegRevalidatePathname?: string;
    updateTransportationAction: (formData: FormData) => Promise<void>;
    updateItineraryAction: (formData: FormData) => Promise<void>;
    createItineraryAction: (formData: FormData) => Promise<void>;
    createTransportationAction: (formData: FormData) => Promise<void>;
    undoJourneyTransportationAction?: (formData: FormData) => Promise<void>;
    createIdeaAction: (formData: FormData) => Promise<void>;
    updateIdeaAction: (formData: FormData) => Promise<void>;
    deleteIdeaAction: (formData: FormData) => Promise<void>;
    moveItemAction: (formData: FormData) => Promise<void>;
    moveTargetTrips: MoveTargetTrip[];
    toggleIdeaReactionAction: (formData: FormData) => Promise<void>;
    toggleIdeaAttendedAction: (formData: FormData) => Promise<void>;
    initialTab?: ActiveTab;
    defaultItineraryView?: CalendarView;
    categories?: UserCategory[];
    travelerOptions?: TransportationTravelerOptions;
    audienceOptions?: TripAudienceOption[];
    currentUserTripMemberId?: string | null;
    initialQuickAddAction?: QuickAddInitialAction | null;
    addedJourneyScenarioId?: string | null;
    addedJourneyTransportationId?: string | null;
    initialJourneyPlanningScenarios?: unknown[] | null;
    onboardingProgress?: OnboardingProgress | null;
};

type ActiveTab = "itinerary" | "journey" | "journey-planning" | "ideas";
type CalendarView = "list" | "day" | "week";
type QuickAddInitialAction =
    | "transportation"
    | "scheduled"
    | "idea"
    | "things"
    | "expense";

function getLocalDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getInitialQuickAddDate(tripStartDate?: string | null) {
    const todayKey = getLocalDateKey(new Date());
    if (!tripStartDate || tripStartDate <= todayKey) return todayKey;
    return tripStartDate;
}

function isAssignedToCurrentTraveler(
    item: ItineraryCalendarItem,
    currentUserTripMemberId: string | null,
    currentUserId?: string | null
) {
    if (!currentUserTripMemberId) return true;
    if (item.is_private || item.audience_mode === "just_me") return true;
    if (item.audience_mode !== "custom") return true;

    const selectedOptions = item.audience_selected_options || [];
    if (
        selectedOptions.some(
            (option) =>
                option.isCurrentUser ||
                (option.kind === "member" && option.id === currentUserTripMemberId)
        )
    ) {
        return true;
    }

    const travelers = [...(item.participants || []), ...(item.travelers || [])];
    return travelers.some(
        (traveler) =>
            traveler.trip_member_id === currentUserTripMemberId ||
            (currentUserId && traveler.user_id === currentUserId)
    );
}

export default function ItineraryTabs({
    tripId,
    items,
    accommodations = [],
    memberLocations = [],
    tripLegLocations = [],
    tripLegMemberOptions = [],
    ideas,
    tripStartDate,
    tripEndDate,
    tripDestination,
    deleteItineraryAction,
    upsertTripLegAction,
    deleteTripLegAction,
    tripLegRevalidatePathname,
    updateTransportationAction,
    updateItineraryAction,
    createItineraryAction,
    createTransportationAction,
    undoJourneyTransportationAction,
    createIdeaAction,
    updateIdeaAction,
    deleteIdeaAction,
    moveItemAction,
    moveTargetTrips,
    toggleIdeaReactionAction,
    toggleIdeaAttendedAction,
    initialTab = "itinerary",
    defaultItineraryView = "list",
    categories = [],
    travelerOptions = { users: [], familyMembers: [] },
    audienceOptions = [],
    currentUserTripMemberId = null,
    initialQuickAddAction = null,
    addedJourneyScenarioId = null,
    addedJourneyTransportationId = null,
    initialJourneyPlanningScenarios = null,
    onboardingProgress = null,
}: ItineraryTabsProps) {
    const activeTab = initialTab;
    const [quickAddDate, setQuickAddDate] = useState(() =>
        getInitialQuickAddDate(tripStartDate)
    );
    const [requestedLegLocationKey, setRequestedLegLocationKey] = useState<
        string | null
    >(null);
    const [showAllJourneyItems, setShowAllJourneyItems] = useState(false);
    const itineraryTimezoneHints = useMemo(
        () => buildItineraryTimezoneHints(items, tripEndDate),
        [items, tripEndDate]
    );
    const [resolvedAccommodationTimezones, setResolvedAccommodationTimezones] =
        useState<Record<string, string>>({});
    useEffect(() => {
        let isCancelled = false;

        void resolveAccommodationTimezones(accommodations).then((timezones) => {
            if (!isCancelled) setResolvedAccommodationTimezones(timezones);
        });

        return () => {
            isCancelled = true;
        };
    }, [accommodations]);
    const accommodationTimezones = useMemo(
        () =>
            Object.fromEntries(
                accommodations.map((accommodation) => [
                    accommodation.id,
                    resolvedAccommodationTimezones[accommodation.id] ||
                        itineraryTimezoneHints[accommodation.check_in_date] ||
                        itineraryTimezoneHints[accommodation.check_out_date] ||
                        null,
                ])
            ),
        [
            accommodations,
            itineraryTimezoneHints,
            resolvedAccommodationTimezones,
        ]
    );
    const currentUserTraveler = useMemo(
        () =>
            currentUserTripMemberId
                ? travelerOptions.users.find(
                      (traveler) =>
                          traveler.trip_member_id === currentUserTripMemberId
                  ) || null
                : null,
        [currentUserTripMemberId, travelerOptions.users]
    );
    const transportationItems = useMemo(
        () =>
            items.filter(
                (item) =>
                    item.category === "transportation" ||
                    Boolean(item.transportation_mode)
            ),
        [items]
    );
    const itineraryItems = useMemo(
        () => [
            ...items,
            ...buildAccommodationItineraryHolds({
                accommodations,
                items,
                timezoneByAccommodationId: accommodationTimezones,
            }),
        ],
        [accommodationTimezones, accommodations, items]
    );
    const currentTravelerTransportationItems = useMemo(
        () =>
            transportationItems.filter((item) =>
                isAssignedToCurrentTraveler(
                    item,
                    currentUserTripMemberId,
                    currentUserTraveler?.user_id || null
                )
            ),
        [
            currentUserTraveler?.user_id,
            currentUserTripMemberId,
            transportationItems,
        ]
    );
    const journeyItems = showAllJourneyItems
        ? transportationItems
        : currentTravelerTransportationItems;

    return (
        <section className="space-y-6">
            {activeTab === "itinerary" ? (
                <ItineraryCalendar
                    tripId={tripId}
                    items={itineraryItems}
                    accommodations={accommodations}
                    memberLocations={memberLocations}
                    tripStartDate={tripStartDate}
                    tripDestination={tripDestination}
                    defaultView={defaultItineraryView}
                    deleteAction={deleteItineraryAction}
                    createAction={createItineraryAction}
                    createTransportationAction={createTransportationAction}
                    updateTransportationAction={updateTransportationAction}
                    updateAction={updateItineraryAction}
                    moveItemAction={moveItemAction}
                    moveTargetTrips={moveTargetTrips}
                    travelerOptions={travelerOptions}
                    audienceOptions={audienceOptions}
                    currentUserTripMemberId={currentUserTripMemberId}
                    categories={categories}
                    onQuickAddDateChange={setQuickAddDate}
                    ideas={ideas}
                    promoteIdeaAction={createItineraryAction}
                    toggleIdeaReactionAction={toggleIdeaReactionAction}
                    toggleIdeaAttendedAction={toggleIdeaAttendedAction}
                    onEditMemberLocationLeg={setRequestedLegLocationKey}
                />
            ) : activeTab === "journey" || activeTab === "journey-planning" ? (
                <div className="space-y-5">
                    <div className="inline-flex rounded-full border border-white/10 bg-[#03030a] p-1 text-white shadow-2xl shadow-black/20">
                        <Link
                            href={`/trips/${tripId}?tab=journey`}
                            aria-current={
                                activeTab === "journey" ? "page" : undefined
                            }
                            className={`rounded-full px-5 py-2.5 text-sm font-black uppercase tracking-wide transition ${
                                activeTab === "journey"
                                    ? "bg-lime-300 text-slate-950 shadow-[0_0_26px_rgba(var(--vaivia-neon-rgb),0.20)]"
                                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            Transport
                        </Link>
                        <Link
                            href={`/trips/${tripId}?tab=journey-planning`}
                            aria-current={
                                activeTab === "journey-planning"
                                    ? "page"
                                    : undefined
                            }
                            className={`rounded-full px-5 py-2.5 text-sm font-black uppercase tracking-wide transition ${
                                activeTab === "journey-planning"
                                    ? "bg-lime-300 text-slate-950 shadow-[0_0_26px_rgba(var(--vaivia-neon-rgb),0.20)]"
                                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            Compare Flights
                        </Link>
                    </div>

                    {activeTab === "journey" ? (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-3 text-white shadow-xl shadow-black/20">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                        Transport view
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-slate-300">
                                        {showAllJourneyItems
                                            ? "Showing transportation for everyone on this trip."
                                            : "Showing transportation assigned to you."}
                                    </p>
                                </div>
                                <div className="inline-flex rounded-full border border-white/10 bg-[#03030a] p-1 shadow-inner shadow-black/30">
                                    <button
                                        type="button"
                                        onClick={() => setShowAllJourneyItems(false)}
                                        aria-pressed={!showAllJourneyItems}
                                        className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide transition ${
                                            !showAllJourneyItems
                                                ? "bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)]"
                                                : "text-slate-300 hover:bg-white/10 hover:text-white"
                                        }`}
                                    >
                                        My transport
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowAllJourneyItems(true)}
                                        aria-pressed={showAllJourneyItems}
                                        className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide transition ${
                                            showAllJourneyItems
                                                ? "bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)]"
                                                : "text-slate-300 hover:bg-white/10 hover:text-white"
                                        }`}
                                    >
                                        All members
                                    </button>
                                </div>
                            </div>
                            <ItineraryCalendar
                                tripId={tripId}
                                items={journeyItems}
                                accommodations={accommodations}
                                tripStartDate={tripStartDate}
                                tripDestination={tripDestination}
                                title="Transport"
                                listOnly
                                deleteAction={deleteItineraryAction}
                                createAction={createItineraryAction}
                                createTransportationAction={createTransportationAction}
                                updateTransportationAction={updateTransportationAction}
                                updateAction={updateItineraryAction}
                                moveItemAction={moveItemAction}
                                moveTargetTrips={moveTargetTrips}
                                travelerOptions={travelerOptions}
                                audienceOptions={audienceOptions}
                                currentUserTripMemberId={currentUserTripMemberId}
                                categories={categories}
                                onQuickAddDateChange={setQuickAddDate}
                            />
                        </div>
                    ) : (
                        <JourneyPlanningTab
                            tripId={tripId}
                            tripStartDate={tripStartDate}
                            createTransportationAction={createTransportationAction}
                            undoJourneyTransportationAction={
                                undoJourneyTransportationAction
                            }
                            addedScenarioId={addedJourneyScenarioId}
                            addedTransportationId={addedJourneyTransportationId}
                            initialScenarios={initialJourneyPlanningScenarios}
                        />
                    )}
                </div>
            ) : (
                <IdeasTab
                    tripId={tripId}
                    ideas={ideas}
                    updateIdeaAction={updateIdeaAction}
                    deleteIdeaAction={deleteIdeaAction}
                    moveItemAction={moveItemAction}
                    moveTargetTrips={moveTargetTrips}
                    toggleReactionAction={toggleIdeaReactionAction}
                    toggleAttendedAction={toggleIdeaAttendedAction}
                />
            )}

            {upsertTripLegAction && deleteTripLegAction ? (
                <TripLegLocationLine
                    tripId={tripId}
                    revalidatePathname={tripLegRevalidatePathname}
                    locations={tripLegLocations}
                    memberOptions={tripLegMemberOptions}
                    upsertLegAction={upsertTripLegAction}
                    deleteLegAction={deleteTripLegAction}
                    renderTiles={false}
                    openLocationKey={requestedLegLocationKey}
                    onOpenLocationHandled={() => setRequestedLegLocationKey(null)}
                />
            ) : null}

            <ItineraryQuickAdd
                tripId={tripId}
                createItineraryAction={createItineraryAction}
                createTransportationAction={createTransportationAction}
                createIdeaAction={createIdeaAction}
                defaultDate={quickAddDate}
                categories={categories}
                travelerOptions={travelerOptions}
                audienceOptions={audienceOptions}
                currentUserTripMemberId={currentUserTripMemberId}
                itineraryTimezoneHints={itineraryTimezoneHints}
                initialAction={initialQuickAddAction}
                onboardingProgress={onboardingProgress}
            />
        </section>
    );
}
