"use client";

import { useEffect, useState } from "react";
import {
    getStoredPinkMode,
    setPinkModeEnabled,
} from "@/components/PinkModeProvider";

export default function PinkModeToggle() {
    const [enabled, setEnabled] = useState(false);

    useEffect(() => {
        setEnabled(getStoredPinkMode());

        function handlePinkModeChange(event: Event) {
            const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
            setEnabled(Boolean(detail?.enabled));
        }

        window.addEventListener("vaivia:pink-mode-change", handlePinkModeChange);
        return () =>
            window.removeEventListener(
                "vaivia:pink-mode-change",
                handlePinkModeChange
            );
    }, []);

    return (
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-lg font-black text-white">Pink Mode</h2>
                    <p className="mt-1 text-sm text-slate-400">
                        Switch the site neon highlight from lime to pink.
                    </p>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => {
                        const nextEnabled = !enabled;
                        setEnabled(nextEnabled);
                        setPinkModeEnabled(nextEnabled);
                    }}
                    className={`relative h-8 w-16 rounded-full border transition ${
                        enabled
                            ? "border-pink-300/60 bg-pink-400 shadow-[0_0_24px_rgba(255,54,190,0.28)]"
                            : "border-lime-300/40 bg-lime-300 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.22)]"
                    }`}
                >
                    <span
                        className={`absolute top-1 h-6 w-6 rounded-full bg-slate-950 transition ${
                            enabled ? "left-9" : "left-1"
                        }`}
                    />
                    <span className="sr-only">Toggle Pink Mode</span>
                </button>
            </div>
        </div>
    );
}
