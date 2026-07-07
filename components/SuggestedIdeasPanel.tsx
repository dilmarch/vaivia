"use client";

import { Lock } from "lucide-react";
import IdeaReactionBar from "@/components/IdeaReactionBar";
import {
    IDEA_TIME_EXACT_WINDOWS,
    IDEA_TIME_OF_DAY_OPTIONS,
    type IdeaTimeOfDay,
    type TripIdea,
    formatIdeaDayLabel,
    formatIdeaTimeLabel,
    getIdeaDayForDate,
} from "@/lib/tripIdeas";

type SuggestedIdeasPanelProps = {
    tripId: string;
    ideas: TripIdea[];
    selectedDate: Date;
    dayItems?: Array<{
        title?: string | null;
        item_date?: string | null;
        end_date?: string | null;
        start_time?: string | null;
        end_time?: string | null;
        category?: string | null;
        location?: string | null;
        departure_location?: string | null;
        arrival_location?: string | null;
        formatted_address?: string | null;
        transportation_mode?: string | null;
        source_table?: string | null;
    }>;
    promoteIdeaAction: (formData: FormData) => Promise<void>;
    toggleReactionAction?: (formData: FormData) => Promise<void>;
};

type DayItem = NonNullable<SuggestedIdeasPanelProps["dayItems"]>[number];

function getLocalDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function travelInputProps() {
    return {
        autoComplete: "off",
        "data-form-type": "other",
        "data-lpignore": "true",
        "data-1p-ignore": "true",
    };
}

function getDefaultStartTime(time: IdeaTimeOfDay) {
    if (time === "Early morning") return "07:00";
    if (time === "Morning") return "09:00";
    if (time === "Afternoon") return "13:00";
    if (time === "Evening") return "18:00";
    return "22:00";
}

function getDefaultEndTime(time: IdeaTimeOfDay) {
    if (time === "Early morning") return "08:00";
    if (time === "Morning") return "10:30";
    if (time === "Afternoon") return "15:00";
    if (time === "Evening") return "20:00";
    return "23:30";
}

