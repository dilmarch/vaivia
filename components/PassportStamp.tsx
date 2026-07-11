"use client";

import { Plane } from "lucide-react";
import { useId } from "react";

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
    size?: "sm" | "md" | "lg";
    onClick?: () => void;
    removable?: boolean;
    onRemove?: () => void;
};

const sizeClasses = {
    sm: "h-32 w-32",
    md: "h-40 w-40",
    lg: "h-52 w-52",
};

const yearClasses = {
    sm: "text-3xl",
    md: "text-4xl",
    lg: "text-5xl",
};

const WELCOME_LABEL_BY_COUNTRY_CODE: Record<string, string> = {
    BR: "BEM-VINDO",
    CA: "WELCOME",
    CN: "欢迎",
    DE: "WILLKOMMEN",
    ES: "BIENVENIDO",
    FR: "BIENVENUE",
    GB: "WELCOME",
    GR: "ΚΑΛΩΣ ΗΡΘΑΤΕ",
    IT: "BENVENUTO",
    JP: "ようこそ",
    KR: "환영합니다",
    MX: "BIENVENIDO",
    NL: "WELKOM",
    PT: "BEM-VINDO",
    TH: "ยินดีต้อนรับ",
    TR: "HOŞ GELDİNİZ",
    US: "WELCOME",
    VN: "CHÀO MỪNG",
};

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

function formatAirportLabel(airportCode?: string | null, airportCity?: string | null) {
    const code = airportCode?.trim().toUpperCase();
    const city = airportCity?.trim().toUpperCase();

    if (city && code) return `${city} • ${code}`;
    if (code) return code;
    if (city) return city;
    return "ENTRY";
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
    size = "md",
    onClick,
    removable = false,
    onRemove,
}: PassportStampProps) {
    const stampId = useId().replaceAll(":", "");
    const topPathId = `passport-stamp-top-${stampId}`;
    const bottomPathId = `passport-stamp-bottom-${stampId}`;
    const Wrapper = onClick ? "button" : "div";
    const yearLabel = firstVisitYear || "VISITED";
    const stampWelcomeLabel = resolveWelcomeLabel(
        countryCode,
        welcomeLabel || arrivalLabel
    );

    return (
        <Wrapper
            type={onClick ? "button" : undefined}
            onClick={onClick}
            className={`group/stamp relative inline-flex ${sizeClasses[size]} shrink-0 items-center justify-center rounded-full text-lime-200 transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-lime-200/70`}
            aria-label={`${countryName} passport stamp`}
        >
            <span className="absolute inset-0 rounded-full border-2 border-lime-200/80 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.18)]" />
            <span className="absolute inset-[7px] rounded-full border border-lime-200/55" />
            <span className="absolute inset-[16px] rounded-full border border-dashed border-lime-200/35" />
            <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(var(--vaivia-neon-rgb),0.14),transparent_34%),repeating-radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.08)_0_1px,transparent_1px_7px)] opacity-55 mix-blend-screen" />

            <svg
                className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                viewBox="0 0 160 160"
                aria-hidden="true"
            >
                <defs>
                    <path
                        id={topPathId}
                        d="M 23 82 A 57 57 0 0 1 137 82"
                        fill="none"
                    />
                    <path
                        id={bottomPathId}
                        d="M 137 92 A 57 57 0 0 1 23 92"
                        fill="none"
                    />
                </defs>
                <text className="fill-current text-[11px] font-black uppercase tracking-[0.22em]">
                    <textPath href={`#${topPathId}`} startOffset="50%" textAnchor="middle">
                        {countryName}
                    </textPath>
                </text>
                <text className="fill-current text-[9px] font-black uppercase tracking-[0.18em] opacity-85">
                    <textPath href={`#${bottomPathId}`} startOffset="50%" textAnchor="middle">
                        {formatAirportLabel(airportCode, airportCity)}
                    </textPath>
                </text>
            </svg>

            <span className="relative z-10 flex flex-col items-center text-center">
                <span className="mb-1 flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-lime-200/30 bg-slate-950/70 text-2xl shadow-xl shadow-black/30">
                    {flagSvgUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={flagSvgUrl}
                            alt=""
                            className="h-full w-full object-cover"
                        />
                    ) : (
                        <span aria-hidden="true">{flagEmoji || countryCode}</span>
                    )}
                </span>
                <span
                    className={`${yearClasses[size]} font-black leading-none tracking-[-0.05em] text-white [text-shadow:0_0_20px_rgba(var(--vaivia-neon-rgb),0.28)]`}
                >
                    {yearLabel}
                </span>
                <span className="mt-1 max-w-24 truncate text-[10px] font-black uppercase tracking-[0.18em] text-lime-100">
                    {stampWelcomeLabel}
                </span>
                <Plane className="mt-1 h-4 w-4 text-lime-100/85" aria-hidden="true" />
            </span>

            {removable && onRemove ? (
                <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                        event.stopPropagation();
                        onRemove();
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            onRemove();
                        }
                    }}
                    className="absolute right-1 top-1 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-red-300/30 bg-slate-950/90 text-xs font-black text-red-100 opacity-0 shadow-xl shadow-black/40 transition hover:bg-red-400/20 group-hover/stamp:opacity-100"
                    aria-label={`Remove ${countryName}`}
                >
                    ×
                </span>
            ) : null}
        </Wrapper>
    );
}
