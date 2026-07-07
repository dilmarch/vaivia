"use client";

import { useMemo, useState } from "react";
import IdeasTab from "@/components/IdeasTab";
import ItineraryCalendar, {
    type ItineraryCalendarItem,
} from "@/components/ItineraryCalendar";
import ItineraryQuickAdd from "@/components/ItineraryQuickAdd";
import JourneyPlanningTab from "@/components/JourneyPlanningTab";
import type { TripIdea } from "@/lib/tripIdeas";

type ItineraryTabsProps = {
    tripId: string;
    items: ItineraryCalendarItem[];
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
}: ItineraryTabsProps) {
    const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
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
            <div className="rounded-[2rem] border border-white/10 bg-[#03030a] p-2 text-white shadow-2xl shadow-black/30">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                    <button
                        type="button"
                        onClick={() => setActiveTab("itinerary")}
                        aria-pressed={activeTab === "itinerary"}
                        className={`rounded-full px-4 py-3 text-sm font-black uppercase tracking-wide transition ${
                            activeTab === "itinerary"
                                ? "bg-lime-300 text-slate-950 shadow-[0_0_26px_rgba(190,242,100,0.20)]"
                                : "text-slate-300 hover:bg-white/10 hover:text-white"
                        }`}
                    >
                        Itinerary
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("ideas")}
                        aria-pressed={activeTab === "ideas"}
                        className={`rounded-full px-4 py-3 text-sm font-black uppercase tracking-wide transition ${
                            activeTab === "ideas"
                                ? "bg-lime-300 text-slate-950 shadow-[0_0_26px_rgba(190,242,100,0.20)]"
                                : "text-slate-300 hover:bg-white/10 hover:text-white"
                        }`}
                    >
                        Ideas
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("journey")}
                        aria-pressed={activeTab === "journey"}
                        className={`rounded-full px-4 py-3 text-sm font-black uppercase tracking-wide transition ${
                            activeTab === "journey"
                                ? "bg-lime-300 text-slate-950 shadow-[0_0_26px_rgba(190,242,100,0.20)]"
                                : "text-slate-300 hover:bg-white/10 hover:text-white"
                        }`}
                    >
                        Journey
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("journey-planning")}
                        aria-pressed={activeTab === "journey-planning"}
                        className={`rounded-full px-4 py-3 text-sm font-black uppercase tracking-wide transition ${
                            activeTab === "journey-planning"
                                ? "bg-lime-300 text-slate-950 shadow-[0_0_26px_rgba(190,242,100,0.20)]"
                                : "text-slate-300 hover:bg-white/10 hover:text-white"
                        }`}
                    >
                        Journey Planning
                    </button>
                    <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        title="Food is coming soon"
                        className="rounded-full border border-dashed border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-black uppercase tracking-wide text-slate-500"
                    >
                        Food
                        <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                            Soon
                        </span>
                    </button>
                    <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        title="Accommodations is coming soon"
                        className="rounded-full border border-dashed border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-black uppercase tracking-wide text-slate-500"
                    >
                        Accommodations
                        <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                            Soon
                        </span>
                    </button>
                    <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        title="Travel Agent is coming soon"
                        className="rounded-full border border-dashed border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-black uppercase tracking-wide text-slate-500"
                    >
                        Travel Agent
                        <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                            Soon
                        </span>
                    </button>
                    <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        title="Budget is coming soon"
                        className="rounded-full border border-dashed border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-black uppercase tracking-wide text-slate-500"
                    >
                        Budget
                        <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                            Soon
                        </span>
                    </button>
                </div>
            </div>

            {activeTab === "itinerary" ? (
                <ItineraryCalendar
                    tripId={tripId}
                    items={items}
                    tripStartDate={tripStartDate}
                    tripDestination={tripDestination}
                    defaultView={defaultItineraryView}
                    ideas={ideas}
                    promoteIdeaAction={promoteIdeaAction}
                    toggleIdeaReactionAction={toggleIdeaReactionAction}
                    deleteAction={deleteItineraryAction}
                    createAction={createItineraryAction}
                    updateTransportationAction={updateTransportationAction}
                    onQuickAddDateChange={setQuickAddDate}
                />
            ) : activeTab === "journey" ? (
                <ItineraryCalendar
                    tripId={tripId}
                    items={transportationItems}
                    tripStartDate={tripStartDate}
                    tripDestination={tripDestination}
                    title="Journey"
                    listOnly
                    deleteAction={deleteItineraryAction}
                    createAction={createItineraryAction}
                    updateTransportationAction={updateTransportationAction}
                    onQuickAddDateChange={setQuickAddDate}
                />
            ) : activeTab === "journey-planning" ? (
                <JourneyPlanningTab
                    tripId={tripId}
                    tripStartDate={tripStartDate}
                    createTransportationAction={createTransportationAction}
                />
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
            />
        </section>
    );
}
