"use client";

import Link from "next/link";
import { Minus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createAccommodation } from "@/app/actions/accommodations";
import { AccommodationCreateModal } from "@/components/accommodations/AccommodationManager";
import AnimatedModal from "@/components/AnimatedModal";
import FeatureSuggestionModal from "@/components/FeatureSuggestionModal";
import { IdeaForm } from "@/components/IdeasTab";
import ItineraryItemForm from "@/components/ItineraryItemForm";
import TransportationForm from "@/components/TransportationForm";
import type { UserCategory } from "@/lib/itineraryCategories";
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
}: ItineraryQuickAddProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [itemOpenSignal, setItemOpenSignal] = useState(0);
    const [itemSubmitLabel, setItemSubmitLabel] = useState(
        "Add scheduled activity/event"
    );
    const [isTransportationOpen, setIsTransportationOpen] = useState(false);
    const [isAccommodationOpen, setIsAccommodationOpen] = useState(false);
    const [isIdeaOpen, setIsIdeaOpen] = useState(false);
    const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
    const quickAddRef = useRef<HTMLDivElement | null>(null);

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

            <div
                ref={quickAddRef}
                className="fixed bottom-[calc(1rem+var(--safe-area-bottom))] left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center md:bottom-6 md:left-auto md:right-6 md:z-40 md:translate-x-0 md:items-end"
            >
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

                <button
                    type="button"
                    onClick={() => setIsOpen((current) => !current)}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-lime-300 text-slate-950 shadow-[0_0_34px_rgba(var(--vaivia-neon-rgb),0.30)] transition hover:-translate-y-0.5 hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-200 focus:ring-offset-2 focus:ring-offset-slate-950 md:h-14 md:w-14 md:shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)]"
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
        </>
    );
}
