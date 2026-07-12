"use client";

import { useEffect, useState } from "react";
import {
    getStoredVaiviaThemeMode,
    setVaiviaThemeMode,
    type VaiviaThemeMode,
} from "@/components/PinkModeProvider";

const themeOptions: Array<{
    mode: VaiviaThemeMode;
    label: string;
    description: string;
    swatchClassName: string;
    selectedClassName: string;
    selectedDescriptionClassName: string;
}> = [
    {
        mode: "dark",
        label: "Dark Mode",
        description: "The classic VAIVIA dark neon look.",
        swatchClassName: "!bg-black",
        selectedClassName:
            "border-lime-300/50 bg-lime-300 text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)]",
        selectedDescriptionClassName: "text-slate-950/70",
    },
    {
        mode: "pink",
        label: "Pink Mode",
        description: "Swap neon lime for VAIVIA pink.",
        swatchClassName: "bg-pink-400",
        selectedClassName:
            "border-pink-300/60 bg-pink-400 text-white shadow-[0_0_28px_rgba(255,54,190,0.25)]",
        selectedDescriptionClassName: "text-white/75",
    },
    {
        mode: "greyscale",
        label: "Greyscale",
        description: "Turn the site into black, white, and grey.",
        swatchClassName: "bg-gradient-to-br from-white via-slate-400 to-slate-950",
        selectedClassName:
            "border-slate-200/70 bg-slate-200 text-slate-950 shadow-[0_0_28px_rgba(226,232,240,0.16)]",
        selectedDescriptionClassName: "text-slate-700",
    },
    {
        mode: "brat",
        label: "Brat Mode",
        description: "Charli-inspired #8ACE00 energy.",
        swatchClassName: "bg-[#8ACE00]",
        selectedClassName:
            "border-black bg-black text-[#8ACE00] shadow-[0_0_30px_rgba(0,0,0,0.32)]",
        selectedDescriptionClassName: "text-[#8ACE00]/75",
    },
    {
        mode: "pride",
        label: "Pride Mode",
        description: "Neon rainbow accents across the app.",
        swatchClassName:
            "bg-[linear-gradient(135deg,#e40303,#ff8c00,#ffed00,#008026,#24408e,#732982)]",
        selectedClassName:
            "border-white/35 bg-[linear-gradient(135deg,#e40303,#ff8c00,#ffed00,#008026,#24408e,#732982)] text-white shadow-[0_0_30px_rgba(255,237,0,0.16)]",
        selectedDescriptionClassName: "text-white/80",
    },
    {
        mode: "light",
        label: "Light Mode",
        description: "Bright white app shell with dark text.",
        swatchClassName: "bg-white",
        selectedClassName:
            "border-slate-300 bg-white text-slate-950 shadow-[0_0_30px_rgba(15,23,42,0.12)]",
        selectedDescriptionClassName: "text-slate-600",
    },
];

export default function PinkModeToggle() {
    const [selectedTheme, setSelectedTheme] = useState<VaiviaThemeMode>("dark");

    useEffect(() => {
        setSelectedTheme(getStoredVaiviaThemeMode());

        function handleThemeChange(event: Event) {
            const detail = (event as CustomEvent<{ mode?: VaiviaThemeMode }>).detail;
            if (detail?.mode) setSelectedTheme(detail.mode);
        }

        window.addEventListener("vaivia:theme-mode-change", handleThemeChange);
        return () =>
            window.removeEventListener(
                "vaivia:theme-mode-change",
                handleThemeChange
            );
    }, []);

    return (
        <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
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
                            onClick={() => {
                                setSelectedTheme(theme.mode);
                                setVaiviaThemeMode(theme.mode);
                            }}
                            className={`group flex min-h-24 items-center gap-3 rounded-[1.25rem] border p-4 text-left transition ${
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
                                <span className="block text-sm font-black">
                                    {theme.label}
                                </span>
                                <span
                                    className={`mt-1 block text-xs font-semibold leading-5 ${
                                        isSelected
                                            ? theme.selectedDescriptionClassName
                                            : "text-slate-400"
                                    }`}
                                >
                                    {theme.description}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
