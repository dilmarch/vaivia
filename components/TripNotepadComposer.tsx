"use client";

import { Check, FileText, NotebookPen, Sparkles, Utensils, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import AnimatedModal from "@/components/AnimatedModal";
import type { NotepadLocation } from "@/lib/notepadEntries";
import { splitNotepadLines } from "@/lib/notepadEntries";

type TripNotepadComposerProps = {
    tripId: string;
    title: string;
    description: string;
    placeholder: string;
    existingNote?: string | null;
    locations: NotepadLocation[];
    saveNoteAction?: (formData: FormData) => Promise<void>;
    createCardsAction?: (formData: FormData) => Promise<void>;
    cardKind: "idea" | "food";
    readOnly?: boolean;
};

export default function TripNotepadComposer({
    tripId,
    title,
    description,
    placeholder,
    existingNote = "",
    locations,
    saveNoteAction,
    createCardsAction,
    cardKind,
    readOnly = false,
}: TripNotepadComposerProps) {
    const [draft, setDraft] = useState(existingNote || "");
    const [isConfirming, setIsConfirming] = useState(false);
    const [selectedLocationKeys, setSelectedLocationKeys] = useState<string[]>([]);
    const [foodType, setFoodType] = useState<"place" | "food">("place");
    const lines = useMemo(() => splitNotepadLines(draft), [draft]);
    const selectedLocations = locations.filter((location) =>
        selectedLocationKeys.includes(location.key)
    );
    const cardCount = lines.length * selectedLocations.length;

    function toggleLocation(key: string) {
        setSelectedLocationKeys((current) =>
            current.includes(key)
                ? current.filter((entry) => entry !== key)
                : [...current, key]
        );
    }

    function openConfirmation(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (lines.length === 0) return;
        setIsConfirming(true);
    }

    return (
        <>
            <section className="rounded-[1.5rem] border border-lime-300/20 bg-[radial-gradient(circle_at_top_right,rgba(var(--vaivia-neon-rgb),0.12),transparent_38%),rgba(255,255,255,0.045)] p-4 shadow-2xl shadow-black/20 sm:p-5">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-lime-300/25 bg-lime-300/10 text-lime-200">
                        <NotebookPen className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                        <h2 className="text-lg font-black text-white">{title}</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-400">
                            {description}
                        </p>
                    </div>
                </div>

                <form onSubmit={openConfirmation}>
                    <label className="mt-4 block">
                        <span className="sr-only">
                            {cardKind === "idea" ? "General trip notes" : "Eat and drink notes"}
                        </span>
                        <textarea
                            rows={5}
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            placeholder={placeholder}
                            autoComplete="off"
                            data-form-type="other"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            readOnly={readOnly}
                            className="w-full resize-y rounded-2xl border border-white/10 bg-slate-950/75 px-4 py-3 text-sm font-medium leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/45 focus:ring-2 focus:ring-lime-300/15"
                        />
                    </label>
                    <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-slate-400">
                            {lines.length > 1
                                ? `${lines.length} lines will become separate cards by default.`
                                : "Each non-empty line can become its own card."}
                        </p>
                        <button
                            type="submit"
                            disabled={readOnly || lines.length === 0}
                            title={readOnly ? "Editing is available on web" : undefined}
                            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.2)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                            <Check className="h-4 w-4" aria-hidden="true" />
                            Save
                        </button>
                    </div>
                </form>

                {existingNote ? (
                    <article className="mt-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-white">
                        <div className="flex items-center gap-2 text-lime-200">
                            <FileText className="h-4 w-4" aria-hidden="true" />
                            <p className="text-[10px] font-black uppercase tracking-[0.18em]">
                                General note
                            </p>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-300">
                            {existingNote}
                        </p>
                    </article>
                ) : null}
            </section>

            {isConfirming ? (
                <AnimatedModal
                    onClose={() => setIsConfirming(false)}
                    panelClassName="max-w-2xl"
                    labelledBy={`${cardKind}-notepad-confirm-title`}
                >
                    {({ requestClose }) => (
                        <>
                            <div className="vaivia-modal-header flex items-start justify-between gap-4">
                                <div>
                                    <p className="vaivia-modal-eyebrow">{title}</p>
                                    <h2
                                        id={`${cardKind}-notepad-confirm-title`}
                                        className="vaivia-modal-title"
                                    >
                                        Create cards or save one note?
                                    </h2>
                                    <p className="mt-2 text-sm font-semibold text-slate-300">
                                        Creating cards is selected by default. Choose every
                                        trip city where these lines apply.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={requestClose}
                                    className="vaivia-modal-close"
                                    aria-label="Close notepad confirmation"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>

                            <div className="vaivia-modal-body space-y-5">
                                <section>
                                    <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                                        {lines.length} {lines.length === 1 ? "card" : "cards"} per location
                                    </p>
                                    <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                                        {lines.map((line, index) => (
                                            <p key={`${line}-${index}`} className="text-sm font-semibold text-white">
                                                {index + 1}. {line}
                                            </p>
                                        ))}
                                    </div>
                                </section>

                                {cardKind === "food" ? (
                                    <section>
                                        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                                            What kind of card?
                                        </p>
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            {([
                                                ["place", "Place to eat"],
                                                ["food", "Food to try"],
                                            ] as const).map(([value, label]) => (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    onClick={() => setFoodType(value)}
                                                    aria-pressed={foodType === value}
                                                    className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${
                                                        foodType === value
                                                            ? "border-lime-300 bg-lime-300 text-slate-950"
                                                            : "border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white/[0.1]"
                                                    }`}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                ) : null}

                                <section>
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                                            Trip cities
                                        </p>
                                        {locations.length > 1 ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setSelectedLocationKeys(
                                                        selectedLocationKeys.length === locations.length
                                                            ? []
                                                            : locations.map((location) => location.key)
                                                    )
                                                }
                                                className="text-xs font-black text-lime-200"
                                            >
                                                {selectedLocationKeys.length === locations.length
                                                    ? "Clear all"
                                                    : "Select all"}
                                            </button>
                                        ) : null}
                                    </div>
                                    {locations.length > 0 ? (
                                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                            {locations.map((location) => {
                                                const selected = selectedLocationKeys.includes(location.key);
                                                return (
                                                    <button
                                                        key={location.key}
                                                        type="button"
                                                        onClick={() => toggleLocation(location.key)}
                                                        aria-pressed={selected}
                                                        className={`rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${
                                                            selected
                                                                ? "border-lime-300 bg-lime-300/15 text-lime-100"
                                                                : "border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white/[0.1]"
                                                        }`}
                                                    >
                                                        {location.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="mt-2 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-3 text-sm font-semibold text-amber-100">
                                            Add a trip city before turning these lines into cards.
                                            You can still save them as a note.
                                        </p>
                                    )}
                                </section>
                            </div>

                            <div className="vaivia-modal-footer vaivia-modal-actions">
                                {saveNoteAction ? (
                                    <form action={saveNoteAction}>
                                        <input type="hidden" name="trip_id" value={tripId} />
                                        <input type="hidden" name="notes" value={draft} />
                                        <button type="submit" className="vaivia-modal-button-secondary">
                                            <FileText className="h-4 w-4" aria-hidden="true" />
                                            Save as note
                                        </button>
                                    </form>
                                ) : null}
                                {createCardsAction ? (
                                    <form action={createCardsAction}>
                                        <input type="hidden" name="trip_id" value={tripId} />
                                        <input type="hidden" name="entries" value={draft} />
                                        <input
                                            type="hidden"
                                            name="locations"
                                            value={JSON.stringify(selectedLocations)}
                                        />
                                        <input type="hidden" name="item_type" value={foodType} />
                                        <button
                                            type="submit"
                                            disabled={cardCount === 0}
                                            className="vaivia-modal-button-primary disabled:cursor-not-allowed disabled:opacity-45"
                                        >
                                            {cardKind === "food" ? (
                                                <Utensils className="h-4 w-4" aria-hidden="true" />
                                            ) : (
                                                <Sparkles className="h-4 w-4" aria-hidden="true" />
                                            )}
                                            Create {cardCount || ""} {cardCount === 1 ? "card" : "cards"}
                                        </button>
                                    </form>
                                ) : null}
                            </div>
                        </>
                    )}
                </AnimatedModal>
            ) : null}
        </>
    );
}
