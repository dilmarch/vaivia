"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import IdeasTab from "@/components/IdeasTab";
import ItineraryCalendar, {
    type CalendarAccommodation,
    type ItineraryCalendarItem,
} from "@/components/ItineraryCalendar";
import ItineraryQuickAdd from "@/components/ItineraryQuickAdd";
import JourneyPlanningTab from "@/components/JourneyPlanningTab";
import type { UserCategory } from "@/lib/itineraryCategories";
import type { TripIdea } from "@/lib/tripIdeas";
import type { TransportationTravelerOptions } from "@/lib/travelers";

type ItineraryTabsProps = {
    tripId: string;
    items: ItineraryCalendarItem[];
    accommodations?: CalendarAccommodation[];
    ideas: TripIdea[];
    tripStartDate?: string | null;
    tripDestination?: string | null;
    deleteItineraryAction: (formData: FormData) => Promise<void>;
    updateTransportationAction: (formData: FormData) => Promise<void>;
    createItineraryAction: (formData: FormData) => Promise<void>;
    createTransportationAction: (formData: FormData) => Promise<void>;
    createIdeaAction: (formData: FormData) => Promise<void>;
    updateIdeaAction: (formData: FormData) => Promise<void>;
    archiveIdeaAction: (formData: FormData) => Promise<void>;
    deleteIdeaAction: (formData: FormData) => Promise<void>;
    toggleIdeaReactionAction: (formData: FormData) => Promise<void>;
    promoteIdeaAction: (formData: FormData) => Promise<void>;
    initialTab?: ActiveTab;
    defaultItineraryView?: CalendarView;
    categories?: UserCategory[];
    travelerOptions?: TransportationTravelerOptions;
};

type ActiveTab = "itinerary" | "journey" | "journey-planning" | "ideas";
type CalendarView = "list" | "day" | "week";

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
    ideas,
    tripStartDate,
    tripDestination,
    deleteItineraryAction,
    updateTransportationAction,
    createItineraryAction,
    createTransportationAction,
    createIdeaAction,
    updateIdeaAction,
    archiveIdeaAction,
    deleteIdeaAction,
    toggleIdeaReactionAction,
    promoteIdeaAction,
    initialTab = "itinerary",
    defaultItineraryView = "list",
    categories = [],
    travelerOptions = { users: [], familyMembers: [] },
}: ItineraryTabsProps) {
    const activeTab = initialTab;
    const [quickAddDate, setQuickAddDate] = useState(() =>
        getInitialQuickAddDate(tripStartDate)
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

    return (
        <section className="space-y-6">
            {activeTab === "itinerary" ? (
                <ItineraryCalendar
                    tripId={tripId}
                    items={items}
                    accommodations={accommodations}
                    tripStartDate={tripStartDate}
                    tripDestination={tripDestination}
                    defaultView={defaultItineraryView}
                    ideas={ideas}
                    promoteIdeaAction={promoteIdeaAction}
                    toggleIdeaReactionAction={toggleIdeaReactionAction}
                    deleteAction={deleteItineraryAction}
                    createAction={createItineraryAction}
                    updateTransportationAction={updateTransportationAction}
                    travelerOptions={travelerOptions}
                    onQuickAddDateChange={setQuickAddDate}
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
                            updateTransportationAction={updateTransportationAction}
                            travelerOptions={travelerOptions}
                            onQuickAddDateChange={setQuickAddDate}
                        />
                    ) : (
                        <JourneyPlanningTab
                            tripId={tripId}
                            tripStartDate={tripStartDate}
                            createTransportationAction={createTransportationAction}
                        />
                    )}
                </div>
            ) : (
                <IdeasTab
                    tripId={tripId}
                    ideas={ideas}
                    updateIdeaAction={updateIdeaAction}
                    archiveIdeaAction={archiveIdeaAction}
                    deleteIdeaAction={deleteIdeaAction}
                    toggleReactionAction={toggleIdeaReactionAction}
                />
            )}

            <ItineraryQuickAdd
                tripId={tripId}
                createItineraryAction={createItineraryAction}
                createTransportationAction={createTransportationAction}
                createIdeaAction={createIdeaAction}
                defaultDate={quickAddDate}
                categories={categories}
                travelerOptions={travelerOptions}
            />
        </section>
    );
}
