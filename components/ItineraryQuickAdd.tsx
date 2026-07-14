"use client";

import Link from "next/link";
import {
    BedDouble,
    CalendarCheck,
    Lightbulb,
    Map,
    Minus,
    PiggyBank,
    Plus,
    Route,
    Utensils,
    X,
    type LucideIcon,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createAccommodation } from "@/app/actions/accommodations";
import { AccommodationCreateModal } from "@/components/accommodations/AccommodationManager";
import AnimatedModal from "@/components/AnimatedModal";
import FeatureSuggestionModal from "@/components/FeatureSuggestionModal";
import { IdeaForm } from "@/components/IdeasTab";
import ItineraryItemForm from "@/components/ItineraryItemForm";
import TransportationForm from "@/components/TransportationForm";
import type { UserCategory } from "@/lib/itineraryCategories";
import {
    completeOnboarding,
    type OnboardingProgress,
} from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/client";
import type { TripAudienceOption } from "@/lib/tripAudience";
import type { TransportationTravelerOptions } from "@/lib/travelers";

type ItineraryQuickAddProps = {
    tripId: string;
    createItineraryAction: (formData: FormData) => Promise<void>;
    createTransportationAction: (formData: FormData) => Promise<void>;
    createIdeaAction?: (formData: FormData) => Promise<void>;
    defaultDate?: string;
    categories?: UserCategory[];
    travelerOptions?: TransportationTravelerOptions;
    audienceOptions?: TripAudienceOption[];
    currentUserTripMemberId?: string | null;
    initialAction?: QuickAddInitialAction | null;
    onboardingProgress?: OnboardingProgress | null;
};

type QuickAddInitialAction = "transportation" | "scheduled" | "idea";

type TourSection = {
    label: string;
    title: string;
    description: string;
    href: string;
    icon: LucideIcon;
};

