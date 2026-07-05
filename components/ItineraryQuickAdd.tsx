"use client";

import Link from "next/link";
import { Minus, Plus } from "lucide-react";
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
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6"
                    onClick={() => setIsIdeaOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="quick-add-idea-title"
                        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md bg-white p-5 shadow-xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-5 flex items-start justify-between gap-4">
                            <div>
                                <h2
                                    id="quick-add-idea-title"
                                    className="text-xl font-semibold text-slate-900"
                                >
                                    Add activity idea
                                </h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    Save a loose idea for this trip.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsIdeaOpen(false)}
                                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                        </div>
                        <IdeaForm
                            tripId={tripId}
                            action={createIdeaAction}
                            onCancel={() => setIsIdeaOpen(false)}
                        />
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
                            className="block rounded-full bg-slate-900 px-4 py-2 text-right text-sm font-medium text-white shadow-md transition hover:bg-slate-700"
                        >
                            Add trip
                        </Link>
                        <button
                            type="button"
                            onClick={() => {
                                setIsTransportationOpen(true);
                                setIsOpen(false);
                            }}
                            className="block rounded-full border border-slate-300 bg-white px-4 py-2 text-right text-sm font-medium text-slate-800 shadow-md transition hover:bg-slate-50"
                        >
                            Add transportation
                        </button>
                        <button
                            type="button"
                            onClick={() => openItineraryForm("Add accommodation")}
                            className="block rounded-full border border-slate-300 bg-white px-4 py-2 text-right text-sm font-medium text-slate-800 shadow-md transition hover:bg-slate-50"
                        >
                            Add accommodation
                        </button>
                        <button
                            type="button"
                            onClick={() => openItineraryForm("Add food or restaurant")}
                            className="block rounded-full border border-slate-300 bg-white px-4 py-2 text-right text-sm font-medium text-slate-800 shadow-md transition hover:bg-slate-50"
                        >
                            Add food or restaurant
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                openItineraryForm("Add scheduled activity/event")
                            }
                            className="block rounded-full border border-slate-300 bg-white px-4 py-2 text-right text-sm font-medium text-slate-800 shadow-md transition hover:bg-slate-50"
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
                            className="block rounded-full border border-slate-300 bg-white px-4 py-2 text-right text-sm font-medium text-slate-800 shadow-md transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Add activity idea
                        </button>
                    </div>
                )}

                <button
                    type="button"
                    onClick={() => setIsOpen((current) => !current)}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
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