function normalizeText(value?: string | null) {
    return (value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function parseTimeToMinutes(time?: string | null) {
    if (!time) return null;
    const [hourText, minuteText] = time.slice(0, 5).split(":");
    const hours = Number(hourText);
    const minutes = Number(minuteText);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
}

function rangesOverlap(
    first: { start: number; end: number },
    second: { start: number; end: number }
) {
    return first.start < second.end && second.start < first.end;
}

function getIdeaTimeRanges(idea: TripIdea) {
    if (idea.is_24_hours || idea.time_of_day.length === 0) {
        return [{ start: 0, end: 1440 }];
    }

    return idea.time_of_day.flatMap((time) => {
        const window = IDEA_TIME_EXACT_WINDOWS[time];
        const start = parseTimeToMinutes(window.opensAt) ?? 0;
        const end = parseTimeToMinutes(window.closesAt) ?? 1440;

        if (end > start) return [{ start, end }];

        return [
            { start, end: 1440 },
            { start: 0, end },
        ];
    });
}

function getItemEndMinutes(item: DayItem, selectedDateKey: string) {
    const startMinutes = parseTimeToMinutes(item.start_time);
    const endMinutes = parseTimeToMinutes(item.end_time);
    const itemStartDate = item.item_date || selectedDateKey;
    const itemEndDate = item.end_date || itemStartDate;

    if (endMinutes === null) {
        return startMinutes === null ? null : Math.min(startMinutes + 60, 1440);
    }

    if (itemEndDate !== itemStartDate && itemEndDate === selectedDateKey) {
        return endMinutes;
    }

    if (startMinutes !== null && endMinutes <= startMinutes) return 1440;
    return endMinutes;
}

function getDayLocationText(
    dayItems: SuggestedIdeasPanelProps["dayItems"] = []
) {
    return normalizeText(
        dayItems
            .flatMap((item) => [
                item.title,
                item.location,
                item.departure_location,
                item.arrival_location,
                item.formatted_address,
            ])
            .filter(Boolean)
            .join(" ")
    );
}

function ideaMatchesDayLocation(idea: TripIdea, dayLocationText: string) {
    const hasLocationScope = Boolean(
        idea.location_city ||
            idea.address ||
            idea.formatted_address ||
            idea.google_place_id
    );

    if (!hasLocationScope) return true;
    if (!idea.location_city) return true;
    if (!dayLocationText) return false;

    return dayLocationText.includes(normalizeText(idea.location_city));
}

function getDayLocationWindows(
    dayItems: SuggestedIdeasPanelProps["dayItems"] = [],
    selectedDateKey: string
) {
    const windows: Array<{ text: string; start: number; end: number }> = [];

    for (const item of dayItems) {
        const isTransportation = Boolean(
            item.source_table === "transportation_items" ||
                item.category === "transportation" ||
                item.transportation_mode
        );
        const startMinutes = parseTimeToMinutes(item.start_time);
        const endMinutes = getItemEndMinutes(item, selectedDateKey);
        const itemStartDate = item.item_date || selectedDateKey;
        const itemEndDate = item.end_date || itemStartDate;

        if (isTransportation) {
            if (
                item.departure_location &&
                itemStartDate === selectedDateKey &&
                startMinutes !== null &&
                startMinutes > 0
            ) {
                windows.push({
                    text: normalizeText(item.departure_location),
                    start: 0,
                    end: startMinutes,
                });
            }

            if (
                item.arrival_location &&
                itemEndDate === selectedDateKey &&
                endMinutes !== null &&
                endMinutes < 1440
            ) {
                windows.push({
                    text: normalizeText(item.arrival_location),
                    start: endMinutes,
                    end: 1440,
                });
            }

            continue;
        }

        const itemLocationText = normalizeText(
            [item.location, item.formatted_address, item.title]
                .filter(Boolean)
                .join(" ")
        );

        if (!itemLocationText || startMinutes === null) continue;

        windows.push({
            text: itemLocationText,
            start: startMinutes,
            end: endMinutes ?? Math.min(startMinutes + 60, 1440),
        });
    }

    return windows.filter((window) => window.end > window.start);
}

function hasTransportationLocationSplit(
    dayItems: SuggestedIdeasPanelProps["dayItems"] = [],
    selectedDateKey: string
) {
    return dayItems.some((item) => {
        const isTransportation = Boolean(
            item.source_table === "transportation_items" ||
                item.category === "transportation" ||
                item.transportation_mode
        );

        if (!isTransportation) return false;

        const itemStartDate = item.item_date || selectedDateKey;
        const itemEndDate = item.end_date || itemStartDate;

        return Boolean(
            item.departure_location &&
                item.arrival_location &&
                item.departure_location !== item.arrival_location &&
                (itemStartDate === selectedDateKey || itemEndDate === selectedDateKey)
        );
    });
}

function ideaMatchesTimedDayLocation(
    idea: TripIdea,
    dayLocationText: string,
    dayLocationWindows: Array<{ text: string; start: number; end: number }>,
    shouldUseTimedLocationWindows: boolean
) {
    if (!idea.location_city) return ideaMatchesDayLocation(idea, dayLocationText);
    if (!dayLocationText.includes(normalizeText(idea.location_city))) return false;
    if (!shouldUseTimedLocationWindows || dayLocationWindows.length === 0) {
        return true;
    }

    const ideaCity = normalizeText(idea.location_city);
    const matchingWindows = dayLocationWindows.filter((window) =>
        window.text.includes(ideaCity)
    );

    if (matchingWindows.length === 0) return false;

    const ideaTimeRanges = getIdeaTimeRanges(idea);
    return matchingWindows.some((window) =>
        ideaTimeRanges.some((range) => rangesOverlap(window, range))
    );
}

function IdeaSuggestionCard({
    idea,
    tripId,
    selectedDateKey,
    promoteIdeaAction,
    toggleReactionAction,
}: {
    idea: TripIdea;
    tripId: string;
    selectedDateKey: string;
    promoteIdeaAction: (formData: FormData) => Promise<void>;
    toggleReactionAction?: (formData: FormData) => Promise<void>;
}) {
    const firstTime = idea.time_of_day[0] || "Afternoon";

    return (
        <article className="rounded-[1.35rem] border border-white/10 bg-[#03030a]/90 p-4 shadow-xl shadow-black/20 transition duration-300 hover:-translate-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-lime-300">
                    {idea.category}
                </p>
                {idea.is_private ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white">
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        Private
                    </span>
                ) : null}
            </div>
            <h3 className="mt-1 text-sm font-bold text-white">
                {idea.title}
            </h3>
            {idea.description && (
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-300">
                    {idea.description}
                </p>
            )}
            {(idea.location_city || idea.address || idea.formatted_address) && (
                <p className="mt-2 text-xs font-semibold text-slate-200">
                    {idea.location_city || idea.address || idea.formatted_address}
                </p>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
                {idea.tags.map((tag) => (
                    <span
                        key={tag}
                        className="rounded-full border border-white/10 bg-white/[0.07] px-2 py-1 text-[11px] font-semibold text-slate-200"
                    >
                        {tag}
                    </span>
                ))}
            </div>

            <dl className="mt-3 space-y-2 text-xs text-slate-300">
                <div>
                    <dt className="font-bold uppercase tracking-[0.16em] text-slate-500">
                        Available
                    </dt>
                    <dd>{formatIdeaDayLabel(idea.days_available)}</dd>
                </div>
                <div>
                    <dt className="font-bold uppercase tracking-[0.16em] text-slate-500">
                        Time
                    </dt>
                    <dd>
                        {idea.is_24_hours
                            ? "24 hours"
                            : formatIdeaTimeLabel(idea.time_of_day)}
                    </dd>
                </div>
                {idea.ticket_type && (
                    <div>
                        <dt className="font-bold uppercase tracking-[0.16em] text-slate-500">
                            Tickets
                        </dt>
                        <dd>{idea.ticket_type}</dd>
                    </div>
                )}
                {idea.age_policy && (
                    <div>
                        <dt className="font-bold uppercase tracking-[0.16em] text-slate-500">
                            Age
                        </dt>
                        <dd>{idea.age_policy}</dd>
                    </div>
                )}
            </dl>

            {toggleReactionAction ? (
                <IdeaReactionBar
                    tripId={tripId}
                    ideaId={idea.id}
                    summaries={idea.reaction_summaries}
                    currentUserReaction={idea.current_user_reaction}
                    toggleReactionAction={toggleReactionAction}
                    compact
                />
            ) : null}

            <details className="mt-3 rounded-2xl border border-white/10 bg-white/[0.055] p-3">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.16em] text-lime-200">
                    Add to itinerary
                </summary>
                <form action={promoteIdeaAction} className="mt-3 space-y-3">
                    <input type="hidden" name="trip_id" value={tripId} />
                    <input type="hidden" name="idea_id" value={idea.id} />
                    <input type="hidden" name="title" value={idea.title} />
                    <input type="hidden" name="category" value="activity" />
                    <input type="hidden" name="status" value="tentative" />
                    <label className="block text-xs font-semibold text-slate-300">
                        Date
                        <input
                            name="item_date"
                            type="date"
                            defaultValue={selectedDateKey}
                            required
                            {...travelInputProps()}
                            className="mt-1 w-full rounded-md border border-white/10 bg-white px-2 py-1.5 text-sm text-slate-900"
                        />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="block text-xs font-semibold text-slate-300">
                            Start
                            <input
                                name="start_time"
                                type="time"
                                defaultValue={getDefaultStartTime(firstTime)}
                                required
                                {...travelInputProps()}
                                className="mt-1 w-full rounded-md border border-white/10 bg-white px-2 py-1.5 text-sm text-slate-900"
                            />
                        </label>
                        <label className="block text-xs font-semibold text-slate-300">
                            End
                            <input
                                name="end_time"
                                type="time"
                                defaultValue={getDefaultEndTime(firstTime)}
                                required
                                {...travelInputProps()}
                                className="mt-1 w-full rounded-md border border-white/10 bg-white px-2 py-1.5 text-sm text-slate-900"
                            />
                        </label>
                    </div>
                    <button
                        type="submit"
                        className="w-full rounded-full bg-lime-300 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.2)] transition hover:bg-lime-200"
                    >
                        Add tentative item
                    </button>
                </form>
            </details>
        </article>
    );
}

export default function SuggestedIdeasPanel({
    tripId,
    ideas,
    selectedDate,
    dayItems = [],
    promoteIdeaAction,
    toggleReactionAction,
}: SuggestedIdeasPanelProps) {
    const selectedDay = getIdeaDayForDate(selectedDate);
    const selectedDateKey = getLocalDateKey(selectedDate);
    const dayLocationText = getDayLocationText(dayItems);
    const dayLocationWindows = getDayLocationWindows(dayItems, selectedDateKey);
    const shouldUseTimedLocationWindows = hasTransportationLocationSplit(
        dayItems,
        selectedDateKey
    );
    const suggestions = ideas.filter(
        (idea) =>
            !idea.is_archived &&
            idea.days_available.includes(selectedDay) &&
            ideaMatchesTimedDayLocation(
                idea,
                dayLocationText,
                dayLocationWindows,
                shouldUseTimedLocationWindows
            )
    );

    return (
        <aside className="border-t border-white/10 bg-[#03030a] p-4 lg:border-l lg:border-t-0">
            <div className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-lime-300">
                        Suggested ideas
                    </p>
                    <h2 className="mt-1 text-lg font-bold text-white">
                        Available on {selectedDay}
                    </h2>
                </div>

                {suggestions.length === 0 ? (
                    <div className="rounded-[1.25rem] border border-dashed border-white/15 bg-white/[0.045] p-4 text-sm text-slate-300">
                        No suggested ideas for this day.
                    </div>
                ) : (
                    <div className="space-y-5">
                        {IDEA_TIME_OF_DAY_OPTIONS.map((time) => {
                            const timeIdeas = suggestions.filter((idea) =>
                                idea.time_of_day.includes(time)
                            );

                            if (timeIdeas.length === 0) return null;

                            return (
                                <section key={time} className="space-y-2">
                                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                                        {time}
                                    </h3>
                                    {timeIdeas.map((idea) => (
                                        <IdeaSuggestionCard
                                            key={idea.id}
                                            idea={idea}
                                            tripId={tripId}
                                            selectedDateKey={selectedDateKey}
                                            promoteIdeaAction={promoteIdeaAction}
                                            toggleReactionAction={toggleReactionAction}
                                        />
                                    ))}
                                </section>
                            );
                        })}

                        {suggestions.some((idea) => idea.time_of_day.length === 0) && (
                            <section className="space-y-2">
                                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Any time
                                </h3>
                                {suggestions
                                    .filter((idea) => idea.time_of_day.length === 0)
                                    .map((idea) => (
                                        <IdeaSuggestionCard
                                            key={idea.id}
                                            idea={idea}
                                            tripId={tripId}
                                            selectedDateKey={selectedDateKey}
                                            promoteIdeaAction={promoteIdeaAction}
                                            toggleReactionAction={toggleReactionAction}
                                        />
                                    ))}
                            </section>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
}
