"use client";

import { useEffect, useState } from "react";
import {
    isVaiviaThemeMode,
    setVaiviaThemeMode,
    type VaiviaThemeMode,
} from "@/components/PinkModeProvider";

const themeOptions: Array<{
    mode: VaiviaThemeMode;
    label: string;
    swatchClassName: string;
    selectedClassName: string;
}> = [
    {
        mode: "dark",
        label: "Dark Mode",
        swatchClassName: "!bg-black",
        selectedClassName:
            "border-lime-300/50 bg-lime-300 text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)]",
    },
    {
        mode: "pink",
        label: "Pink Mode",
        swatchClassName: "bg-pink-400",
        selectedClassName:
            "border-pink-300/60 bg-pink-400 text-white shadow-[0_0_28px_rgba(255,54,190,0.25)]",
    },
    {
        mode: "greyscale",
        label: "Greyscale",
        swatchClassName: "bg-gradient-to-br from-white via-slate-400 to-slate-950",
        selectedClassName:
            "border-slate-200/70 bg-slate-200 text-slate-950 shadow-[0_0_28px_rgba(226,232,240,0.16)]",
    },
    {
        mode: "brat",
        label: "Brat Mode",
        swatchClassName: "bg-[#8ACE00]",
        selectedClassName:
            "border-black bg-black text-[#8ACE00] shadow-[0_0_30px_rgba(0,0,0,0.32)]",
    },
    {
        mode: "pride",
        label: "Pride Mode",
        swatchClassName:
            "bg-[linear-gradient(135deg,#e40303,#ff8c00,#ffed00,#008026,#24408e,#732982)]",
        selectedClassName:
            "border-white/35 bg-[linear-gradient(135deg,#e40303,#ff8c00,#ffed00,#008026,#24408e,#732982)] text-white shadow-[0_0_30px_rgba(255,237,0,0.16)]",
    },
    {
        mode: "light",
        label: "Light Mode",
        swatchClassName: "bg-white",
        selectedClassName:
            "border-slate-300 bg-white text-slate-950 shadow-[0_0_30px_rgba(15,23,42,0.12)]",
    },
];

type PinkModeToggleProps = {
    initialThemeMode?: VaiviaThemeMode | null;
};

export default function PinkModeToggle({
    initialThemeMode = null,
}: PinkModeToggleProps) {
    const [selectedTheme, setSelectedTheme] = useState<VaiviaThemeMode>(
        initialThemeMode || "dark"
    );
    const [saveError, setSaveError] = useState("");

    useEffect(() => {
        if (isVaiviaThemeMode(initialThemeMode)) {
            setSelectedTheme(initialThemeMode);
            setVaiviaThemeMode(initialThemeMode, { source: "sync" });
        } else {
            setSelectedTheme("dark");
            setVaiviaThemeMode("dark", { source: "sync" });
        }

        function handleThemeChange(event: Event) {
            const detail = (event as CustomEvent<{ mode?: VaiviaThemeMode }>).detail;
            if (detail?.mode) setSelectedTheme(detail.mode);
        }

        function handleThemeSaveError(event: Event) {
            const detail = (event as CustomEvent<{ message?: string }>).detail;
            setSaveError(
                detail?.message || "We couldn't save your theme. Please try again."
            );
        }

        window.addEventListener("vaivia:theme-mode-change", handleThemeChange);
        window.addEventListener("vaivia:theme-save-error", handleThemeSaveError);
        return () => {
            window.removeEventListener(
                "vaivia:theme-mode-change",
                handleThemeChange
            );
            window.removeEventListener(
                "vaivia:theme-save-error",
                handleThemeSaveError
            );
        };
    }, [initialThemeMode]);

    function handleThemeSelect(mode: VaiviaThemeMode) {
        setSelectedTheme(mode);
        setVaiviaThemeMode(mode);
        setSaveError("");
    }

    return (
        <section className="vaivia-theme-selector rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
            <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/80">
                    Themes
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">Theme mode</h2>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-400">
                    Choose one visual mode for VAIVIA. You can switch any time.
                </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {themeOptions.map((theme) => {
                    const isSelected = selectedTheme === theme.mode;

                    return (
                        <button
                            key={theme.mode}
                            type="button"
                            aria-pressed={isSelected}
                            data-theme-mode={theme.mode}
                            onClick={() => handleThemeSelect(theme.mode)}
                            className={`vaivia-theme-mode-button group flex min-h-20 items-center gap-3 rounded-[1.25rem] border p-4 text-left transition ${
                                isSelected
                                    ? theme.selectedClassName
                                    : "border-white/10 bg-slate-950/50 text-white hover:border-[color:var(--vaivia-theme-accent-solid)] hover:bg-white/[0.08]"
                            }`}
                        >
                            <span
                                className={`h-12 w-12 shrink-0 rounded-2xl border ${
                                    isSelected
                                        ? "border-slate-950/20"
                                        : "border-white/15"
                                } ${theme.swatchClassName}`}
                            />
                            <span className="min-w-0">
                                <span className="vaivia-theme-mode-label block text-sm font-black">
                                    {theme.label}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
            {saveError ? (
                <p className="mt-4 rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                    {saveError}
                </p>
            ) : null}
        </section>
    );
}
