"use client";

import { useState } from "react";
import IdeasTab from "@/components/IdeasTab";
import ItineraryCalendar, {
    type ItineraryCalendarItem,
} from "@/components/ItineraryCalendar";
import ItineraryQuickAdd from "@/components/ItineraryQuickAdd";
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
    promoteIdeaAction: (formData: FormData) => Promise<void>;
};

type ActiveTab = "itinerary" | "ideas";

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
    promoteIdeaAction,
}: ItineraryTabsProps) {
    const [activeTab, setActiveTab] = useState<ActiveTab>("itinerary");
    const [quickAddDate, setQuickAddDate] = useState(() =>
        getInitialQuickAddDate(tripStartDate)
    );

    return (
        <section className="space-y-6">
            <div className="rounded-md border border-slate-200 bg-white p-2 shadow-sm">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                    <button
                        type="button"
                        onClick={() => setActiveTab("itinerary")}
                        aria-pressed={activeTab === "itinerary"}
                        className={`rounded-md px-4 py-3 text-sm font-semibold transition ${
                            activeTab === "itinerary"
                                ? "bg-slate-900 text-white shadow-sm"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                        }`}
                    >
                        Itinerary
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("ideas")}
                        aria-pressed={activeTab === "ideas"}
                        className={`rounded-md px-4 py-3 text-sm font-semibold transition ${
                            activeTab === "ideas"
                                ? "bg-slate-900 text-white shadow-sm"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                        }`}
                    >
                        Ideas
                    </button>
                    <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        title="Food is coming soon"
                        className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400"
                    >
                        Food
                        <span className="ml-2 rounded-md bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                            Soon
                        </span>
                    </button>
                    <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        title="Accommodations is coming soon"
                        className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400"
                    >
                        Accommodations
                        <span className="ml-2 rounded-md bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                            Soon
                        </span>
                    </button>
                    <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        title="Travel Agent is coming soon"
                        className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400"
                    >
                        Travel Agent
                        <span className="ml-2 rounded-md bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                            Soon
                        </span>
                    </button>
                    <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        title="Budget is coming soon"
                        className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400"
                    >
                        Budget
                        <span className="ml-2 rounded-md bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                            Soon
                        </span>
                    </button>
                </div>
            </div>

            {activeTab === "itinerary" ? (
                <>
                    <ItineraryCalendar
                        tripId={tripId}
                        items={items}
                        tripStartDate={tripStartDate}
                        tripDestination={tripDestination}
                        ideas={ideas}
                        promoteIdeaAction={promoteIdeaAction}
                        deleteAction={deleteItineraryAction}
                        createAction={createItineraryAction}
                        updateTransportationAction={updateTransportationAction}
                        onQuickAddDateChange={setQuickAddDate}
                    />
                    <ItineraryQuickAdd
                        tripId={tripId}
                        createItineraryAction={createItineraryAction}
                        createTransportationAction={createTransportationAction}
                        createIdeaAction={createIdeaAction}
                        defaultDate={quickAddDate}
                    />
                </>
            ) : (
                <IdeasTab
                    tripId={tripId}
                    ideas={ideas}
                    createIdeaAction={createIdeaAction}
                    updateIdeaAction={updateIdeaAction}
                    archiveIdeaAction={archiveIdeaAction}
                    deleteIdeaAction={deleteIdeaAction}
                />
            )}
        </section>
    );
}
