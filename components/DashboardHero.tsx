"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardCountdownWidget from "@/components/DashboardCountdownWidget";
import type { CountdownUnit } from "@/lib/countdownDisplay";

type DashboardHeroProps = {
    name?: string | null;
    countdownTarget?: {
        tripTitle: string;
        targetTitle: string;
        targetDateIso: string;
    } | null;
    countdownUnit?: CountdownUnit;
};

const phrases = [
    "Here’s what’s ahead.",
    "Let’s get ready for an adventure.",
    "Your next escape starts here.",
    "Big trip energy.",
    "The world is waiting.",
    "Let’s make this journey effortless.",
    "Your plans are coming together.",
    "Time to move beautifully.",
    "Adventure, upgraded.",
    "Everything you need, all in one place.",
];

function getGreeting() {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 12) return "Good morning,";
    if (hour >= 12 && hour < 17) return "Good afternoon,";
    return "Good evening,";
}

function getSessionPhrase() {
    if (typeof window === "undefined") return phrases[0];

    const storedPhrase = window.sessionStorage.getItem("vaiviaDashboardPhrase");
    if (storedPhrase) return storedPhrase;

    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    window.sessionStorage.setItem("vaiviaDashboardPhrase", phrase);
    return phrase;
}

export default function DashboardHero({
    name,
    countdownTarget,
    countdownUnit = "days",
}: DashboardHeroProps) {
    const [greeting, setGreeting] = useState("Good evening,");
    const [phrase, setPhrase] = useState(phrases[0]);
    const displayName = useMemo(() => {
        const cleanName = name?.trim();
        if (!cleanName) return "Traveller";

        return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    }, [name]);

    useEffect(() => {
        setGreeting(getGreeting());
        setPhrase(getSessionPhrase());
    }, []);

    return (
        <section className="vaivia-dashboard-hero relative min-h-[420px] overflow-hidden bg-[#0c0115] shadow-2xl shadow-black/30 md:min-h-[520px]">
            <div className="absolute inset-0 bg-[url('/dashboard-bg.png')] bg-cover bg-center opacity-95" />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/55 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-[#0c0115]" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent via-[#0c0115]/70 to-[#0c0115]" />
            <div className="absolute right-4 top-24 z-20 hidden md:right-8 md:top-24 md:block">
                <DashboardCountdownWidget
                    target={countdownTarget}
                    initialUnit={countdownUnit}
                />
            </div>

            <div className="vaivia-dashboard-hero-content relative z-10 flex min-h-[420px] flex-col justify-center px-8 pb-20 pt-24 md:min-h-[520px] md:px-14 md:pt-28">
                <p className="text-xl font-medium text-fuchsia-300 md:text-2xl">
                    {greeting}
                </p>
                <h1 className="mt-4 text-6xl font-black tracking-tight md:text-8xl lg:text-9xl">
                    <span className="bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
                        {displayName}
                    </span>
                    <span className="text-lime-300">.</span>
                </h1>
                <p className="mt-5 max-w-xl text-lg text-slate-300 md:text-xl">
                    {phrase}
                </p>
                {countdownTarget ? (
                    <div className="mt-8 max-w-sm md:hidden">
                        <DashboardCountdownWidget
                            target={countdownTarget}
                            initialUnit={countdownUnit}
                        />
                    </div>
                ) : null}
            </div>
        </section>
    );
}
