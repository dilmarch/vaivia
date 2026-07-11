"use client";

import { useEffect, useState } from "react";
import VaiviaLoadingScreen, {
    type VaiviaLoadingScreenProps,
} from "@/components/VaiviaLoadingScreen";

type DelayedVaiviaLoadingScreenProps = VaiviaLoadingScreenProps & {
    delayMs?: number;
};

export default function DelayedVaiviaLoadingScreen({
    delayMs = 0,
    ...props
}: DelayedVaiviaLoadingScreenProps) {
    const [shouldShow, setShouldShow] = useState(delayMs <= 0);

    useEffect(() => {
        if (delayMs <= 0) {
            setShouldShow(true);
            return;
        }

        const timer = window.setTimeout(() => {
            setShouldShow(true);
        }, delayMs);

        return () => window.clearTimeout(timer);
    }, [delayMs]);

    if (!shouldShow) return null;

    return <VaiviaLoadingScreen {...props} />;
}
