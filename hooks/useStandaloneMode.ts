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

    return isStandalone;
}
