"use client";

import Link from "next/link";
import { Bell, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type TopNavTrip = {
    id: string;
    title: string | null;
};

type AppTopActionBarProps = {
    trips: TopNavTrip[];
};

const notifications = [
    {
        title: "Berlin check-in opens soon",
        text: "WS 50 to LGW opens in 12 hours.",
    },
    {
        title: "Passport looks good",
        text: "Valid for your upcoming trips.",
    },
    {
        title: "3 bookings need attention",
        text: "Review missing confirmations.",
    },
    {
        title: "Taipei weather update",
        text: "Light rain expected on arrival.",
    },
    {
        title: "Budget insight ready",
        text: "Berlin prices are down 12% this month.",
    },
];

type AddAction = {
    key: string;
    label: string;
    href?: string;
};

const addActions: AddAction[] = [
    { key: "trip", label: "Add trip", href: "/trips/new" },
    { key: "transportation", label: "Add transportation" },
    { key: "accommodation", label: "Add accommodation" },
    { key: "food", label: "Add food or restaurant" },
    { key: "scheduled", label: "Add scheduled activity/event" },
    { key: "idea", label: "Add activity idea" },
] as const;

function tripLabel(trip: TopNavTrip) {
    return trip.title?.trim() || "Untitled trip";
}

export default function AppTopActionBar({ trips }: AppTopActionBarProps) {
    const [openMenu, setOpenMenu] = useState<"add" | "notifications" | null>(
        null
    );
    const [tripPickerAction, setTripPickerAction] = useState<string | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!openMenu) return;

        function closeOnOutsideClick(event: MouseEvent) {
            if (
                wrapperRef.current &&
                !wrapperRef.current.contains(event.target as Node)
            ) {
                setOpenMenu(null);
                setTripPickerAction(null);
            }
        }

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setOpenMenu(null);
                setTripPickerAction(null);
            }
        }

        document.addEventListener("mousedown", closeOnOutsideClick);
        document.addEventListener("keydown", closeOnEscape);

        return () => {
            document.removeEventListener("mousedown", closeOnOutsideClick);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [openMenu]);

    function toggleMenu(menu: "add" | "notifications") {
        setOpenMenu((current) => (current === menu ? null : menu));
        setTripPickerAction(null);
    }

    return (
        <div className="pointer-events-none fixed left-0 right-0 top-0 z-[45] px-4 pt-4 md:left-24 md:px-8 md:pt-6">
            <div
                ref={wrapperRef}
                className="pointer-events-auto ml-auto flex w-fit items-start gap-3"
            >
                <div
                    className="relative"
                    onMouseLeave={() => {
                        if (openMenu === "add") {
                            setOpenMenu(null);
                            setTripPickerAction(null);
                        }
                    }}
                >
                    <button
                        type="button"
                        onClick={() => toggleMenu("add")}
                        className="inline-flex h-12 items-center gap-2 rounded-full bg-lime-300 px-5 text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(190,242,100,0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-200 focus:ring-offset-2 focus:ring-offset-slate-950"
                        aria-label="Open add menu"
                        aria-haspopup="menu"
                        aria-expanded={openMenu === "add"}
                    >
                        <Plus className="h-5 w-5" aria-hidden="true" />
                        Add
                    </button>

                    {openMenu === "add" ? (
                        <div className="absolute right-0 top-14 flex w-80 flex-col items-end gap-2">
                            {tripPickerAction ? (
                                <div className="w-72 rounded-[24px] border border-lime-300/20 bg-[#0c0115]/90 p-3 text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
                                    <button
                                        type="button"
                                        onClick={() => setTripPickerAction(null)}
                                        className="mb-2 rounded-full border border-lime-300/20 bg-lime-300/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-lime-100 transition hover:bg-lime-300/20"
                                    >
                                        Back
                                    </button>
                                    <p className="px-3 pb-2 text-xs font-bold uppercase tracking-wide text-lime-200">
                                        Choose a trip
                                    </p>
                                    <div className="max-h-64 overflow-y-auto">
                                        {trips.length > 0 ? (
                                            trips.map((trip, index) => (
                                                <Link
                                                    key={trip.id}
                                                    href={`/trips/${trip.id}`}
                                                    className="animate-vaivia-add-fan-out mb-2 block rounded-full bg-lime-300 px-5 py-2.5 text-right text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(190,242,100,0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200"
                                                    style={{
                                                        animationDelay: `${index * 34}ms`,
                                                    }}
                                                >
                                                    {tripLabel(trip)}
                                                </Link>
                                            ))
                                        ) : (
                                            <p className="px-3 py-2 text-sm text-slate-400">
                                                Create a trip first.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                addActions.map((action, index) =>
                                    action.href ? (
                                        <Link
                                            key={action.key}
                                            href={action.href}
                                            className="animate-vaivia-add-fan-out block rounded-full bg-lime-300 px-5 py-2.5 text-right text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(190,242,100,0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200"
                                            style={{
                                                animationDelay: `${index * 34}ms`,
                                            }}
                                        >
                                            {action.label}
                                        </Link>
                                    ) : (
                                        <button
                                            key={action.key}
                                            type="button"
                                            onClick={() => setTripPickerAction(action.key)}
                                            className="animate-vaivia-add-fan-out block rounded-full bg-lime-300 px-5 py-2.5 text-right text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(190,242,100,0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200"
                                            style={{
                                                animationDelay: `${index * 34}ms`,
                                            }}
                                        >
                                            {action.label}
                                        </button>
                                    )
                                )
                            )}
                        </div>
                    ) : null}
                </div>

                <div className="relative">
                    <button
                        type="button"
                        onClick={() => toggleMenu("notifications")}
                        className="relative flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-slate-950/50 text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-lime-300/30 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-lime-300/50"
                        aria-label="Open notifications"
                        aria-haspopup="menu"
                        aria-expanded={openMenu === "notifications"}
                    >
                        <Bell className="h-5 w-5" aria-hidden="true" />
                        <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-lime-300 shadow-[0_0_14px_rgba(190,242,100,0.9)]" />
                    </button>

                    {openMenu === "notifications" ? (
                        <div className="absolute right-0 top-14 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/85 p-2 text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
                            <div className="px-3 py-2">
                                <p className="text-xs font-bold uppercase tracking-wide text-lime-200">
                                    Notifications
                                </p>
                            </div>
                            {notifications.map((notification) => (
                                <button
                                    key={notification.title}
                                    type="button"
                                    className="block w-full rounded-2xl px-3 py-2 text-left transition hover:bg-white/10"
                                >
                                    <span className="block text-sm font-semibold text-white">
                                        {notification.title}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-slate-400">
                                        {notification.text}
                                    </span>
                                </button>
                            ))}
                            <button
                                type="button"
                                className="mt-2 w-full rounded-2xl border border-lime-300/20 bg-lime-300/10 px-3 py-2 text-sm font-bold text-lime-100 transition hover:bg-lime-300/15"
                            >
                                Load more
                            </button>
                        </div>
                    ) : null}
                </div>

                <div className="group/search relative flex h-12 w-12 items-center rounded-full border border-white/10 bg-slate-950/50 text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl transition-all duration-300 hover:w-64 focus-within:w-64 hover:border-lime-300/30 hover:bg-white/10">
                    <Search
                        className="pointer-events-none absolute left-3.5 h-5 w-5"
                        aria-hidden="true"
                    />
                    <input
                        aria-label="Search VAIVIA"
                        placeholder="Search VAIVIA..."
                        className="h-full w-full rounded-full bg-transparent pl-11 pr-4 text-sm font-medium text-white opacity-0 outline-none placeholder:text-slate-400 transition-opacity duration-200 group-hover/search:opacity-100 group-focus-within/search:opacity-100"
                        type="search"
                    />
                </div>
            </div>
        </div>
    );
}
