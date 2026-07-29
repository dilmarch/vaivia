"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";
import type { IdeaTimeOfDay, TripIdea } from "@/lib/tripIdeas";

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

function travelInputProps() {
    return {
        autoComplete: "off",
        "data-form-type": "other",
        "data-lpignore": "true",
        "data-1p-ignore": "true",
    };
}

export default function IdeaToItineraryForm({
    idea,
    tripId,
    defaultDate,
    action,
    preserveItineraryView = false,
    onSaved,
    compact = false,
}: {
    idea: TripIdea;
    tripId: string;
    defaultDate: string;
    action: (formData: FormData) => Promise<void>;
    preserveItineraryView?: boolean;
    onSaved?: () => void;
    compact?: boolean;
}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const firstTime = idea.time_of_day[0] || "Afternoon";
    const returnTo = useMemo(() => {
        const query = searchParams.toString();
        return `${pathname || ""}${query ? `?${query}` : ""}`;
    }, [pathname, searchParams]);

    async function handleAction(formData: FormData) {
        if (preserveItineraryView) {
            formData.set("preserve_itinerary_view", "true");
        }

        await action(formData);
        onSaved?.();
    }

    const labelClass = compact
        ? "block text-[11px] font-semibold text-slate-300"
        : "block text-sm font-semibold text-slate-200";
    const inputClass = compact
        ? "mt-1 w-full rounded-md border border-white/10 bg-white px-2 py-1 text-xs text-slate-900"
        : "mt-2 w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-slate-900";

    return (
        <form action={handleAction} className={compact ? "space-y-2" : "space-y-4"}>
            <input type="hidden" name="trip_id" value={tripId} />
            <input type="hidden" name="return_to" value={returnTo} />
            <input type="hidden" name="idea_id" value={idea.id} />
            <input type="hidden" name="title" value={idea.title} />
            <input type="hidden" name="category" value="activity" />
            <input type="hidden" name="status" value="tentative" />
            <input
                type="hidden"
                name="location"
                value={
                    idea.location ||
                    idea.address ||
                    idea.formatted_address ||
                    idea.location_city ||
                    ""
                }
            />
            <input
                type="hidden"
                name="formatted_address"
                value={idea.formatted_address || ""}
            />
            <input
                type="hidden"
                name="google_place_id"
                value={idea.google_place_id || ""}
            />
            <input type="hidden" name="location_lat" value={idea.location_lat ?? ""} />
            <input type="hidden" name="location_lng" value={idea.location_lng ?? ""} />
            <input
                type="hidden"
                name="location_website"
                value={idea.location_website || ""}
            />
            <input
                type="hidden"
                name="ticket_website"
                value={idea.ticket_website || ""}
            />
            <input
                type="hidden"
                name="notes"
                value={idea.description || idea.other_notes || ""}
            />
            {idea.is_private ? (
                <input type="hidden" name="is_private" value="true" />
            ) : null}

            <label className={labelClass}>
                Date
                <DateInput
                    name="item_date"
                    defaultValue={defaultDate}
                    required
                    {...travelInputProps()}
                    className={inputClass}
                />
            </label>
            <div className="grid grid-cols-2 gap-2">
                <label className={labelClass}>
                    Start
                    <TimeInput
                        name="start_time"
                        defaultValue={getDefaultStartTime(firstTime)}
                        required
                        {...travelInputProps()}
                        className={inputClass}
                    />
                </label>
                <label className={labelClass}>
                    End
                    <TimeInput
                        name="end_time"
                        defaultValue={getDefaultEndTime(firstTime)}
                        required
                        {...travelInputProps()}
                        className={inputClass}
                    />
                </label>
            </div>
            <button
                type="submit"
                className="w-full rounded-full bg-lime-300 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.2)] transition hover:bg-lime-200"
            >
                Add to itinerary
            </button>
        </form>
    );
}
