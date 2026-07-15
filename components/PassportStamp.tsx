"use client";

import type { KeyboardEvent } from "react";
import {
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";

export type PassportStampProps = {
    countryName: string;
    countryCode: string;
    flagEmoji?: string | null;
    flagSvgUrl?: string | null;
    firstVisitYear?: number | string | null;
    welcomeLabel?: string | null;
    arrivalLabel?: string | null;
    airportCode?: string | null;
    airportCity?: string | null;
    portOfEntryLabel?: string | null;
    size?: "sm" | "md" | "lg";
    onClick?: () => void;
    removable?: boolean;
    onRemove?: () => void;
};

const sizeClasses = {
    sm: "h-40 w-40",
    md: "h-48 w-48",
    lg: "h-60 w-60",
};

const yearClasses = {
    sm: "text-4xl",
    md: "text-5xl",
    lg: "text-6xl",
};

const welcomeWidths = {
    sm: 106,
    md: 126,
    lg: 154,
};

const welcomeFontBounds = {
    sm: { min: 7, max: 10 },
    md: { min: 8, max: 12 },
    lg: { min: 9, max: 14 },
};

const flagBadgeClasses = {
    sm: "top-[16px] h-11 w-11 text-2xl",
    md: "top-[20px] h-12 w-12 text-3xl",
    lg: "top-[28px] h-14 w-14 text-3xl",
};

const welcomePositionClasses = {
    sm: "top-[63px]",
    md: "top-[76px]",
    lg: "top-[98px]",
};

const yearPositionClasses = {
    sm: "top-[78px]",
    md: "top-[94px]",
    lg: "top-[122px]",
};

const STAMP_CENTER = 80;
const ARC_RADIUS = 72.5;
const ARC_SAFETY_PADDING = 22;
const TOP_ARC_PATH = getArcPath(218, 322, 1, 69.25);
const BOTTOM_ARC_PATH = getArcPath(142, 38, 0);

type ArcTextFit = {
    fontSize: number;
    letterSpacing: string;
    textLength?: number;
};

const DEFAULT_COUNTRY_FIT: ArcTextFit = {
    fontSize: 10,
    letterSpacing: "0.16em",
};

const DEFAULT_ENTRY_FIT: ArcTextFit = {
    fontSize: 8.5,
    letterSpacing: "0.14em",
};

const MIN_COUNTRY_ARC_FONT_SIZE = 4.25;
const MIN_ENTRY_ARC_FONT_SIZE = 4;
const MIN_ARC_LETTER_SPACING = 0;

const WELCOME_LABEL_BY_COUNTRY_CODE: Record<string, string> = {
    BE: "WELKOM",
    BG: "ДОБРЕ ДОШЛИ",
    BR: "BEM-VINDO",
    CA: "WELCOME",
    CN: "欢迎",
    CU: "BIENVENIDO",
    DE: "WILLKOMMEN",
    ES: "BIENVENIDO",
    FR: "BIENVENUE",
    GB: "WELCOME",
    GR: "ΚΑΛΩΣ ΗΡΘΑΤΕ",
    GT: "BIENVENIDO",
    HK: "歡迎",
    HR: "DOBRODOŠLI",
    HU: "ÜDVÖZÖLJÜK",
    ID: "SELAMAT DATANG",
    IT: "BENVENUTO",
    JP: "ようこそ",
    KR: "환영합니다",
    MX: "BIENVENIDO",
    NL: "WELKOM",
    PE: "BIENVENIDO",
    PT: "BEM-VINDO",
    TH: "ยินดีต้อนรับ",
    TR: "HOŞ GELDİNİZ",
    TW: "歡迎",
    US: "WELCOME",
    VN: "CHÀO MỪNG",
};

function getCirclePoint(radius: number, angleInDegrees: number) {
    const angleInRadians = (angleInDegrees * Math.PI) / 180;

    return {
        x: STAMP_CENTER + radius * Math.cos(angleInRadians),
        y: STAMP_CENTER + radius * Math.sin(angleInRadians),
    };
}

function getArcPath(
    startAngle: number,
    endAngle: number,
    sweepFlag: 0 | 1,
    radius = ARC_RADIUS
) {
    const start = getCirclePoint(radius, startAngle);
    const end = getCirclePoint(radius, endAngle);

    return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 0 ${sweepFlag} ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

function resolveWelcomeLabel(countryCode: string, label?: string | null) {
    const candidate = label?.trim() || "";
    const localized = WELCOME_LABEL_BY_COUNTRY_CODE[countryCode.trim().toUpperCase()];

    if (
        candidate &&
        !(
            candidate.toUpperCase() === "WELCOME" &&
            localized &&
            localized.toUpperCase() !== "WELCOME"
        )
    ) {
        return candidate;
    }

    return localized || candidate || "WELCOME";
}

function formatAirportLabel(
    airportCode?: string | null,
    airportCity?: string | null,
    portOfEntryLabel?: string | null
) {
    const entry = portOfEntryLabel?.trim().toUpperCase();
    const code = airportCode?.trim().toUpperCase();
    const city = airportCity?.trim().toUpperCase();

    if (entry) return entry;
    if (city && code) return `${city} • ${code}`;
    if (code) return code;
    if (city) return city;
    return "ENTRY";
}

function getWelcomeLabelStyle(label: string, size: PassportStampProps["size"]) {
    const resolvedSize = size || "md";
    const characterCount = Math.max(Array.from(label).length, 1);
    const bounds = welcomeFontBounds[resolvedSize];
    const width = welcomeWidths[resolvedSize];
    const fontSize = Math.max(
        bounds.min,
        Math.min(bounds.max, Math.floor(width / (characterCount * 0.62)))
    );

    return {
        width: `${width}px`,
        fontSize: `${fontSize}px`,
    };
}

function getFallbackArcFit(
    label: string,
    maxFontSize: number,
    minFontSize: number,
    baseLetterSpacing: number
): ArcTextFit {
    const characterCount = Math.max(Array.from(label).length, 1);
    const estimatedFontSize = Math.max(
        minFontSize,
        Math.min(maxFontSize, 98 / (characterCount * 0.82))
    );
    const estimatedLetterSpacing = Math.max(
        MIN_ARC_LETTER_SPACING,
        baseLetterSpacing - Math.max(0, characterCount - 12) * 0.009
    );

    return {
        fontSize: estimatedFontSize,
        letterSpacing: `${estimatedLetterSpacing}em`,
    };
}

function fitSvgTextToPath({
    textElement,
    pathElement,
    label,
    maxFontSize,
    minFontSize,
    baseLetterSpacing,
}: {
    textElement: SVGTextElement | null;
    pathElement: SVGPathElement | null;
    label: string;
    maxFontSize: number;
    minFontSize: number;
    baseLetterSpacing: number;
}): ArcTextFit {
    if (!textElement || !pathElement) {
        return getFallbackArcFit(
            label,
            maxFontSize,
            minFontSize,
            baseLetterSpacing
        );
    }

    try {
        const usableLength = Math.max(
            0,
            pathElement.getTotalLength() - ARC_SAFETY_PADDING
        );
        const characterCount = Math.max(Array.from(label).length, 1);
        let fontSize = maxFontSize;
        let letterSpacing = Math.max(
            MIN_ARC_LETTER_SPACING,
            baseLetterSpacing - Math.max(0, characterCount - 12) * 0.006
        );

        textElement.removeAttribute("textLength");
        textElement.removeAttribute("lengthAdjust");

        const applyTextStyle = () => {
            textElement.style.fontSize = `${fontSize}px`;
            textElement.style.letterSpacing = `${letterSpacing}em`;
        };

        applyTextStyle();

        while (
            fontSize > minFontSize &&
            textElement.getComputedTextLength() > usableLength
        ) {
            fontSize = Math.max(minFontSize, fontSize - 0.25);
            applyTextStyle();
        }

        while (
            letterSpacing > MIN_ARC_LETTER_SPACING &&
            textElement.getComputedTextLength() > usableLength
        ) {
            letterSpacing = Math.max(MIN_ARC_LETTER_SPACING, letterSpacing - 0.01);
            applyTextStyle();
        }

        if (textElement.getComputedTextLength() > usableLength) {
            return {
                fontSize,
                letterSpacing: `${letterSpacing}em`,
                textLength: usableLength,
            };
        }

        return {
            fontSize,
            letterSpacing: `${letterSpacing}em`,
        };
    } catch {
        return getFallbackArcFit(
            label,
            maxFontSize,
            minFontSize,
            baseLetterSpacing
        );
    }
}

function areArcFitsEqual(a: ArcTextFit, b: ArcTextFit) {
    return (
        a.fontSize === b.fontSize &&
        a.letterSpacing === b.letterSpacing &&
        a.textLength === b.textLength
    );
}

export default function PassportStamp({
    countryName,
    countryCode,
    flagEmoji,
    flagSvgUrl,
    firstVisitYear,
    welcomeLabel,
    arrivalLabel,
    airportCode,
    airportCity,
    portOfEntryLabel,
    size = "md",
    onClick,
    removable = false,
    onRemove,
}: PassportStampProps) {
    const stampId = useId().replaceAll(":", "");
    const topPathId = `passport-stamp-top-${stampId}`;
    const bottomPathId = `passport-stamp-bottom-${stampId}`;
    const isInteractive = Boolean(onClick);
    const normalizedCountryCode = countryCode.trim().toUpperCase();
    const shouldUseNativeFlagEmoji = normalizedCountryCode === "TW";
    const resolvedFlagEmoji = shouldUseNativeFlagEmoji
        ? "🇹🇼"
        : flagEmoji || countryCode;
    const resolvedFlagSvgUrl = shouldUseNativeFlagEmoji ? null : flagSvgUrl;
    const topPathRef = useRef<SVGPathElement | null>(null);
    const bottomPathRef = useRef<SVGPathElement | null>(null);
    const countryTextRef = useRef<SVGTextElement | null>(null);
    const entryTextRef = useRef<SVGTextElement | null>(null);
    const [countryArcFit, setCountryArcFit] =
        useState<ArcTextFit>(DEFAULT_COUNTRY_FIT);
    const [entryArcFit, setEntryArcFit] =
        useState<ArcTextFit>(DEFAULT_ENTRY_FIT);
    const yearLabel = firstVisitYear || "VISITED";
    const stampWelcomeLabel = resolveWelcomeLabel(
        countryCode,
        welcomeLabel || arrivalLabel
    );
    const welcomeLabelStyle = getWelcomeLabelStyle(stampWelcomeLabel, size);
    const entryLabel = formatAirportLabel(
        airportCode,
        airportCity,
        portOfEntryLabel
    );
    const countryArcTextStyle = useMemo(
        () => ({
            fontSize: `${countryArcFit.fontSize}px`,
            letterSpacing: countryArcFit.letterSpacing,
        }),
        [countryArcFit.fontSize, countryArcFit.letterSpacing]
    );
    const entryArcTextStyle = useMemo(
        () => ({
            fontSize: `${entryArcFit.fontSize}px`,
            letterSpacing: entryArcFit.letterSpacing,
        }),
        [entryArcFit.fontSize, entryArcFit.letterSpacing]
    );

    useLayoutEffect(() => {
        const nextCountryFit = fitSvgTextToPath({
            textElement: countryTextRef.current,
            pathElement: topPathRef.current,
            label: countryName,
            maxFontSize: 10,
            minFontSize: MIN_COUNTRY_ARC_FONT_SIZE,
            baseLetterSpacing: 0.16,
        });
        const nextEntryFit = fitSvgTextToPath({
            textElement: entryTextRef.current,
            pathElement: bottomPathRef.current,
            label: entryLabel,
            maxFontSize: 8.5,
            minFontSize: MIN_ENTRY_ARC_FONT_SIZE,
            baseLetterSpacing: 0.14,
        });

        setCountryArcFit((current) =>
            areArcFitsEqual(current, nextCountryFit) ? current : nextCountryFit
        );
        setEntryArcFit((current) =>
            areArcFitsEqual(current, nextEntryFit) ? current : nextEntryFit
        );
    }, [countryName, entryLabel]);

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
        }
    }

    return (
        <div
            role={isInteractive ? "button" : undefined}
            tabIndex={isInteractive ? 0 : undefined}
            onClick={onClick}
            onKeyDown={handleKeyDown}
            className={`group/stamp relative inline-flex ${sizeClasses[size]} shrink-0 items-center justify-center rounded-full text-lime-200 transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-lime-200/70 ${isInteractive ? "cursor-pointer" : ""}`}
            aria-label={`${countryName} passport stamp`}
        >
            <span className="absolute inset-0 z-0 rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(var(--vaivia-neon-rgb),0.14),transparent_34%),repeating-radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.08)_0_1px,transparent_1px_7px)] opacity-55 mix-blend-screen" />
            <span className="absolute inset-0 z-10 rounded-full border-2 border-lime-200/80 shadow-[0_0_34px_rgba(var(--vaivia-neon-rgb),0.2)]" />
            <span className="absolute inset-[14px] z-10 rounded-full border border-lime-200/55" />
            <span className="absolute inset-[27px] z-20 rounded-full border border-dashed border-lime-200/35" />

            <svg
                className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible"
                viewBox="0 0 160 160"
                aria-hidden="true"
            >
                <defs>
                    <path
                        ref={topPathRef}
                        id={topPathId}
                        d={TOP_ARC_PATH}
                        fill="none"
                    />
                    <path
                        ref={bottomPathRef}
                        id={bottomPathId}
                        d={BOTTOM_ARC_PATH}
                        fill="none"
                    />
                </defs>
                <text
                    ref={countryTextRef}
                    className="fill-current font-black uppercase"
                    style={countryArcTextStyle}
                    textLength={countryArcFit.textLength}
                    lengthAdjust={countryArcFit.textLength ? "spacing" : undefined}
                >
                    <textPath href={`#${topPathId}`} startOffset="50%" textAnchor="middle">
                        {countryName}
                    </textPath>
                </text>
                <text
                    ref={entryTextRef}
                    className="fill-current font-black uppercase opacity-90"
                    style={entryArcTextStyle}
                    textLength={entryArcFit.textLength}
                    lengthAdjust={entryArcFit.textLength ? "spacing" : undefined}
                >
                    <textPath href={`#${bottomPathId}`} startOffset="50%" textAnchor="middle">
                        {entryLabel}
                    </textPath>
                </text>
            </svg>

            <span
                className={`absolute left-1/2 z-40 flex -translate-x-1/2 items-center justify-center overflow-hidden rounded-full border border-lime-200/30 bg-slate-950 text-center shadow-xl shadow-black/30 ${flagBadgeClasses[size]}`}
            >
                {resolvedFlagSvgUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={resolvedFlagSvgUrl}
                        alt=""
                        className="max-h-[58%] max-w-[76%] object-contain"
                    />
                ) : (
                    <span className="vaivia-flag-emoji" aria-hidden="true">
                        {resolvedFlagEmoji}
                    </span>
                )}
            </span>
            <span
                className={`absolute left-1/2 z-40 block -translate-x-1/2 overflow-hidden whitespace-nowrap text-center font-black uppercase leading-none tracking-[0.16em] text-lime-100 ${welcomePositionClasses[size]}`}
                style={welcomeLabelStyle}
            >
                {stampWelcomeLabel}
            </span>
            <span
                className={`absolute left-1/2 z-40 -translate-x-1/2 ${yearPositionClasses[size]} ${yearClasses[size]} font-black leading-none tracking-[-0.05em] text-white [text-shadow:0_0_20px_rgba(var(--vaivia-neon-rgb),0.28)]`}
            >
                {yearLabel}
            </span>

            {removable && onRemove ? (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onRemove();
                    }}
                    className="absolute right-1 top-1 z-50 flex h-7 w-7 items-center justify-center rounded-full border border-red-300/30 bg-slate-950/90 text-xs font-black text-red-100 opacity-0 shadow-xl shadow-black/40 transition hover:bg-red-400/20 group-hover/stamp:opacity-100"
                    aria-label={`Remove ${countryName}`}
                >
                    ×
                </button>
            ) : null}
        </div>
    );
}
