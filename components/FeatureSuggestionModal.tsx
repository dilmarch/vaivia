"use client";

import { usePathname } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { createFeatureSuggestion } from "@/app/actions/featureSuggestions";
import AnimatedModal from "@/components/AnimatedModal";

type FeatureSuggestionModalProps = {
    onClose: () => void;
};

const suggestionTypes = [
    { value: "feature", label: "Suggest new feature" },
    { value: "bug", label: "Something is not working" },
    { value: "feedback", label: "General feedback" },
] as const;

export default function FeatureSuggestionModal({
    onClose,
}: FeatureSuggestionModalProps) {
    const pathname = usePathname();
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [selectedType, setSelectedType] =
        useState<(typeof suggestionTypes)[number]["value"]>("feature");

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSaving(true);
        setErrorMessage(null);

        try {
            await createFeatureSuggestion(new FormData(event.currentTarget));
            onClose();
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "Could not send suggestion. Please try again."
            );
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <AnimatedModal
            onClose={onClose}
            panelClassName="max-w-2xl overflow-hidden border border-white/10 bg-[#070611] text-white"
            labelledBy="featureSuggestionTitle"
        >
            {({ requestClose }) => (
                <form onSubmit={handleSubmit}>
                    <input type="hidden" name="current_path" value={pathname || ""} />
                    <div className="vaivia-modal-header flex items-start justify-between gap-4">
                        <div>
                            <p className="vaivia-modal-eyebrow">VAIVIA feedback</p>
                            <h2
                                id="featureSuggestionTitle"
                                className="vaivia-modal-title"
                            >
                                Suggest new feature
                            </h2>
                            <p className="mt-2 text-sm text-slate-300">
                                Tell us what would make VAIVIA better, or what is not
                                working the way you expected.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="vaivia-modal-close"
                            aria-label="Close suggestion form"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                    <div className="space-y-5 border-t border-white/10 bg-[#080711] p-6 text-white">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/90">
                                What is this about?
                            </p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                {suggestionTypes.map((option) => {
                                    const isSelected = selectedType === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setSelectedType(option.value)}
                                            className={`rounded-2xl border px-3 py-3 text-left text-sm font-black transition ${
                                                isSelected
                                                    ? "border-lime-300/40 bg-lime-300 text-slate-950"
                                                    : "border-white/15 bg-white/[0.08] text-slate-100 shadow-xl shadow-black/10 hover:border-lime-300/35 hover:bg-white/[0.14] hover:text-white"
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <input
                                type="hidden"
                                name="suggestion_type"
                                value={selectedType}
                            />
                        </div>

                        <label className="block">
                            <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/90">
                                Short title
                            </span>
                            <input
                                name="title"
                                className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white shadow-inner shadow-black/30 outline-none transition placeholder:text-slate-400/80 focus:border-lime-300/55 focus:ring-2 focus:ring-lime-300/15"
                                placeholder="e.g. Add packing lists"
                            />
                        </label>

                        <label className="block">
                            <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/90">
                                Details
                            </span>
                            <textarea
                                name="message"
                                required
                                rows={6}
                                className="mt-2 w-full resize-none rounded-2xl border border-white/15 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white shadow-inner shadow-black/30 outline-none transition placeholder:text-slate-400/80 focus:border-lime-300/55 focus:ring-2 focus:ring-lime-300/15"
                                placeholder="What should VAIVIA do differently? What broke? What would help?"
                            />
                        </label>

                        <label className="block">
                            <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/90">
                                Email
                            </span>
                            <input
                                name="contact_email"
                                type="email"
                                className="mt-2 w-full rounded-2xl border border-white/15 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white shadow-inner shadow-black/30 outline-none transition placeholder:text-slate-400/80 focus:border-lime-300/55 focus:ring-2 focus:ring-lime-300/15"
                                placeholder="Optional, if you want a follow-up"
                            />
                        </label>

                        {errorMessage ? (
                            <p className="rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                                {errorMessage}
                            </p>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#06050d] p-6 shadow-[0_-18px_45px_rgba(0,0,0,0.24)]">
                        <p className="text-xs font-semibold text-slate-300">
                            <Lightbulb
                                className="mr-1 inline h-3.5 w-3.5 text-lime-200"
                                aria-hidden="true"
                            />
                            Current page is included automatically.
                        </p>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="rounded-full bg-lime-300 px-6 py-3 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSaving ? "Sending..." : "Send suggestion"}
                        </button>
                    </div>
                </form>
            )}
        </AnimatedModal>
    );
}
