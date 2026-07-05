"use client";

import {
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
        location?: string | null;
        departure_location?: string | null;
        arrival_location?: string | null;
        formatted_address?: string | null;
    }>;
    promoteIdeaAction: (formData: FormData) => Promise<void>;
};

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
        .replace(/[\u0300-\u036f]/g, "");
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

function IdeaSuggestionCard({
    idea,
    tripId,
    selectedDateKey,
    promoteIdeaAction,
}: {
    idea: TripIdea;
    tripId: string;
    selectedDateKey: string;
    promoteIdeaAction: (formData: FormData) => Promise<void>;
}) {
    const firstTime = idea.time_of_day[0] || "Afternoon";

    return (
        <article className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {idea.category}
            </p>
            <h3 className="mt-1 text-sm font-semibold text-slate-950">
                {idea.title}
            </h3>
            {idea.description && (
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">
                    {idea.description}
                </p>
            )}
            {(idea.location_city || idea.address || idea.formatted_address) && (
                <p className="mt-2 text-xs font-medium text-slate-700">
                    {idea.location_city || idea.address || idea.formatted_address}
                </p>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
                {idea.tags.map((tag) => (
                    <span
                        key={tag}
                        className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700"
                    >
                        {tag}
                    </span>
                ))}
            </div>

            <dl className="mt-3 space-y-2 text-xs text-slate-600">
                <div>
                    <dt className="font-semibold uppercase tracking-wide text-slate-400">
                        Available
                    </dt>
                    <dd>{formatIdeaDayLabel(idea.days_available)}</dd>
                </div>
                <div>
                    <dt className="font-semibold uppercase tracking-wide text-slate-400">
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
                        <dt className="font-semibold uppercase tracking-wide text-slate-400">
                            Tickets
                        </dt>
                        <dd>{idea.ticket_type}</dd>
                    </div>
                )}
                {idea.age_policy && (
                    <div>
                        <dt className="font-semibold uppercase tracking-wide text-slate-400">
                            Age
                        </dt>
                        <dd>{idea.age_policy}</dd>
                    </div>
                )}
            </dl>

            <details className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-800">
                    Add to itinerary
                </summary>
                <form action={promoteIdeaAction} className="mt-3 space-y-3">
                    <input type="hidden" name="trip_id" value={tripId} />
                    <input type="hidden" name="idea_id" value={idea.id} />
                    <input type="hidden" name="title" value={idea.title} />
                    <input type="hidden" name="category" value="activity" />
                    <input type="hidden" name="status" value="tentative" />
                    <label className="block text-xs font-semibold text-slate-600">
                        Date
                        <input
                            name="item_date"
                            type="date"
                            defaultValue={selectedDateKey}
                            required
                            {...travelInputProps()}
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                        />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="block text-xs font-semibold text-slate-600">
                            Start
                            <input
                                name="start_time"
                                type="time"
                                defaultValue={getDefaultStartTime(firstTime)}
                                required
                                {...travelInputProps()}
                                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                            />
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">
                            End
                            <input
                                name="end_time"
                                type="time"
                                defaultValue={getDefaultEndTime(firstTime)}
                                required
                                {...travelInputProps()}
                                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                            />
                        </label>
                    </div>
                    <button
                        type="submit"
                        className="w-full rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
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
}: SuggestedIdeasPanelProps) {
    const selectedDay = getIdeaDayForDate(selectedDate);
    const selectedDateKey = getLocalDateKey(selectedDate);
    const dayLocationText = getDayLocationText(dayItems);
    const suggestions = ideas.filter(
        (idea) =>
            !idea.is_archived &&
            idea.days_available.includes(selectedDay) &&
            ideaMatchesDayLocation(idea, dayLocationText)
    );

    return (
        <aside className="border-t border-slate-200 bg-slate-50 p-4 lg:border-l lg:border-t-0">
            <div className="sticky top-4 space-y-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Suggested ideas
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-950">
                        Available on {selectedDay}
                    </h2>
                </div>

                {suggestions.length === 0 ? (
                    <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
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
                                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                        {time}
                                    </h3>
                                    {timeIdeas.map((idea) => (
                                        <IdeaSuggestionCard
                                            key={idea.id}
                                            idea={idea}
                                            tripId={tripId}
                                            selectedDateKey={selectedDateKey}
                                            promoteIdeaAction={promoteIdeaAction}
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
