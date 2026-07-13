"use client";

import { useEffect, useRef } from "react";
import { saveAccountThemeMode } from "@/app/actions/theme";
import {
    isVaiviaThemeMode,
    setVaiviaThemeMode,
    syncVaiviaThemeMode,
    type VaiviaThemeMode,
} from "@/components/PinkModeProvider";

type AccountThemeSyncProps = {
    userId?: string | null;
    themeMode?: string | null;
};

export default function AccountThemeSync({
    userId,
    themeMode,
}: AccountThemeSyncProps) {
    const confirmedModeRef = useRef<VaiviaThemeMode>("dark");
    const latestSaveIdRef = useRef(0);

    useEffect(() => {
        if (!userId) {
            confirmedModeRef.current = "dark";
            latestSaveIdRef.current += 1;
            syncVaiviaThemeMode("dark");
            return;
        }

        const accountMode: VaiviaThemeMode = isVaiviaThemeMode(themeMode)
            ? themeMode
            : "dark";

        confirmedModeRef.current = accountMode;
        syncVaiviaThemeMode(accountMode, userId);
    }, [themeMode, userId]);

    useEffect(() => {
        let saveTimeout: number | null = null;

        function handleThemeChange(event: Event) {
            const detail = (
                event as CustomEvent<{
                    mode?: VaiviaThemeMode;
                    source?: "sync" | "user";
                }>
            ).detail;

            if (
                !userId ||
                detail?.source === "sync" ||
                !isVaiviaThemeMode(detail?.mode)
            ) {
                return;
            }

            if (detail.mode === confirmedModeRef.current) return;

            if (saveTimeout) window.clearTimeout(saveTimeout);
            const saveId = latestSaveIdRef.current + 1;
            latestSaveIdRef.current = saveId;
            const previousConfirmedMode = confirmedModeRef.current;

            saveTimeout = window.setTimeout(() => {
                const nextMode = detail.mode;
                if (!isVaiviaThemeMode(nextMode)) return;

                saveAccountThemeMode(nextMode)
                    .then((result) => {
                        if (saveId !== latestSaveIdRef.current) return;

                        if (result?.ok && result.themeMode === nextMode) {
                            confirmedModeRef.current = nextMode;
                            setVaiviaThemeMode(nextMode, {
                                source: "sync",
                                userId,
                            });
                            return;
                        }

                        throw new Error("Theme save was not confirmed.");
                    })
                    .catch((error) => {
                        console.error("Could not save account theme mode:", error);
                        if (saveId !== latestSaveIdRef.current) return;
                        setVaiviaThemeMode(previousConfirmedMode, {
                            source: "sync",
                            userId,
                        });
                        window.dispatchEvent(
                            new CustomEvent("vaivia:theme-save-error", {
                                detail: {
                                    message:
                                        "We couldn't save your theme. Please try again.",
                                },
                            })
                        );
                    });
            }, 250);
        }

        window.addEventListener("vaivia:theme-mode-change", handleThemeChange);

        return () => {
            if (saveTimeout) window.clearTimeout(saveTimeout);
            window.removeEventListener(
                "vaivia:theme-mode-change",
                handleThemeChange
            );
        };
    }, [userId]);

    return null;
}
