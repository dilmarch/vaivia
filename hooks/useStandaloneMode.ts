"use client";

import { useEffect, useState } from "react";

function getStandaloneMode() {
    if (typeof window === "undefined") return false;

    const displayModeStandalone = window.matchMedia?.(
        "(display-mode: standalone)"
    ).matches;
    const navigatorWithStandalone = navigator as Navigator & {
        standalone?: boolean;
    };

    return Boolean(displayModeStandalone || navigatorWithStandalone.standalone);
}

export function useStandaloneMode() {
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia?.("(display-mode: standalone)");

        function updateStandaloneMode() {
            const nextStandaloneMode = getStandaloneMode();
            setIsStandalone(nextStandaloneMode);
            document.documentElement.dataset.vaiviaStandalone =
                nextStandaloneMode ? "true" : "false";
        }

        updateStandaloneMode();
        mediaQuery?.addEventListener("change", updateStandaloneMode);

        return () => {
            mediaQuery?.removeEventListener("change", updateStandaloneMode);
        };
    }, []);

    useEffect(() => {
        let frameId = 0;

        function updateVisualViewportOffset() {
            window.cancelAnimationFrame(frameId);

            frameId = window.requestAnimationFrame(() => {
                const visualViewport = window.visualViewport;
                const bottomOffset = visualViewport
                    ? Math.max(
                          0,
                          window.innerHeight -
                              visualViewport.height -
                              visualViewport.offsetTop
                      )
                    : 0;

                document.documentElement.style.setProperty(
                    "--vaivia-visual-viewport-bottom",
                    `${Math.round(bottomOffset)}px`
                );
            });
        }

        updateVisualViewportOffset();
        window.addEventListener("resize", updateVisualViewportOffset);
        window.addEventListener("orientationchange", updateVisualViewportOffset);
        window.visualViewport?.addEventListener(
            "resize",
            updateVisualViewportOffset
        );
        window.visualViewport?.addEventListener(
            "scroll",
            updateVisualViewportOffset
        );

        return () => {
            window.cancelAnimationFrame(frameId);
            window.removeEventListener("resize", updateVisualViewportOffset);
            window.removeEventListener(
                "orientationchange",
                updateVisualViewportOffset
            );
            window.visualViewport?.removeEventListener(
                "resize",
                updateVisualViewportOffset
            );
            window.visualViewport?.removeEventListener(
                "scroll",
                updateVisualViewportOffset
            );
            document.documentElement.style.removeProperty(
                "--vaivia-visual-viewport-bottom"
            );
        };
    }, []);

    return isStandalone;
}
