"use client";

import Link from "next/link";
import { AlertTriangle, Minus, Plus, RotateCcw } from "lucide-react";
import {
    type MouseEvent,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ComposableMap,
    Geographies,
    Geography,
    ZoomableGroup,
} from "react-simple-maps";
import {
    COUNTRY_OPTIONS,
    getCountryOptionByIso3,
    normalizeCountryCode,
} from "@/lib/countries/country-codes";
import { createClient } from "@/lib/supabase/client";

type ScratchMapProps = {
    userId?: string;
    visitedCountryCodes: string[];
    visitedCountryYears?: Record<string, number[]>;
    scratchedCountryCodes?: string[];
    className?: string;
    statsClassName?: string;
    mapViewportClassName?: string;
    settingsHref?: string;
    onScratchMapChange?: (countryCodes: string[]) => void;
};

type HoveredCountry = {
    code: string;
    name: string;
    emoji: string;
    visited: boolean;
    passportStamped: boolean;
    manuallyScratched: boolean;
    visitedYears: number[];
} | null;

type ScratchNotice = {
    message: string;
    x: number;
    y: number;
} | null;

type GeographyRecord = {
    rsmKey: string;
    properties?: Record<string, unknown>;
};

const GEO_URL = "/maps/world-countries.json";
const SCRATCH_SOUND_URL = "/sounds/scratch.mp3";
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const PASSPORT_STAMP_UNSCRATCH_MESSAGE =
    "You can't unscratch countries if you have a passport stamp from that country. Delete the passport stamp first and then click to unscratch.";

function normalizeScratchCode(value: string) {
    return normalizeCountryCode(value) || value.trim().toUpperCase();
}

function normalizeScratchCodes(values: string[]) {
    return Array.from(
        new Set(values.map(normalizeScratchCode).filter((code) => /^[A-Z]{3}$/.test(code)))
    );
}

function getGeographyCountryCode(geo: GeographyRecord) {
    const properties = geo.properties ?? {};
    const candidates = [
        properties.ISO_A3,
        properties.ADM0_A3,
        properties.SOV_A3,
        properties.iso_a3,
        properties.ADM0_ISO,
    ];
    const code =
        candidates
            .map((value) => String(value || "").toUpperCase())
            .find((value) => /^[A-Z]{3}$/.test(value)) || "";

    if (process.env.NODE_ENV === "development" && !code) {
        console.warn("Map geography has no country code", geo.properties);
    }

    return code;
}

function getGeographyName(geo: GeographyRecord, code: string) {
    const country = getCountryOptionByIso3(code);
    if (country) return country.name;

    const properties = geo.properties ?? {};
    return String(
        properties.NAME_EN ||
            properties.ADMIN ||
            properties.NAME_LONG ||
            properties.NAME ||
            code ||
            "Unknown country"
    );
}

function getCountryDetails(
    geo: GeographyRecord,
    passportStampedSet: Set<string>,
    manuallyScratchedSet: Set<string>,
    visitedYearsByCountry: Map<string, number[]>
) {
    const code = getGeographyCountryCode(geo);
    const country = getCountryOptionByIso3(code);
    const passportStamped = Boolean(code && passportStampedSet.has(code));
    const manuallyScratched = Boolean(code && manuallyScratchedSet.has(code));

    return {
        code,
        name: country?.name || getGeographyName(geo, code),
        emoji: country?.emoji || "",
        visited: passportStamped || manuallyScratched,
        passportStamped,
        manuallyScratched,
        visitedYears: visitedYearsByCountry.get(code) || [],
    };
}

function getUniqueVisitedYears(years: number[]) {
    return Array.from(
        new Set(
            years
                .map((year) => Number(year))
                .filter((year) => Number.isInteger(year) && year > 0)
        )
    ).sort((yearA, yearB) => yearB - yearA);
}

function chunkYears(years: number[], chunkSize = 4) {
    const chunks: number[][] = [];
    for (let index = 0; index < years.length; index += chunkSize) {
        chunks.push(years.slice(index, index + chunkSize));
    }
    return chunks;
}

function VisitedYearsDisplay({ years }: { years: number[] }) {
    const uniqueYears = getUniqueVisitedYears(years);

    if (!uniqueYears.length) return <>Passport stamp</>;

    if (uniqueYears.length > 8) {
        const mostRecentYear = uniqueYears[0];
        const firstYear = uniqueYears[uniqueYears.length - 1];
        return (
            <span className="block leading-5">
                <span className="block">
                    {firstYear}-{mostRecentYear}
                </span>
                <span className="block">
                    {uniqueYears.length} times visited
                </span>
            </span>
        );
    }

    return (
        <span className="block leading-5">
            {chunkYears(uniqueYears).map((yearChunk) => (
                <span key={yearChunk.join("-")} className="block">
                    {yearChunk.join(", ")}
                </span>
            ))}
        </span>
    );
}

