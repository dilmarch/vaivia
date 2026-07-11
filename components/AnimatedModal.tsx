"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Portal from "@/components/Portal";
import { cn } from "@/lib/utils";

const CLOSE_ANIMATION_MS = 160;

type AnimatedModalRenderProps = {
    requestClose: () => void;
    state: "open" | "closing";
};

type AnimatedModalProps = {
    children: (props: AnimatedModalRenderProps) => ReactNode;
    onClose: () => void;
    className?: string;
    panelClassName?: string;
    panelAs?: "div" | "aside";
    panelId?: string;
    labelledBy?: string;
    presentation?: boolean;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    onRequestClose?: (requestClose: () => void) => void;
};

export default function AnimatedModal({
    children,
    onClose,
    className,
    panelClassName,
    panelAs = "div",
    panelId,
    labelledBy,
    presentation = false,
    closeOnBackdrop = true,
    closeOnEscape = true,
    onRequestClose,
}: AnimatedModalProps) {
    const [state, setState] = useState<"open" | "closing">("open");
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );

    const requestClose = useCallback(() => {
        setState((currentState) => {
            if (currentState === "closing") return currentState;

            closeTimerRef.current = setTimeout(() => {
                closeTimerRef.current = null;
                onClose();
            }, CLOSE_ANIMATION_MS);

            return "closing";
        });
    }, [onClose]);

    const requestDismiss = useCallback(() => {
        if (onRequestClose) {
            onRequestClose(requestClose);
            return;
        }

        requestClose();
    }, [onRequestClose, requestClose]);

    useEffect(() => {
        if (!closeOnEscape) return;

        function closeOnEscapeKey(event: KeyboardEvent) {
            if (event.key === "Escape") requestDismiss();
        }

        document.addEventListener("keydown", closeOnEscapeKey);
        return () => document.removeEventListener("keydown", closeOnEscapeKey);
    }, [closeOnEscape, requestDismiss]);

    useEffect(() => {
        return () => {
            if (closeTimerRef.current) {
                clearTimeout(closeTimerRef.current);
            }
        };
    }, []);

    const Panel = panelAs;

    return (
        <Portal>
        <div
            className={cn("vaivia-modal-backdrop", className)}
            data-vaivia-modal-state={state}
            role={presentation ? "presentation" : undefined}
            onClick={closeOnBackdrop ? requestDismiss : undefined}
        >
            <Panel
                id={panelId}
                className={cn("vaivia-modal-panel", panelClassName)}
                data-vaivia-modal-state={state}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                onClick={(event) => event.stopPropagation()}
            >
                {children({ requestClose, state })}
            </Panel>
        </div>
        </Portal>
    );
}