export default function ItineraryQuickAdd({
    tripId,
    createItineraryAction,
    createTransportationAction,
    createIdeaAction,
    defaultDate = "",
    categories = [],
    travelerOptions = { users: [], familyMembers: [] },
    audienceOptions = [],
    currentUserTripMemberId = null,
    initialAction = null,
    onboardingProgress = null,
}: ItineraryQuickAddProps) {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isOpen, setIsOpen] = useState(false);
    const [itemOpenSignal, setItemOpenSignal] = useState(0);
    const [itemSubmitLabel, setItemSubmitLabel] = useState(
        "Add scheduled activity/event"
    );
    const [isTransportationOpen, setIsTransportationOpen] = useState(false);
    const [isAccommodationOpen, setIsAccommodationOpen] = useState(false);
    const [isIdeaOpen, setIsIdeaOpen] = useState(false);
    const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
    const [isOnboardingPromptHidden, setIsOnboardingPromptHidden] =
        useState(false);
    const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(
        () =>
            onboardingProgress?.status === "in_progress" &&
            onboardingProgress.current_step === "complete"
    );
    const [activeTourIndex, setActiveTourIndex] = useState<number | null>(null);
    const quickAddRef = useRef<HTMLDivElement | null>(null);
    const handledInitialActionRef = useRef<string | null>(null);
    const tourSections: TourSection[] = [
        {
            label: "Overview",
            title: "Trip landing page",
            description:
                "Start here for the trip snapshot: dates, countdown, people, invite controls, and quick links into every trip app.",
            href: `/trips/${tripId}`,
            icon: Map,
        },
        {
            label: "Itinerary",
            title: "Scheduled plans",
            description:
                "Use this for anything happening on a date: activities, events, tickets, reservations, and transportation you have committed to.",
            href: `/trips/${tripId}?tab=itinerary`,
            icon: CalendarCheck,
        },
        {
            label: "Ideas",
            title: "Maybe-list magic",
            description:
                "Save places, activities, and loose possibilities without locking them onto the itinerary yet.",
            href: `/trips/${tripId}?tab=ideas`,
            icon: Lightbulb,
        },
        {
            label: "Journey",
            title: "Transportation planning",
            description:
                "Compare routes, flights, trains, ferry ideas, round trips, pros and cons, and then add the winner to your itinerary.",
            href: `/trips/${tripId}?tab=journey-planning`,
            icon: Route,
        },
        {
            label: "Budget",
            title: "Money without the mess",
            description:
                "Track trip budgets, expenses, split costs, and personal purchases so group travel stays clearer.",
            href: `/trips/${tripId}/budget`,
            icon: PiggyBank,
        },
        {
            label: "Stays",
            title: "Accommodations",
            description:
                "Keep hotels, home stays, check-in details, addresses, and booking notes together.",
            href: `/trips/${tripId}/accommodations`,
            icon: BedDouble,
        },
        {
            label: "Food",
            title: "Restaurants and things to try",
            description:
                "Collect restaurants, dishes, cafes, and food ideas so the good stuff does not disappear into a chat thread.",
            href: `/trips/${tripId}/food`,
            icon: Utensils,
        },
    ];
    const activeTourSection =
        activeTourIndex === null ? null : tourSections[activeTourIndex] || null;
    const shouldShowFirstItemPrompt =
        onboardingProgress?.status === "in_progress" &&
        onboardingProgress.current_step === "add_first_item" &&
        !isOnboardingPromptHidden;

    useEffect(() => {
        setIsCompletionModalOpen(
            onboardingProgress?.status === "in_progress" &&
                onboardingProgress.current_step === "complete"
        );
    }, [onboardingProgress]);

    useEffect(() => {
        if (!isOpen) return;

        function closeOnOutsideClick(event: MouseEvent) {
            if (
                quickAddRef.current &&
                !quickAddRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        }

        document.addEventListener("mousedown", closeOnOutsideClick);
        return () => {
            document.removeEventListener("mousedown", closeOnOutsideClick);
        };
    }, [isOpen]);

    function openItineraryForm(label: string) {
        setItemSubmitLabel(label);
        setItemOpenSignal((signal) => signal + 1);
        setIsOpen(false);
    }

    async function finishOnboarding({ showAround = false } = {}) {
        if (onboardingProgress) {
            const supabase = createClient();
            const { error } = await completeOnboarding(
                supabase,
                onboardingProgress.user_id
            );
            if (error) {
                console.warn("Could not complete onboarding:", {
                    message: error.message,
                    code: error.code,
                    details: error.details,
                });
            }
        }

        setIsCompletionModalOpen(false);
        if (showAround) {
            setActiveTourIndex(0);
            return;
        }
        router.refresh();
    }

    function closeTour() {
        setActiveTourIndex(null);
        router.refresh();
    }

    useEffect(() => {
        if (!initialAction) return;
        const actionKey = `${pathname || ""}:${initialAction}:${searchParams.toString()}`;
        if (handledInitialActionRef.current === actionKey) return;
        handledInitialActionRef.current = actionKey;

        if (initialAction === "transportation") {
            setIsTransportationOpen(true);
        } else if (initialAction === "idea") {
            if (createIdeaAction) setIsIdeaOpen(true);
        } else {
            openItineraryForm("Add scheduled activity/event");
        }

        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.delete("add");
        const nextQuery = nextParams.toString();
        router.replace(`${pathname || ""}${nextQuery ? `?${nextQuery}` : ""}`, {
            scroll: false,
        });
    }, [createIdeaAction, initialAction, pathname, router, searchParams]);

    return (
        <>
            <ItineraryItemForm
                tripId={tripId}
                submitAction={createItineraryAction}
                submitLabel={itemSubmitLabel}
                showLauncher={false}
                openSignal={itemOpenSignal}
                defaultDate={defaultDate}
                categories={categories}
                audienceOptions={audienceOptions}
                currentUserTripMemberId={currentUserTripMemberId}
            />
            <TransportationForm
                tripId={tripId}
                submitAction={createTransportationAction}
                isOpen={isTransportationOpen}
                onClose={() => setIsTransportationOpen(false)}
                defaultDate={defaultDate}
                travelerOptions={travelerOptions}
                audienceOptions={audienceOptions}
                currentUserTripMemberId={currentUserTripMemberId}
            />
            {isAccommodationOpen && (
                <AccommodationCreateModal
                    tripId={tripId}
                    createAction={createAccommodation}
                    audienceOptions={audienceOptions}
                    currentUserTripMemberId={currentUserTripMemberId}
                    onClose={() => setIsAccommodationOpen(false)}
                />
            )}
            {isIdeaOpen && createIdeaAction && (
                <AnimatedModal
                    onClose={() => setIsIdeaOpen(false)}
                    panelClassName="max-w-2xl"
                    labelledBy="quick-add-idea-title"
                >
                    {({ requestClose }) => (
                        <>
                        <div className="vaivia-modal-header flex items-start justify-between gap-4">
                            <div>
                                <p className="vaivia-modal-eyebrow">
                                    Quick add
                                </p>
                                <h2
                                    id="quick-add-idea-title"
                                    className="vaivia-modal-title"
                                >
                                    Add activity idea
                                </h2>
                                <p className="mt-2 text-sm text-slate-300">
                                    Save a loose idea for this trip.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={requestClose}
                                className="vaivia-modal-close"
                                aria-label="Close add activity idea"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                        <div className="vaivia-modal-body">
                            <IdeaForm
                                tripId={tripId}
                                action={createIdeaAction}
                                onCancel={requestClose}
                            />
                        </div>
                        </>
                    )}
                </AnimatedModal>
            )}
            {isSuggestionOpen ? (
                <FeatureSuggestionModal onClose={() => setIsSuggestionOpen(false)} />
            ) : null}
            {isCompletionModalOpen ? (
                <AnimatedModal
                    onClose={() => void finishOnboarding()}
                    panelClassName="max-w-lg"
                    labelledBy="onboarding-complete-title"
                >
                    {({ requestClose }) => (
                        <>
                            <div className="vaivia-modal-header">
                                <p className="vaivia-modal-eyebrow">
                                    You&apos;re ready
                                </p>
                                <h2
                                    id="onboarding-complete-title"
                                    className="vaivia-modal-title"
                                >
                                    Your trip is underway.
                                </h2>
                                <p className="vaivia-modal-subtitle">
                                    Keep planning here, or explore budget, stays,
                                    food, and journey options whenever you need
                                    them.
                                </p>
                            </div>
                            <div className="vaivia-modal-footer grid gap-2 sm:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        requestClose();
                                        void finishOnboarding();
                                    }}
                                    className="rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-lime-200"
                                >
                                    Continue planning
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        requestClose();
                                        void finishOnboarding({ showAround: true });
                                    }}
                                    className="rounded-full border border-white/10 px-5 py-3 text-sm font-black text-slate-200 transition hover:bg-white/[0.08]"
                                >
                                    Show me around
                                </button>
                            </div>
                        </>
                    )}
                </AnimatedModal>
            ) : null}
            {activeTourSection ? (
                <AnimatedModal
                    onClose={closeTour}
                    panelClassName="max-w-xl"
                    labelledBy="trip-section-tour-title"
                >
                    {({ requestClose }) => {
                        const Icon = activeTourSection.icon;
                        const currentTourIndex = activeTourIndex ?? 0;
                        const isFirst = currentTourIndex === 0;
                        const isLast =
                            currentTourIndex === tourSections.length - 1;

                        return (
                            <>
                                <div className="vaivia-modal-header">
                                    <div className="flex items-start gap-4">
                                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-lime-300/25 bg-lime-300/10 text-lime-200 shadow-[0_0_26px_rgba(var(--vaivia-neon-rgb),0.16)]">
                                            <Icon
                                                className="h-6 w-6"
                                                aria-hidden="true"
                                            />
                                        </span>
                                        <div>
                                            <p className="vaivia-modal-eyebrow">
                                                Trip tour {currentTourIndex + 1} of{" "}
                                                {tourSections.length}
                                            </p>
                                            <h2
                                                id="trip-section-tour-title"
                                                className="vaivia-modal-title"
                                            >
                                                {activeTourSection.title}
                                            </h2>
                                            <p className="vaivia-modal-subtitle">
                                                {activeTourSection.description}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="vaivia-modal-body space-y-4">
                                    <div className="grid gap-2 sm:grid-cols-7">
                                        {tourSections.map((section, index) => {
                                            const SectionIcon = section.icon;
                                            const isActive =
                                                index === currentTourIndex;

                                            return (
                                                <button
                                                    key={section.label}
                                                    type="button"
                                                    onClick={() =>
                                                        setActiveTourIndex(index)
                                                    }
                                                    className={`flex min-h-14 items-center justify-center rounded-2xl border transition ${
                                                        isActive
                                                            ? "border-lime-300/45 bg-lime-300 text-slate-950"
                                                            : "border-white/10 bg-white/[0.05] text-slate-300 hover:border-lime-300/30 hover:bg-white/[0.1] hover:text-lime-100"
                                                    }`}
                                                    aria-label={`View ${section.label} in tour`}
                                                >
                                                    <SectionIcon
                                                        className="h-5 w-5"
                                                        aria-hidden="true"
                                                    />
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm font-semibold leading-6 text-slate-300">
                                        {activeTourSection.label}: use this section
                                        whenever you want to{" "}
                                        {activeTourSection.description
                                            .charAt(0)
                                            .toLowerCase() +
                                            activeTourSection.description.slice(1)}
                                    </p>
                                </div>
                                <div className="vaivia-modal-footer flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setActiveTourIndex((current) =>
                                                    Math.max((current || 0) - 1, 0)
                                                )
                                            }
                                            disabled={isFirst}
                                            className="rounded-full border border-white/10 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            Back
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (isLast) {
                                                    requestClose();
                                                    closeTour();
                                                    return;
                                                }
                                                setActiveTourIndex((current) =>
                                                    Math.min(
                                                        (current || 0) + 1,
                                                        tourSections.length - 1
                                                    )
                                                );
                                            }}
                                            className="rounded-full bg-lime-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-lime-200"
                                        >
                                            {isLast ? "Finish tour" : "Next"}
                                        </button>
                                    </div>
                                    <Link
                                        href={activeTourSection.href}
                                        onClick={() => {
                                            requestClose();
                                            setActiveTourIndex(null);
                                        }}
                                        className="rounded-full border border-lime-300/25 bg-lime-300/10 px-4 py-2.5 text-center text-sm font-black text-lime-100 transition hover:bg-lime-300 hover:text-slate-950"
                                    >
                                        Open {activeTourSection.label}
                                    </Link>
                                </div>
                            </>
                        );
                    }}
                </AnimatedModal>
            ) : null}

            <div
                ref={quickAddRef}
                className="fixed bottom-[calc(1rem+var(--safe-area-bottom))] left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center md:bottom-6 md:left-auto md:right-6 md:z-40 md:translate-x-0 md:items-end"
            >
                {shouldShowFirstItemPrompt ? (
                    <div className="mb-3 w-[min(92vw,28rem)] rounded-[1.5rem] border border-lime-300/25 bg-slate-950/90 p-4 text-white shadow-2xl shadow-black/40 backdrop-blur-xl md:w-96">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-lime-200">
                                    First plan
                                </p>
                                <h2 className="mt-1 text-lg font-black">
                                    What do you know so far?
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsOnboardingPromptHidden(true)}
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-slate-300 transition hover:bg-white/10 hover:text-white"
                                aria-label="Hide onboarding prompt"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                        <div className="mt-4 grid gap-2">
                            <button
                                type="button"
                                onClick={() =>
                                    openItineraryForm(
                                        "Add scheduled activity/event"
                                    )
                                }
                                className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-left transition hover:border-lime-300/35 hover:bg-white/[0.1]"
                            >
                                <span className="block text-sm font-black">
                                    Add a plan
                                </span>
                                <span className="mt-0.5 block text-xs font-semibold text-slate-400">
                                    Something happening on a date
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsTransportationOpen(true);
                                    setIsOpen(false);
                                }}
                                className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-left transition hover:border-lime-300/35 hover:bg-white/[0.1]"
                            >
                                <span className="block text-sm font-black">
                                    Add transportation
                                </span>
                                <span className="mt-0.5 block text-xs font-semibold text-slate-400">
                                    A flight, train, drive, or other journey
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (createIdeaAction) setIsIdeaOpen(true);
                                    setIsOpen(false);
                                }}
                                disabled={!createIdeaAction}
                                className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-left transition hover:border-lime-300/35 hover:bg-white/[0.1] disabled:opacity-50"
                            >
                                <span className="block text-sm font-black">
                                    Save an idea
                                </span>
                                <span className="mt-0.5 block text-xs font-semibold text-slate-400">
                                    Somewhere you might go
                                </span>
                            </button>
                        </div>
                    </div>
                ) : null}
                {isOpen && (
                    <div className="mb-3 flex flex-col items-center gap-2 md:items-end">
                        <Link
                            href="/trips/new"
                            className="animate-vaivia-add-fan-out vaivia-quick-add-bubble block rounded-full border border-white/30 bg-lime-300 px-5 py-2.5 text-center text-sm font-bold text-slate-950 transition hover:-translate-y-0.5 hover:bg-lime-200 md:text-right"
                        >
                            Add trip
                        </Link>
                        <button
                            type="button"
                            onClick={() => {
                                setIsTransportationOpen(true);
                                setIsOpen(false);
                            }}
                            className="animate-vaivia-add-fan-out vaivia-quick-add-bubble block rounded-full border border-white/30 bg-lime-300 px-5 py-2.5 text-center text-sm font-bold text-slate-950 transition hover:-translate-y-0.5 hover:bg-lime-200 md:text-right"
                        >
                            Add transportation
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setIsAccommodationOpen(true);
                                setIsOpen(false);
                            }}
                            className="animate-vaivia-add-fan-out vaivia-quick-add-bubble block rounded-full border border-white/30 bg-lime-300 px-5 py-2.5 text-center text-sm font-bold text-slate-950 transition hover:-translate-y-0.5 hover:bg-lime-200 md:text-right"
                        >
                            Add accommodation
                        </button>
                        <Link
                            href={`/trips/${tripId}/budget/expenses?addExpense=1`}
                            className="animate-vaivia-add-fan-out vaivia-quick-add-bubble block rounded-full border border-white/30 bg-lime-300 px-5 py-2.5 text-center text-sm font-bold text-slate-950 transition hover:-translate-y-0.5 hover:bg-lime-200 md:text-right"
                            onClick={() => setIsOpen(false)}
                        >
                            Add expense
                        </Link>
                        <Link
                            href={`/trips/${tripId}/food?addFood=1`}
                            onClick={() => setIsOpen(false)}
                            className="animate-vaivia-add-fan-out vaivia-quick-add-bubble block rounded-full border border-white/30 bg-lime-300 px-5 py-2.5 text-center text-sm font-bold text-slate-950 transition hover:-translate-y-0.5 hover:bg-lime-200 md:text-right"
                        >
                            Add food or restaurant
                        </Link>
                        <button
                            type="button"
                            onClick={() =>
                                openItineraryForm("Add scheduled activity/event")
                            }
                            className="animate-vaivia-add-fan-out vaivia-quick-add-bubble block rounded-full border border-white/30 bg-lime-300 px-5 py-2.5 text-center text-sm font-bold text-slate-950 transition hover:-translate-y-0.5 hover:bg-lime-200 md:text-right"
                        >
                            Add scheduled activity/event
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (createIdeaAction) {
                                    setIsIdeaOpen(true);
                                }
                                setIsOpen(false);
                            }}
                            disabled={!createIdeaAction}
                            className="animate-vaivia-add-fan-out vaivia-quick-add-bubble block rounded-full border border-white/30 bg-lime-300 px-5 py-2.5 text-center text-sm font-bold text-slate-950 transition hover:-translate-y-0.5 hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50 md:text-right"
                        >
                            Add activity idea
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setIsSuggestionOpen(true);
                                setIsOpen(false);
                            }}
                            className="animate-vaivia-add-fan-out vaivia-quick-add-bubble block rounded-full border border-white/30 bg-lime-300 px-5 py-2.5 text-center text-sm font-bold text-slate-950 transition hover:-translate-y-0.5 hover:bg-lime-200 md:text-right"
                        >
                            Suggest new feature
                        </button>
                    </div>
                )}

                <div className="relative grid place-items-center">
                    <span
                        className="pointer-events-none absolute -inset-4 z-0 rounded-full bg-slate-500/60 blur-2xl"
                        aria-hidden="true"
                    />
                    <span
                        className="pointer-events-none absolute -inset-2 z-0 rounded-full bg-slate-700/45 blur-xl"
                        aria-hidden="true"
                    />
                    <button
                        type="button"
                        onClick={() => setIsOpen((current) => !current)}
                        className="vaivia-mobile-quick-add-button relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-lime-300 text-slate-950 shadow-[0_0_34px_rgba(var(--vaivia-neon-rgb),0.30)] transition hover:-translate-y-0.5 hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-200 focus:ring-offset-2 focus:ring-offset-slate-950 md:h-14 md:w-14 md:shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)]"
                        aria-label={
                            isOpen
                                ? "Close itinerary quick add menu"
                                : "Open itinerary quick add menu"
                        }
                        aria-expanded={isOpen}
                    >
                        <span
                            className={`grid place-items-center transition-transform duration-300 ${
                                isOpen ? "-rotate-180" : "rotate-0"
                            }`}
                        >
                            {isOpen ? (
                                <Minus className="h-6 w-6" aria-hidden="true" />
                            ) : (
                                <Plus className="h-6 w-6" aria-hidden="true" />
                            )}
                        </span>
                    </button>
                </div>
            </div>
        </>
    );
}