export default function ScratchMap({
    userId,
    visitedCountryCodes,
    visitedCountryYears = {},
    scratchedCountryCodes = [],
    className = "",
    statsClassName,
    mapViewportClassName,
    settingsHref = "/profile",
    onScratchMapChange,
}: ScratchMapProps) {
    const passportStampedSet = useMemo(() => {
        return new Set(
            visitedCountryCodes
                .map((code) => normalizeCountryCode(code) || code.toUpperCase())
                .filter(Boolean)
        );
    }, [visitedCountryCodes]);
    const [manualScratchCodes, setManualScratchCodes] = useState<string[]>(
        normalizeScratchCodes(scratchedCountryCodes)
    );
    const manuallyScratchedSet = useMemo(() => {
        return new Set(
            manualScratchCodes
                .map((code) => normalizeCountryCode(code) || code.toUpperCase())
                .filter(Boolean)
        );
    }, [manualScratchCodes]);
    const highlightedSet = useMemo(
        () => new Set([...passportStampedSet, ...manuallyScratchedSet]),
        [manuallyScratchedSet, passportStampedSet]
    );
    const visitedYearsByCountry = useMemo(() => {
        const yearsByCountry = new Map<string, number[]>();

        Object.entries(visitedCountryYears).forEach(([countryCode, years]) => {
            const normalizedCode = normalizeScratchCode(countryCode);
            if (!/^[A-Z]{3}$/.test(normalizedCode)) return;

            yearsByCountry.set(
                normalizedCode,
                Array.from(
                    new Set(
                        years
                            .map((year) => Number(year))
                            .filter(
                                (year) => Number.isInteger(year) && year > 0
                            )
                    )
                ).sort((yearA, yearB) => yearB - yearA)
            );
        });

        return yearsByCountry;
    }, [visitedCountryYears]);
    const [position, setPosition] = useState({
        coordinates: [0, 15] as [number, number],
        zoom: 1,
    });
    const [hoveredCountry, setHoveredCountry] = useState<HoveredCountry>(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const [selectedCountry, setSelectedCountry] = useState<HoveredCountry>(null);
    const [mapMode, setMapMode] = useState<"view" | "scratch">("view");
    const [scratchingCode, setScratchingCode] = useState<string | null>(null);
    const [scratchNotice, setScratchNotice] = useState<ScratchNotice>(null);
    const [showScratchHint, setShowScratchHint] = useState(false);
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const scratchAudioRef = useRef<HTMLAudioElement | null>(null);
    const scratchAudioStopTimerRef = useRef<number | null>(null);

    const visitedCount = highlightedSet.size;
    const selectableCountryCount = COUNTRY_OPTIONS.length;
    const percentage = Math.round((visitedCount / selectableCountryCount) * 100);
    const continentsExplored = new Set(
        Array.from(highlightedSet)
            .map((code) => getCountryOptionByIso3(code)?.continent)
            .filter((continent): continent is string => Boolean(continent))
    ).size;
    const activeCountry = selectedCountry || hoveredCountry;

    useEffect(() => {
        setManualScratchCodes(normalizeScratchCodes(scratchedCountryCodes));
    }, [scratchedCountryCodes]);

    useEffect(() => {
        if (!scratchNotice) return;
        const timeout = window.setTimeout(() => setScratchNotice(null), 4200);
        return () => window.clearTimeout(timeout);
    }, [scratchNotice]);

    useEffect(() => {
        if (!scratchNotice) return;

        function dismissNotice() {
            setScratchNotice(null);
        }

        function dismissOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setScratchNotice(null);
            }
        }

        const timeout = window.setTimeout(() => {
            document.addEventListener("pointerdown", dismissNotice, {
                once: true,
            });
            document.addEventListener("keydown", dismissOnEscape);
        }, 0);

        return () => {
            window.clearTimeout(timeout);
            document.removeEventListener("pointerdown", dismissNotice);
            document.removeEventListener("keydown", dismissOnEscape);
        };
    }, [scratchNotice]);

    useEffect(() => {
        const element = mapContainerRef.current;
        if (!element || typeof window === "undefined") return;

        const storageKey = "vaivia:scratch-map-hint-views";
        const viewCount = Number(window.localStorage.getItem(storageKey) || "0");
        if (viewCount >= 3) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const [entry] = entries;
                if (!entry?.isIntersecting) return;
                setShowScratchHint(true);
                window.localStorage.setItem(storageKey, String(viewCount + 1));
                observer.disconnect();
            },
            { threshold: 0.45 }
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        return () => {
            if (scratchAudioStopTimerRef.current) {
                window.clearTimeout(scratchAudioStopTimerRef.current);
            }
            scratchAudioRef.current?.pause();
        };
    }, []);

    function playScratchSound() {
        if (typeof window === "undefined") return;

        if (!scratchAudioRef.current) {
            scratchAudioRef.current = new Audio(SCRATCH_SOUND_URL);
            scratchAudioRef.current.preload = "auto";
            scratchAudioRef.current.volume = 0.58;
        }

        if (scratchAudioStopTimerRef.current) {
            window.clearTimeout(scratchAudioStopTimerRef.current);
        }

        const audio = scratchAudioRef.current;
        audio.pause();
        audio.currentTime = 0;

        void audio.play().catch(() => {
            // Some browsers may still block audio despite the click gesture.
        });

        scratchAudioStopTimerRef.current = window.setTimeout(() => {
            audio.pause();
            audio.currentTime = 0;
            scratchAudioStopTimerRef.current = null;
        }, 3600);
    }

    function changeZoom(delta: number) {
        setPosition((current) => ({
            ...current,
            zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom + delta)),
        }));
    }

    function resetMap() {
        setPosition({ coordinates: [0, 15], zoom: 1 });
        setSelectedCountry(null);
    }

    function getScratchNoticePosition(event: MouseEvent<SVGPathElement>) {
        const rect = mapContainerRef.current?.getBoundingClientRect();
        if (!rect) {
            return {
                x: event.clientX + 14,
                y: event.clientY + 14,
            };
        }

        const maxX = Math.max(12, rect.width - 260);
        const maxY = Math.max(12, rect.height - 92);

        return {
            x: Math.min(Math.max(event.clientX - rect.left + 14, 12), maxX),
            y: Math.min(Math.max(event.clientY - rect.top + 14, 12), maxY),
        };
    }

    async function handleCountryClick(
        country: NonNullable<HoveredCountry>,
        event: MouseEvent<SVGPathElement>
    ) {
        setHoveredCountry(null);
        setSelectedCountry(mapMode === "scratch" ? null : country);

        if (mapMode !== "scratch" || !country.code || !userId) return;

        const countryCode = normalizeScratchCode(country.code);
        const currentManualScratchCodes = normalizeScratchCodes(manualScratchCodes);
        const isPassportStamped = passportStampedSet.has(countryCode);
        const isManuallyScratched = currentManualScratchCodes.includes(countryCode);
        const noticePosition = getScratchNoticePosition(event);

        if (isPassportStamped) {
            setScratchNotice({
                message: PASSPORT_STAMP_UNSCRATCH_MESSAGE,
                ...noticePosition,
            });
            return;
        }

        const supabase = createClient();

        if (isManuallyScratched) {
            const previousCodes = currentManualScratchCodes;
            const nextCodes = previousCodes.filter(
                (code) => normalizeScratchCode(code) !== countryCode
            );
            setManualScratchCodes(nextCodes);
            onScratchMapChange?.(nextCodes);

            const { error } = await (supabase.from as any)(
                "user_scratch_map_countries"
            )
                .delete()
                .eq("user_id", userId)
                .eq("country_code", countryCode);

            if (error) {
                setManualScratchCodes(previousCodes);
                onScratchMapChange?.(previousCodes);
                setScratchNotice({
                    message: "Could not unscratch that country. Please try again.",
                    ...noticePosition,
                });
            }
            return;
        }

        setScratchingCode(countryCode);
        playScratchSound();
        const previousCodes = normalizeScratchCodes(manualScratchCodes);
        const nextCodes = normalizeScratchCodes([...previousCodes, countryCode]);
        setManualScratchCodes(nextCodes);
        onScratchMapChange?.(nextCodes);

        const { error } = await (supabase.from as any)("user_scratch_map_countries")
            .upsert(
                {
                    user_id: userId,
                    country_code: countryCode,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id,country_code" }
            );

        if (error) {
            setManualScratchCodes(previousCodes);
            onScratchMapChange?.(previousCodes);
            setScratchNotice({
                message: "Could not scratch that country. Please try again.",
                ...noticePosition,
            });
            setScratchingCode(null);
            return;
        }

        window.setTimeout(() => {
            setScratchingCode((currentCode) =>
                currentCode === countryCode ? null : currentCode
            );
        }, 3600);
    }

    return (
        <section className={`space-y-5 ${className}`}>
            <div className={statsClassName || "grid gap-3 md:grid-cols-3"}>
                <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                        Countries visited
                    </p>
                    <p className="mt-2 text-3xl font-black text-white">
                        {visitedCount}
                    </p>
                </div>
                <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                        World explored
                    </p>
                    <p className="mt-2 text-3xl font-black text-white">
                        {percentage}%
                    </p>
                </div>
                <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                        Continents explored
                    </p>
                    <p className="mt-2 text-3xl font-black text-white">
                        {continentsExplored}
                    </p>
                </div>
            </div>

            {visitedCount === 0 ? (
                <div className="rounded-[1.5rem] border border-lime-300/20 bg-lime-300/[0.08] p-5 text-white shadow-xl shadow-black/20">
                    <h2 className="text-2xl font-black">Your world is waiting.</h2>
                    <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-300">
                        Add countries to your Passport Stamps in Settings and they’ll
                        appear here.
                    </p>
                    <Link
                        href={settingsHref}
                        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:bg-lime-200"
                    >
                        Add passport stamps
                    </Link>
                </div>
            ) : null}

            <div
                ref={mapContainerRef}
                className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_20%_15%,rgba(var(--vaivia-neon-rgb),0.16),transparent_26%),linear-gradient(135deg,#030712,#111827_46%,#05030b)] p-3 shadow-2xl shadow-black/40"
            >
                <div className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:32px_32px]" />
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0,rgba(0,0,0,0.42)_72%)]" />

                <div className="absolute left-4 top-4 z-20 flex rounded-full border border-white/10 bg-slate-950/80 p-1 shadow-xl shadow-black/30 backdrop-blur-xl">
                    {(["view", "scratch"] as const).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => {
                                setMapMode(mode);
                                setShowScratchHint(false);
                            }}
                            className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${
                                mapMode === mode
                                    ? "bg-lime-300 text-slate-950"
                                    : "text-slate-300 hover:bg-white/[0.08] hover:text-white"
                            }`}
                            aria-pressed={mapMode === mode}
                        >
                            {mode === "view" ? "View mode" : "Scratch mode"}
                        </button>
                    ))}
                    {showScratchHint ? (
                        <div className="absolute left-0 top-[calc(100%+0.75rem)] w-64 rounded-2xl border border-lime-300/25 bg-slate-950/95 p-4 text-sm font-bold leading-6 text-white shadow-2xl shadow-black/50">
                            <button
                                type="button"
                                onClick={() => setShowScratchHint(false)}
                                className="absolute right-2 top-2 rounded-full px-2 text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
                                aria-label="Dismiss scratch mode tip"
                            >
                                ×
                            </button>
                            <p className="pr-5 text-lime-200">Scratch mode</p>
                            <p className="mt-1 text-xs font-semibold text-slate-300">
                                Activate scratch mode to scratch off countries you have visited.
                            </p>
                        </div>
                    ) : null}
                </div>

                <div className="absolute right-4 top-4 z-20 flex gap-2">
                    <button
                        type="button"
                        onClick={() => changeZoom(0.75)}
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-slate-950/80 text-lime-200 shadow-xl shadow-black/30 backdrop-blur-xl transition hover:bg-lime-300 hover:text-slate-950"
                        aria-label="Zoom in on map"
                    >
                        <Plus className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => changeZoom(-0.75)}
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-slate-950/80 text-lime-200 shadow-xl shadow-black/30 backdrop-blur-xl transition hover:bg-lime-300 hover:text-slate-950"
                        aria-label="Zoom out of map"
                    >
                        <Minus className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={resetMap}
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-slate-950/80 text-lime-200 shadow-xl shadow-black/30 backdrop-blur-xl transition hover:bg-lime-300 hover:text-slate-950"
                        aria-label="Reset map"
                    >
                        <RotateCcw className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>

                <div className={mapViewportClassName || "relative aspect-[2/1] w-full"}>
                    <ComposableMap
                        projection="geoEqualEarth"
                        className="h-full w-full"
                        role="img"
                        aria-label="World scratch map showing visited countries"
                    >
                        <defs>
                            <pattern
                                id="scratch-card-cover"
                                patternUnits="userSpaceOnUse"
                                width="34"
                                height="24"
                                patternTransform="rotate(-17)"
                            >
                                <animateTransform
                                    attributeName="patternTransform"
                                    type="translate"
                                    values="0 0; 16 0; -9 0; 22 0; -4 0; 0 0"
                                    dur="0.7s"
                                    repeatCount="indefinite"
                                    additive="sum"
                                />
                                <rect
                                    width="34"
                                    height="24"
                                    fill="rgba(15,23,42,0.88)"
                                />
                                <path
                                    d="M-5 7 C 4 2, 10 12, 18 7 S 31 2, 39 8 M-4 17 C 6 12, 11 22, 20 16 S 31 12, 40 18"
                                    fill="none"
                                    stroke="rgba(226,232,240,0.72)"
                                    strokeLinecap="round"
                                    strokeWidth="2"
                                />
                            </pattern>
                            <filter id="scratch-texture">
                                <feTurbulence
                                    type="fractalNoise"
                                    baseFrequency="0.85"
                                    numOctaves="2"
                                    seed="7"
                                    result="noise"
                                />
                                <feDisplacementMap
                                    in="SourceGraphic"
                                    in2="noise"
                                    scale="0.8"
                                    xChannelSelector="R"
                                    yChannelSelector="G"
                                />
                            </filter>
                            <filter id="visited-glow">
                                <feDropShadow
                                    dx="0"
                                    dy="0"
                                    stdDeviation="1.6"
                                    floodColor="#bef264"
                                    floodOpacity="0.55"
                                />
                            </filter>
                        </defs>
                        <ZoomableGroup
                            zoom={position.zoom}
                            center={position.coordinates}
                            minZoom={MIN_ZOOM}
                            maxZoom={MAX_ZOOM}
                            onMoveEnd={(nextPosition) => {
                                setPosition({
                                    coordinates: nextPosition.coordinates as [
                                        number,
                                        number,
                                    ],
                                    zoom: nextPosition.zoom,
                                });
                            }}
                        >
                            <Geographies geography={GEO_URL}>
                                {({ geographies }) =>
                                    geographies.map((geo: GeographyRecord) => {
                                        const country = getCountryDetails(
                                            geo,
                                            passportStampedSet,
                                            manuallyScratchedSet,
                                            visitedYearsByCountry
                                        );
                                        const isScratching =
                                            country.visited &&
                                            scratchingCode === country.code;

                                        return (
                                            <g key={geo.rsmKey}>
                                                <Geography
                                                geography={geo}
                                                tabIndex={0}
                                                aria-label={`${country.name}, ${
                                                    country.visited
                                                        ? "visited"
                                                        : "not visited"
                                                }`}
                                                onMouseEnter={(event) => {
                                                    setHoveredCountry(country);
                                                    setTooltipPosition({
                                                        x: event.clientX,
                                                        y: event.clientY,
                                                    });
                                                }}
                                                onMouseMove={(event) => {
                                                    setTooltipPosition({
                                                        x: event.clientX,
                                                        y: event.clientY,
                                                    });
                                                }}
                                                onMouseLeave={() => {
                                                    setHoveredCountry(null);
                                                }}
                                                onFocus={() =>
                                                    setSelectedCountry(country)
                                                }
                                                onClick={(event) =>
                                                    handleCountryClick(country, event)
                                                }
                                                style={{
                                                    default: {
                                                        fill: country.visited
                                                            ? "#bef264"
                                                            : "rgba(255,255,255,0.08)",
                                                        stroke: country.visited
                                                            ? "rgba(255,255,255,0.52)"
                                                            : "rgba(255,255,255,0.16)",
                                                        strokeWidth: country.visited
                                                            ? 0.7
                                                            : 0.5,
                                                        outline: "none",
                                                        filter: country.visited
                                                            ? "url(#visited-glow) url(#scratch-texture)"
                                                            : "url(#scratch-texture)",
                                                    },
                                                    hover: {
                                                        fill: country.visited
                                                            ? "#d9f99d"
                                                            : "rgba(255,255,255,0.16)",
                                                        stroke: "rgba(255,255,255,0.72)",
                                                        strokeWidth: 0.9,
                                                        outline: "none",
                                                        cursor: "pointer",
                                                    },
                                                    pressed: {
                                                        fill: country.visited
                                                            ? "#bef264"
                                                            : "rgba(255,255,255,0.2)",
                                                        outline: "none",
                                                    },
                                                }}
                                            />
                                                {isScratching ? (
                                                    <>
                                                        <Geography
                                                            geography={geo}
                                                            className="vaivia-map-scratch-cover"
                                                            aria-hidden="true"
                                                            focusable="false"
                                                            style={{
                                                                default: {
                                                                    fill: "url(#scratch-card-cover)",
                                                                    stroke: "rgba(226,232,240,0.55)",
                                                                    strokeWidth: 0.65,
                                                                    outline: "none",
                                                                    pointerEvents: "none",
                                                                },
                                                                hover: {
                                                                    fill: "url(#scratch-card-cover)",
                                                                    stroke: "rgba(226,232,240,0.55)",
                                                                    strokeWidth: 0.65,
                                                                    outline: "none",
                                                                    pointerEvents: "none",
                                                                },
                                                                pressed: {
                                                                    fill: "url(#scratch-card-cover)",
                                                                    outline: "none",
                                                                    pointerEvents: "none",
                                                                },
                                                            }}
                                                        />
                                                        <Geography
                                                            geography={geo}
                                                            className="vaivia-map-scratch-scrub"
                                                            aria-hidden="true"
                                                            focusable="false"
                                                            style={{
                                                                default: {
                                                                    fill: "rgba(255,255,255,0.72)",
                                                                    stroke: "rgba(255,255,255,0.4)",
                                                                    strokeWidth: 0.45,
                                                                    outline: "none",
                                                                    pointerEvents: "none",
                                                                },
                                                                hover: {
                                                                    fill: "rgba(255,255,255,0.72)",
                                                                    stroke: "rgba(255,255,255,0.4)",
                                                                    strokeWidth: 0.45,
                                                                    outline: "none",
                                                                    pointerEvents: "none",
                                                                },
                                                                pressed: {
                                                                    fill: "rgba(255,255,255,0.72)",
                                                                    outline: "none",
                                                                    pointerEvents: "none",
                                                                },
                                                            }}
                                                        />
                                                    </>
                                                ) : null}
                                            </g>
                                        );
                                    })
                                }
                            </Geographies>
                        </ZoomableGroup>
                    </ComposableMap>
                </div>

                {hoveredCountry ? (
                    <div
                        className="pointer-events-none fixed z-[120] hidden rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-sm font-bold text-white shadow-2xl shadow-black/40 backdrop-blur-xl md:block"
                        style={{
                            left: tooltipPosition.x + 14,
                            top: tooltipPosition.y + 14,
                        }}
                    >
                        <p>
                            <span aria-hidden="true">{hoveredCountry.emoji}</span>{" "}
                            {hoveredCountry.name}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-lime-200">
                            {hoveredCountry.passportStamped
                                ? (
                                    <VisitedYearsDisplay
                                        years={hoveredCountry.visitedYears}
                                    />
                                )
                                : hoveredCountry.manuallyScratched
                                  ? "Scratched"
                                  : "Not yet visited"}
                        </p>
                    </div>
                ) : null}
                {scratchNotice ? (
                    <div
                        className="pointer-events-none absolute z-[121] flex max-w-xs items-start gap-2 rounded-2xl border border-lime-300/25 bg-slate-950/95 px-4 py-3 text-xs font-bold leading-5 text-lime-50 shadow-2xl shadow-black/50 backdrop-blur-xl"
                        style={{
                            left: scratchNotice.x,
                            top: scratchNotice.y,
                        }}
                    >
                        <AlertTriangle
                            className="mt-0.5 h-4 w-4 shrink-0 text-lime-200"
                            aria-hidden="true"
                        />
                        <span>{scratchNotice.message}</span>
                    </div>
                ) : null}
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4 text-white shadow-xl shadow-black/20 md:hidden">
                {activeCountry ? (
                    <>
                        <p className="text-lg font-black">
                            <span aria-hidden="true">{activeCountry.emoji}</span>{" "}
                            {activeCountry.name}
                        </p>
                        <p className="mt-1 text-sm font-bold text-lime-200">
                            {activeCountry.passportStamped
                                ? (
                                    <VisitedYearsDisplay
                                        years={activeCountry.visitedYears}
                                    />
                                )
                                : activeCountry.manuallyScratched
                                  ? "Scratched"
                                  : "Not yet visited"}
                        </p>
                    </>
                ) : (
                    <p className="text-sm font-bold text-slate-300">
                        Tap a country to see whether it has a passport stamp.
                    </p>
                )}
            </div>
        </section>
    );
}
