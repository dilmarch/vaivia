"use client";

import Link from "next/link";
import { Minus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IdeaForm } from "@/components/IdeasTab";
import ItineraryItemForm from "@/components/ItineraryItemForm";
import TransportationForm from "@/components/TransportationForm";

type ItineraryQuickAddProps = {
    tripId: string;
    createItineraryAction: (formData: FormData) => Promise<void>;
    createTransportationAction: (formData: FormData) => Promise<void>;
    createIdeaAction?: (formData: FormData) => Promise<void>;
    defaultDate?: string;
};

export default function ItineraryQuickAdd({
    tripId,
    createItineraryAction,
    createTransportationAction,
    createIdeaAction,
    defaultDate = "",
}: ItineraryQuickAddProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [itemOpenSignal, setItemOpenSignal] = useState(0);
    const [itemSubmitLabel, setItemSubmitLabel] = useState(
        "Add scheduled activity/event"
    );
    const [isTransportationOpen, setIsTransportationOpen] = useState(false);
    const [isIdeaOpen, setIsIdeaOpen] = useState(false);
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
            />
            <TransportationForm
                tripId={tripId}
                submitAction={createTransportationAction}
                isOpen={isTransportationOpen}
                onClose={() => setIsTransportationOpen(false)}
                defaultDate={defaultDate}
            />
            {isIdeaOpen && createIdeaAction && (
                <div
                    className="vaivia-modal-backdrop"
                    onClick={() => setIsIdeaOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="quick-add-idea-title"
                        className="vaivia-modal-panel max-w-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
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
                                onClick={() => setIsIdeaOpen(false)}
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
                                onCancel={() => setIsIdeaOpen(false)}
                            />
                        </div>
                    </div>
                </div>
            )}

            <div
                ref={quickAddRef}
                className="fixed bottom-6 right-6 z-40 flex flex-col items-end"
            >
                {isOpen && (
                    <div className="mb-3 flex flex-col items-end gap-2">
                        <Link
                            href="/trips/new"
                            className="animate-vaivia-add-fan-out block rounded-full bg-lime-300 px-5 py-2.5 text-right text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(190,242,100,0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200"
                        >
                            Add trip
                        </Link>
                        <button
                            type="button"
                            onClick={() => {
                                setIsTransportationOpen(true);
                                setIsOpen(false);
                            }}
                            className="animate-vaivia-add-fan-out block rounded-full bg-lime-300 px-5 py-2.5 text-right text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(190,242,100,0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200"
                        >
                            Add transportation
                        </button>
                        <button
                            type="button"
                            onClick={() => openItineraryForm("Add accommodation")}
                            className="animate-vaivia-add-fan-out block rounded-full bg-lime-300 px-5 py-2.5 text-right text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(190,242,100,0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200"
                        >
                            Add accommodation
                        </button>
                        <button
                            type="button"
                            onClick={() => openItineraryForm("Add food or restaurant")}
                            className="animate-vaivia-add-fan-out block rounded-full bg-lime-300 px-5 py-2.5 text-right text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(190,242,100,0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200"
                        >
                            Add food or restaurant
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                openItineraryForm("Add scheduled activity/event")
                            }
                            className="animate-vaivia-add-fan-out block rounded-full bg-lime-300 px-5 py-2.5 text-right text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(190,242,100,0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200"
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
                            className="animate-vaivia-add-fan-out block rounded-full bg-lime-300 px-5 py-2.5 text-right text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(190,242,100,0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Add activity idea
                        </button>
                    </div>
                )}

                <button
                    type="button"
                    onClick={() => setIsOpen((current) => !current)}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-lime-300 text-slate-950 shadow-[0_0_28px_rgba(190,242,100,0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-200 focus:ring-offset-2 focus:ring-offset-slate-950"
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
