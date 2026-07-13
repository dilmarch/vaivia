"use client";

import { Check, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

type FeatureSuggestionStatusSelectProps = {
    action: (formData: FormData) => void | Promise<void>;
    status: string;
    suggestionId: string;
};

const statuses = [
    "open",
    "in_progress",
    "qa",
    "implemented",
    "archived",
] as const;

function formatStatusLabel(status: string) {
    if (status === "qa") return "QA";

    return status
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

export default function FeatureSuggestionStatusSelect({
    action,
    status,
    suggestionId,
}: FeatureSuggestionStatusSelectProps) {
    const router = useRouter();
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [selectedStatus, setSelectedStatus] = useState(status);
    const [isOpen, setIsOpen] = useState(false);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        setSelectedStatus(status);
    }, [status]);

    useEffect(() => {
        if (!isOpen) return;

        function closeOnOutsideClick(event: MouseEvent) {
            if (
                wrapperRef.current &&
                !wrapperRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        }

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") setIsOpen(false);
        }

        document.addEventListener("mousedown", closeOnOutsideClick);
        document.addEventListener("keydown", closeOnEscape);

        return () => {
            document.removeEventListener("mousedown", closeOnOutsideClick);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [isOpen]);

    function submitStatus(nextStatus: string) {
        setSelectedStatus(nextStatus);
        setIsOpen(false);

        const formData = new FormData();
        formData.set("suggestion_id", suggestionId);
        formData.set("status", nextStatus);

        startTransition(() => {
            void Promise.resolve(action(formData)).then(() => {
                router.refresh();
            });
        });
    }

    return (
        <div ref={wrapperRef} className="relative flex items-center gap-2">
            <button
                type="button"
                disabled={isPending}
                onClick={() => setIsOpen((current) => !current)}
                className="inline-flex h-10 min-w-36 items-center justify-between gap-3 rounded-full border border-white/10 bg-slate-950/80 px-4 text-xs font-black uppercase tracking-[0.12em] text-white shadow-xl shadow-black/25 backdrop-blur-xl transition hover:border-lime-300/35 hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-60"
                aria-label="Update request status"
                aria-haspopup="menu"
                aria-expanded={isOpen}
            >
                {formatStatusLabel(selectedStatus)}
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
            {isOpen ? (
                <div
                    className="absolute right-0 top-12 z-30 w-52 overflow-hidden rounded-[1.25rem] border border-white/10 bg-slate-950/85 p-2 text-white shadow-2xl shadow-black/45 backdrop-blur-2xl"
                    role="menu"
                >
                    {statuses.map((option) => {
                        const isSelected = option === selectedStatus;
                        return (
                            <button
                                key={option}
                                type="button"
                                onClick={() => submitStatus(option)}
                                className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left text-xs font-black uppercase tracking-[0.12em] transition ${
                                    isSelected
                                        ? "bg-lime-300 text-slate-950"
                                        : "text-slate-100 hover:bg-lime-300 hover:text-slate-950"
                                }`}
                                role="menuitem"
                            >
                                {formatStatusLabel(option)}
                                {isSelected ? (
                                    <Check className="h-4 w-4" aria-hidden="true" />
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            ) : null}
            {isPending ? (
                <span className="text-xs font-black text-lime-200">
                    Saving...
                </span>
            ) : null}
        </div>
    );
}
