"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    AlertTriangle,
    Check,
    ExternalLink,
    Loader2,
    MapPin,
    ShieldCheck,
    X,
} from "lucide-react";
import AnimatedModal from "@/components/AnimatedModal";
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";
import {
    getAssistantPlaceActionLabel,
    type AssistantPlaceActionProposalResponse,
    type AssistantPlaceActionResult,
    type AssistantPlaceActionType,
} from "@/lib/ai/place-action-contract";
import type { AssistantPlaceSavedTarget } from "@/lib/ai/places-contract";
import { FOOD_MEAL_OPTIONS, type FoodMealCategory } from "@/lib/tripFood";
import {
    IDEA_CATEGORIES,
    IDEA_DAYS,
    IDEA_TIME_OF_DAY_OPTIONS,
    toIdeaDayValue,
    toIdeaTimeOfDayValue,
} from "@/lib/tripIdeas";

const FIELD_CLASS =
    "mt-2 w-full rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-lime-300/45 focus:ring-2 focus:ring-lime-300/10";
const CANCELLATION_TIMEOUT_MS = 10_000;
const CANCELLATION_ERROR =
    "We couldn't cancel this review. Please try again.";
const ALREADY_SAVED_CANCELLATION_ERROR =
    "This item was already saved. Cancelling the review will not remove it.";

type Props = {
    tripId: string;
    conversationId: string;
    messageId: string;
    placeId: string;
    actionType: AssistantPlaceActionType;
    onClose: () => void;
    onComplete: (target: AssistantPlaceSavedTarget) => void;
};

function safeResponseError(payload: unknown) {
    if (!payload || typeof payload !== "object") return "This action could not be completed.";
    const message = (payload as { error?: unknown }).error;
    return typeof message === "string" && message.length <= 180
        ? message
        : "This action could not be completed.";
}

function isConfirmedCancellation(payload: unknown) {
    if (!payload || typeof payload !== "object") return false;
    const candidate = payload as { cancelled?: unknown; status?: unknown };
    return (
        candidate.cancelled === true &&
        (candidate.status === "cancelled" ||
            candidate.status === "already_cancelled")
    );
}

function isAlreadySavedCancellationFailure(payload: unknown) {
    return (
        Boolean(payload) &&
        typeof payload === "object" &&
        (payload as { code?: unknown }).code === "action_already_succeeded"
    );
}

