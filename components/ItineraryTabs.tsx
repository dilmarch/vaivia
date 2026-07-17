"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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

type ItineraryTabsProps = {
    tripId: string;
    items: ItineraryCalendarItem[];
    accommodations?: CalendarAccommodation[];
    memberLocations?: CalendarMemberLocation[];
    tripLegLocations?: TripLegLocation[];
    tripLegMemberOptions?: TripLegMemberOption[];
    ideas: TripIdea[];
    tripStartDate?: string | null;
    tripDestination?: string | null;
    deleteItineraryAction: (formData: FormData) => Promise<void>;
    upsertTripLegAction?: (formData: FormData) => Promise<void>;
    deleteTripLegAction?: (formData: FormData) => Promise<void>;
    tripLegRevalidatePathname?: string;
    updateTransportationAction: (formData: FormData) => Promise<void>;
    createItineraryAction: (formData: FormData) => Promise<void>;
    createTransportationAction: (formData: FormData) => Promise<void>;
    undoJourneyTransportationAction?: (formData: FormData) => Promise<void>;
    createIdeaAction: (formData: FormData) => Promise<void>;
    updateIdeaAction: (formData: FormData) => Promise<void>;
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
type QuickAddInitialAction = "transportation" | "scheduled" | "idea";

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

export default function ItineraryTabs({
    tripId,
    items,
    accommodations = [],
    memberLocations = [],
    tripLegLocations = [],
    tripLegMemberOptions = [],
    ideas,
    tripStartDate,
    tripDestination,
    deleteItineraryAction,
    upsertTripLegAction,
    deleteTripLegAction,
    tripLegRevalidatePathname,
    updateTransportationAction,
    createItineraryAction,
    createTransportationAction,
    undoJourneyTransportationAction,
    createIdeaAction,
    updateIdeaAction,
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
    const transportationItems = useMemo(
        () =>
            items.filter(
                (item) =>
                    item.category === "transportation" ||
                    Boolean(item.transportation_mode)
            ),
        [items]
    );

    return (
        <section className="space-y-6">
            {activeTab === "itinerary" ? (
                <ItineraryCalendar
                    tripId={tripId}
                    items={items}
                    accommodations={accommodations}
                    memberLocations={memberLocations}
                    tripStartDate={tripStartDate}
                    tripDestination={tripDestination}
                    defaultView={defaultItineraryView}
                    deleteAction={deleteItineraryAction}
                    createAction={createItineraryAction}
                    createTransportationAction={createTransportationAction}
                    updateTransportationAction={updateTransportationAction}
                    moveItemAction={moveItemAction}
                    moveTargetTrips={moveTargetTrips}
                    travelerOptions={travelerOptions}
                    audienceOptions={audienceOptions}
                    currentUserTripMemberId={currentUserTripMemberId}
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
                            Journey
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
                            Journey Planning
                        </Link>
                    </div>

                    {activeTab === "journey" ? (
                        <ItineraryCalendar
                            tripId={tripId}
                            items={transportationItems}
                            accommodations={accommodations}
                            tripStartDate={tripStartDate}
                            tripDestination={tripDestination}
                            title="Journey"
                            listOnly
                            deleteAction={deleteItineraryAction}
                            createAction={createItineraryAction}
                            createTransportationAction={createTransportationAction}
                            updateTransportationAction={updateTransportationAction}
                            moveItemAction={moveItemAction}
                            moveTargetTrips={moveTargetTrips}
                            travelerOptions={travelerOptions}
                            audienceOptions={audienceOptions}
                            currentUserTripMemberId={currentUserTripMemberId}
                            onQuickAddDateChange={setQuickAddDate}
                        />
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
                initialAction={initialQuickAddAction}
                onboardingProgress={onboardingProgress}
            />
        </section>
    );
}
