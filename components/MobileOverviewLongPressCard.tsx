"use client";

import { useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import AnimatedModal from "@/components/AnimatedModal";

type MobileOverviewLongPressCardProps = {
    children: ReactNode;
    modalTitle: string;
    modalEyebrow?: string;
    modalContent: ReactNode;
    className?: string;
    ariaLabel?: string;
};

export default function MobileOverviewLongPressCard({
    children,
    modalTitle,
    modalEyebrow,
    modalContent,
    className,
    ariaLabel,
}: MobileOverviewLongPressCardProps) {
    const [isOpen, setIsOpen] = useState(false);
    const longPressTimerRef = useRef<number | null>(null);
    const didLongPressRef = useRef(false);

    function clearLongPressTimer() {
        if (longPressTimerRef.current !== null) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }

    function startLongPress() {
        didLongPressRef.current = false;
        clearLongPressTimer();
        longPressTimerRef.current = window.setTimeout(() => {
            didLongPressRef.current = true;
            setIsOpen(true);
        }, 450);
    }

    function finishPress() {
        clearLongPressTimer();
        window.setTimeout(() => {
            didLongPressRef.current = false;
        }, 0);
    }

    return (
        <>
            <button
                type="button"
                className={className}
                aria-label={ariaLabel || modalTitle}
                onPointerDown={startLongPress}
                onPointerUp={finishPress}
                onPointerCancel={finishPress}
                onPointerLeave={finishPress}
                onClick={() => {
                    if (didLongPressRef.current) return;
                    setIsOpen(true);
                }}
            >
                {children}
            </button>

            {isOpen ? (
                <AnimatedModal
                    onClose={() => setIsOpen(false)}
                    panelClassName="max-w-md overflow-hidden rounded-[2rem] border-white/10 bg-[#050712] text-white"
                    labelledBy="mobile-overview-modal-title"
                >
                    {({ requestClose }) => (
                        <>
                            <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-[radial-gradient(circle_at_10%_0%,rgba(var(--vaivia-neon-rgb),0.14),transparent_30%),linear-gradient(135deg,rgba(124,60,255,0.16),transparent_58%)] p-5">
                                <div>
                                    {modalEyebrow ? (
                                        <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                            {modalEyebrow}
                                        </p>
                                    ) : null}
                                    <h2
                                        id="mobile-overview-modal-title"
                                        className="mt-1 text-2xl font-black leading-tight text-white"
                                    >
                                        {modalTitle}
                                    </h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={requestClose}
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-slate-200 transition hover:bg-white/[0.12] hover:text-white"
                                    aria-label="Close"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>
                            <div className="space-y-3 p-5">{modalContent}</div>
                        </>
                    )}
                </AnimatedModal>
            ) : null}
        </>
    );
}