export default function PlaceActionReviewModal({
    tripId,
    conversationId,
    messageId,
    placeId,
    actionType,
    onClose,
    onComplete,
}: Props) {
    const panelRef = useRef<HTMLDivElement>(null);
    const cancelButtonRef = useRef<HTMLButtonElement>(null);
    const cancellationTriggerRef = useRef<HTMLElement | null>(null);
    const cancellationPendingRef = useRef(false);
    const [proposal, setProposal] =
        useState<AssistantPlaceActionProposalResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [label, setLabel] = useState("");
    const [notes, setNotes] = useState("");
    const [tripLegId, setTripLegId] = useState("");
    const [ideaCategory, setIdeaCategory] = useState("Other");
    const [availabilityMode, setAvailabilityMode] = useState<
        "flexible" | "specific_time"
    >("flexible");
    const [daysAvailable, setDaysAvailable] = useState<string[]>([]);
    const [timeOfDay, setTimeOfDay] = useState<string[]>([]);
    const [opensAt, setOpensAt] = useState("");
    const [closesAt, setClosesAt] = useState("");
    const [region, setRegion] = useState("");
    const [mealCategories, setMealCategories] = useState<FoodMealCategory[]>([
        "any",
    ]);
    const [itemDate, setItemDate] = useState("");
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");
    const [timezone, setTimezone] = useState(() => {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        } catch {
            return "UTC";
        }
    });
    const [status, setStatus] = useState<"tentative" | "confirmed">(
        "tentative"
    );
    const [audienceMode, setAudienceMode] = useState<"everyone" | "just_me">(
        "everyone"
    );
    const [categoryId, setCategoryId] = useState("");
    const [completedTarget, setCompletedTarget] =
        useState<AssistantPlaceSavedTarget | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        async function openProposal() {
            setIsLoading(true);
            setError(null);
            try {
                const response = await fetch(
                    `/api/trips/${encodeURIComponent(tripId)}/assistant/actions`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            conversationId,
                            messageId,
                            placeId,
                            actionType,
                        }),
                        signal: controller.signal,
                    }
                );
                const payload = (await response.json()) as unknown;
                if (!response.ok) throw new Error(safeResponseError(payload));
                setProposal(payload as AssistantPlaceActionProposalResponse);
            } catch (requestError) {
                if (controller.signal.aborted) return;
                setError(
                    requestError instanceof Error
                        ? requestError.message
                        : "This action could not be opened."
                );
            } finally {
                if (!controller.signal.aborted) setIsLoading(false);
            }
        }
        void openProposal();
        return () => controller.abort();
    }, [actionType, conversationId, messageId, placeId, tripId]);

    useEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = () =>
            Array.from(
                panel.querySelectorAll<HTMLElement>(
                    'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
                )
            ).filter((element) => !element.hasAttribute("aria-hidden"));
        function trapFocus(event: KeyboardEvent) {
            if (event.key !== "Tab") return;
            const elements = focusable();
            if (elements.length === 0) return;
            const first = elements[0];
            const last = elements[elements.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
        panel.addEventListener("keydown", trapFocus);
        return () => panel.removeEventListener("keydown", trapFocus);
    }, [isLoading, proposal]);

    useEffect(() => {
        if (!itemDate) return;
        const hint = proposal?.options.timezoneHints[itemDate];
        if (hint) setTimezone(hint);
    }, [itemDate, proposal]);

    const existingTarget = proposal?.alreadySaved || completedTarget;
    const title = getAssistantPlaceActionLabel(actionType);
    const confirmLabel =
        actionType === "add_itinerary"
            ? "Add to itinerary"
            : actionType === "save_food"
              ? "Save to Eat & Drink"
              : "Save to Things to Do";

    const toggleValue = useCallback(
        (value: string, values: string[], setValues: (values: string[]) => void) => {
            setValues(
                values.includes(value)
                    ? values.filter((item) => item !== value)
                    : [...values, value]
            );
        },
        []
    );

    const fields = useMemo(() => {
        if (actionType === "save_thing_to_do") {
            return {
                label,
                notes,
                category: ideaCategory,
                availabilityMode,
                daysAvailable,
                timeOfDay,
                opensAt: availabilityMode === "specific_time" ? opensAt : "",
                closesAt: availabilityMode === "specific_time" ? closesAt : "",
                tripLegId,
            };
        }
        if (actionType === "save_food") {
            return { label, notes, region, mealCategories };
        }
        return {
            label,
            notes,
            date: itemDate,
            startTime,
            endTime,
            timezone,
            status,
            audienceMode,
            categoryId,
            tripLegId,
        };
    }, [
        actionType,
        audienceMode,
        availabilityMode,
        categoryId,
        closesAt,
        daysAvailable,
        endTime,
        ideaCategory,
        itemDate,
        label,
        mealCategories,
        notes,
        opensAt,
        region,
        startTime,
        status,
        timeOfDay,
        timezone,
        tripLegId,
    ]);

    async function confirmAction(event: React.FormEvent) {
        event.preventDefault();
        if (!proposal?.proposal || isSubmitting) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const response = await fetch(
                `/api/trips/${encodeURIComponent(tripId)}/assistant/actions`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        proposalId: proposal.proposal.id,
                        fields,
                    }),
                }
            );
            const payload = (await response.json()) as
                | AssistantPlaceActionResult
                | { error?: string };
            if (!response.ok || !("savedTarget" in payload)) {
                throw new Error(safeResponseError(payload));
            }
            setCompletedTarget(payload.savedTarget);
            onComplete(payload.savedTarget);
        } catch (requestError) {
            setError(
                requestError instanceof Error
                    ? requestError.message
                    : "This action could not be completed."
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    async function cancelAndClose(
        requestClose: () => void,
        cancellationTrigger?: HTMLElement | null
    ) {
        if (cancellationPendingRef.current) return;
        const proposalId = proposal?.proposal?.id;
        if (!proposalId || completedTarget) {
            requestClose();
            return;
        }

        cancellationPendingRef.current = true;
        cancellationTriggerRef.current =
            cancellationTrigger ||
            (document.activeElement instanceof HTMLElement &&
            panelRef.current?.contains(document.activeElement)
                ? document.activeElement
                : cancelButtonRef.current);
        setIsCancelling(true);
        setError(null);
        const controller = new AbortController();
        const timeout = window.setTimeout(
            () => controller.abort(),
            CANCELLATION_TIMEOUT_MS
        );
        let restoreFocus = false;
        try {
            const response = await fetch(
                `/api/trips/${encodeURIComponent(tripId)}/assistant/actions?proposalId=${encodeURIComponent(proposalId)}`,
                { method: "DELETE", signal: controller.signal }
            );
            const payload = (await response.json().catch(() => null)) as unknown;
            if (!response.ok) {
                if (isAlreadySavedCancellationFailure(payload)) {
                    throw new Error(ALREADY_SAVED_CANCELLATION_ERROR);
                }
                throw new Error(CANCELLATION_ERROR);
            }
            if (!isConfirmedCancellation(payload)) {
                throw new Error(CANCELLATION_ERROR);
            }
            requestClose();
        } catch (requestError) {
            setError(
                requestError instanceof Error &&
                    requestError.message === ALREADY_SAVED_CANCELLATION_ERROR
                    ? ALREADY_SAVED_CANCELLATION_ERROR
                    : CANCELLATION_ERROR
            );
            restoreFocus = true;
        } finally {
            window.clearTimeout(timeout);
            cancellationPendingRef.current = false;
            setIsCancelling(false);
            if (restoreFocus) {
                window.requestAnimationFrame(() => {
                    const focusTarget = cancellationTriggerRef.current;
                    if (focusTarget?.isConnected && !focusTarget.hasAttribute("disabled")) {
                        focusTarget.focus();
                        return;
                    }
                    cancelButtonRef.current?.focus();
                });
            }
        }
    }

    return (
        <AnimatedModal
            onClose={onClose}
            panelClassName="max-w-2xl sm:max-h-[92vh]"
            labelledBy="assistant-place-action-title"
            onRequestClose={(requestClose) => void cancelAndClose(requestClose)}
        >
            {({ requestClose }) => (
                <div
                    ref={panelRef}
                    className="max-h-[92vh] overflow-y-auto bg-[#090611] p-5 text-white sm:p-7"
                >
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-300">
                                Review before saving
                            </p>
                            <h2
                                id="assistant-place-action-title"
                                className="mt-2 text-2xl font-black sm:text-3xl"
                            >
                                {title}
                            </h2>
                            <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                                Nothing is added until you review the fields and press the
                                final confirmation button.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={(event) =>
                                void cancelAndClose(requestClose, event.currentTarget)
                            }
                            disabled={isCancelling || isSubmitting}
                            className="vaivia-modal-close"
                            aria-label="Close review"
                            autoFocus
                        >
                            {isCancelling ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                                <X className="h-4 w-4" aria-hidden="true" />
                            )}
                        </button>
                    </div>

                    {isLoading ? (
                        <div className="mt-8 flex min-h-52 items-center justify-center gap-3 text-sm font-bold text-slate-400">
                            <Loader2 className="h-5 w-5 animate-spin text-lime-300" aria-hidden="true" />
                            Validating this recommendation…
                        </div>
                    ) : null}

                    {!isLoading && proposal?.preview ? (
                        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.055] p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-black text-white">
                                        {proposal.preview.name}
                                    </p>
                                    <p className="mt-1 text-xs font-bold text-lime-200">
                                        {proposal.preview.category}
                                    </p>
                                </div>
                                <span className="shrink-0 text-[10px] font-black text-slate-300">
                                    Google Maps
                                </span>
                            </div>
                            {proposal.preview.address ? (
                                <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-400">
                                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    {proposal.preview.address}
                                </p>
                            ) : null}
                            <a
                                href={proposal.preview.mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-3 inline-flex items-center gap-2 text-xs font-black text-lime-200 underline underline-offset-4"
                            >
                                View live details on Google Maps
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            </a>
                        </section>
                    ) : null}

                    {!isLoading && proposal?.previewUnavailable && !existingTarget ? (
                        <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm leading-6 text-amber-100">
                            Live Google Maps details are unavailable right now. You can
                            still enter your own planning label and fields, or cancel.
                        </div>
                    ) : null}

                    {existingTarget ? (
                        <div className="mt-6 rounded-2xl border border-lime-300/25 bg-lime-300/[0.08] p-5">
                            <div className="flex items-start gap-3">
                                <Check className="mt-0.5 h-5 w-5 text-lime-300" aria-hidden="true" />
                                <div>
                                    <p className="font-black">
                                        {completedTarget ? "Saved successfully" : "Already saved"}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-300">
                                        {existingTarget.label}
                                    </p>
                                    <Link
                                        href={existingTarget.href}
                                        className="mt-3 inline-flex text-sm font-black text-lime-200 underline underline-offset-4"
                                    >
                                        Open saved item
                                    </Link>
                                </div>
                            </div>
                            <div className="mt-5 flex justify-end">
                                <button
                                    type="button"
                                    onClick={requestClose}
                                    className="rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    ) : null}

                    {!isLoading && proposal?.proposal && !completedTarget ? (
                        <form onSubmit={confirmAction} className="mt-6 space-y-5">
                            <div>
                                <label htmlFor="assistant-place-label" className="text-sm font-black">
                                    Your label <span className="text-lime-300">*</span>
                                </label>
                                <input
                                    id="assistant-place-label"
                                    value={label}
                                    onChange={(event) => setLabel(event.target.value.slice(0, 160))}
                                    maxLength={160}
                                    required
                                    placeholder="Enter your own label"
                                    className={FIELD_CLASS}
                                />
                                <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
                                    VAIVIA does not copy the Google place name into your saved item.
                                </p>
                            </div>

                            {actionType === "save_thing_to_do" ? (
                                <>
                                    <div>
                                        <label htmlFor="assistant-idea-category" className="text-sm font-black">
                                            Type
                                        </label>
                                        <select
                                            id="assistant-idea-category"
                                            value={ideaCategory}
                                            onChange={(event) => setIdeaCategory(event.target.value)}
                                            className={FIELD_CLASS}
                                        >
                                            {IDEA_CATEGORIES.map((category) => (
                                                <option key={category} value={category} className="bg-slate-950">
                                                    {category}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <fieldset>
                                        <legend className="text-sm font-black">Availability</legend>
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            {(["flexible", "specific_time"] as const).map((mode) => (
                                                <button
                                                    key={mode}
                                                    type="button"
                                                    onClick={() => setAvailabilityMode(mode)}
                                                    className={`rounded-xl border px-3 py-2.5 text-xs font-black ${
                                                        availabilityMode === mode
                                                            ? "border-lime-300 bg-lime-300 text-slate-950"
                                                            : "border-white/10 bg-white/[0.05] text-slate-200"
                                                    }`}
                                                >
                                                    {mode === "flexible" ? "Flexible" : "Specific time"}
                                                </button>
                                            ))}
                                        </div>
                                    </fieldset>
                                    {availabilityMode === "flexible" ? (
                                        <div className="grid gap-5 sm:grid-cols-2">
                                            <fieldset>
                                                <legend className="text-sm font-black">Days</legend>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {IDEA_DAYS.map((day) => {
                                                        const value = toIdeaDayValue(day);
                                                        return (
                                                            <ToggleChip
                                                                key={day}
                                                                label={day.slice(0, 3)}
                                                                selected={daysAvailable.includes(value)}
                                                                onClick={() =>
                                                                    toggleValue(value, daysAvailable, setDaysAvailable)
                                                                }
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </fieldset>
                                            <fieldset>
                                                <legend className="text-sm font-black">Time of day</legend>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {IDEA_TIME_OF_DAY_OPTIONS.map((time) => {
                                                        const value = toIdeaTimeOfDayValue(time);
                                                        return (
                                                            <ToggleChip
                                                                key={time}
                                                                label={time}
                                                                selected={timeOfDay.includes(value)}
                                                                onClick={() => toggleValue(value, timeOfDay, setTimeOfDay)}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </fieldset>
                                        </div>
                                    ) : (
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <TimeField label="Opening time" value={opensAt} onChange={setOpensAt} required />
                                            <TimeField label="Closing time" value={closesAt} onChange={setClosesAt} required />
                                        </div>
                                    )}
                                </>
                            ) : null}

                            {actionType === "save_food" ? (
                                <>
                                    <div>
                                        <label htmlFor="assistant-food-region" className="text-sm font-black">
                                            Destination or area
                                        </label>
                                        <input
                                            id="assistant-food-region"
                                            value={region}
                                            onChange={(event) => setRegion(event.target.value.slice(0, 160))}
                                            maxLength={160}
                                            placeholder="Optional user-authored area"
                                            className={FIELD_CLASS}
                                        />
                                    </div>
                                    <fieldset>
                                        <legend className="text-sm font-black">Good for</legend>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {FOOD_MEAL_OPTIONS.map((option) => (
                                                <ToggleChip
                                                    key={option.value}
                                                    label={option.label}
                                                    selected={mealCategories.includes(option.value)}
                                                    onClick={() => {
                                                        if (option.value === "any") {
                                                            setMealCategories(["any"]);
                                                            return;
                                                        }
                                                        const next = mealCategories.includes(option.value)
                                                            ? mealCategories.filter((item) => item !== option.value)
                                                            : [
                                                                  ...mealCategories.filter((item) => item !== "any"),
                                                                  option.value,
                                                              ];
                                                        setMealCategories(next.length > 0 ? next : ["any"]);
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </fieldset>
                                </>
                            ) : null}

                            {actionType === "add_itinerary" ? (
                                <>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div>
                                            <label htmlFor="assistant-itinerary-date" className="text-sm font-black">
                                                Date <span className="text-lime-300">*</span>
                                            </label>
                                            <DateInput
                                                id="assistant-itinerary-date"
                                                value={itemDate}
                                                onChange={(event) => setItemDate(event.currentTarget.value)}
                                                required
                                                className={FIELD_CLASS}
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="assistant-timezone" className="text-sm font-black">
                                                Timezone <span className="text-lime-300">*</span>
                                            </label>
                                            <input
                                                id="assistant-timezone"
                                                value={timezone}
                                                onChange={(event) => setTimezone(event.target.value.slice(0, 80))}
                                                maxLength={80}
                                                required
                                                className={FIELD_CLASS}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <TimeField label="Start time" value={startTime} onChange={setStartTime} />
                                        <TimeField label="End time" value={endTime} onChange={setEndTime} />
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div>
                                            <label htmlFor="assistant-itinerary-category" className="text-sm font-black">
                                                Category
                                            </label>
                                            <select
                                                id="assistant-itinerary-category"
                                                value={categoryId}
                                                onChange={(event) => setCategoryId(event.target.value)}
                                                className={FIELD_CLASS}
                                            >
                                                <option value="" className="bg-slate-950">Activity</option>
                                                {proposal.options.itineraryCategories.map((category) => (
                                                    <option key={category.id} value={category.id} className="bg-slate-950">
                                                        {category.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label htmlFor="assistant-itinerary-status" className="text-sm font-black">
                                                Status
                                            </label>
                                            <select
                                                id="assistant-itinerary-status"
                                                value={status}
                                                onChange={(event) =>
                                                    setStatus(event.target.value === "confirmed" ? "confirmed" : "tentative")
                                                }
                                                className={FIELD_CLASS}
                                            >
                                                <option value="tentative" className="bg-slate-950">Tentative</option>
                                                <option value="confirmed" className="bg-slate-950">Confirmed</option>
                                            </select>
                                        </div>
                                    </div>
                                    <fieldset>
                                        <legend className="text-sm font-black">Who is this for?</legend>
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            {(["everyone", "just_me"] as const).map((mode) => (
                                                <button
                                                    key={mode}
                                                    type="button"
                                                    onClick={() => setAudienceMode(mode)}
                                                    className={`rounded-xl border px-3 py-2.5 text-xs font-black ${
                                                        audienceMode === mode
                                                            ? "border-lime-300 bg-lime-300 text-slate-950"
                                                            : "border-white/10 bg-white/[0.05] text-slate-200"
                                                    }`}
                                                >
                                                    {mode === "everyone" ? "Everyone" : "Just me"}
                                                </button>
                                            ))}
                                        </div>
                                    </fieldset>
                                </>
                            ) : null}

                            {(actionType === "save_thing_to_do" || actionType === "add_itinerary") &&
                            proposal.options.tripLegs.length > 0 ? (
                                <div>
                                    <label htmlFor="assistant-trip-leg" className="text-sm font-black">
                                        Trip leg / destination
                                    </label>
                                    <select
                                        id="assistant-trip-leg"
                                        value={tripLegId}
                                        onChange={(event) => setTripLegId(event.target.value)}
                                        className={FIELD_CLASS}
                                    >
                                        <option value="" className="bg-slate-950">Use trip-wide visibility</option>
                                        {proposal.options.tripLegs.map((leg) => (
                                            <option key={leg.id} value={leg.id} className="bg-slate-950">
                                                {leg.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ) : null}

                            <div>
                                <label htmlFor="assistant-place-notes" className="text-sm font-black">
                                    Notes
                                </label>
                                <textarea
                                    id="assistant-place-notes"
                                    value={notes}
                                    onChange={(event) => setNotes(event.target.value.slice(0, 2000))}
                                    maxLength={2000}
                                    rows={3}
                                    placeholder="Optional planning notes"
                                    className={FIELD_CLASS}
                                />
                            </div>

                            {error ? (
                                <div role="alert" className="flex gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm text-amber-100">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                    {error}
                                </div>
                            ) : null}

                            <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
                                <button
                                    ref={cancelButtonRef}
                                    type="button"
                                    onClick={(event) =>
                                        void cancelAndClose(requestClose, event.currentTarget)
                                    }
                                    disabled={isSubmitting || isCancelling}
                                    className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting || isCancelling || !label.trim()}
                                    className="inline-flex items-center justify-center gap-2 rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                    {isSubmitting ? (
                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                    ) : (
                                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                                    )}
                                    {confirmLabel}
                                </button>
                            </div>
                        </form>
                    ) : null}

                    {!isLoading && !proposal && error ? (
                        <div role="alert" className="mt-6 flex gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm text-amber-100">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            {error}
                        </div>
                    ) : null}
                </div>
            )}
        </AnimatedModal>
    );
}

function ToggleChip({
    label,
    selected,
    onClick,
}: {
    label: string;
    selected: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onClick}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-black transition ${
                selected
                    ? "border-lime-300 bg-lime-300 text-slate-950"
                    : "border-white/10 bg-white/[0.055] text-slate-300"
            }`}
        >
            {label}
        </button>
    );
}

function TimeField({
    label,
    value,
    onChange,
    required = false,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    required?: boolean;
}) {
    const id = `assistant-${label.toLowerCase().replaceAll(" ", "-")}`;
    return (
        <div>
            <label htmlFor={id} className="text-sm font-black">
                {label} {required ? <span className="text-lime-300">*</span> : null}
            </label>
            <TimeInput
                id={id}
                value={value}
                onChange={(event) => onChange(event.currentTarget.value)}
                required={required}
                className={FIELD_CLASS}
            />
        </div>
    );
}
