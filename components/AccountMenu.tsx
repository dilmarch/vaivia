"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
    Camera,
    Check,
    Globe2,
    List,
    ListChecks,
    LogOut,
    MapPinned,
    MoreHorizontal,
    Pencil,
    Plus,
    Settings,
    Stamp,
    Trash2,
    UserRound,
    UsersRound,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AnimatedModal from "@/components/AnimatedModal";
import ScratchMap from "@/components/maps/ScratchMap";
import PassportStampCard from "@/components/PassportStamp";
import {
    isVaiviaThemeMode,
    type VaiviaThemeMode,
} from "@/components/PinkModeProvider";
import PlaceAutocompleteInput from "@/components/places/PlaceAutocompleteInput";
import Portal from "@/components/Portal";
import {
    getCountryOptionByIso3,
    normalizeCountryCode,
} from "@/lib/countries/country-codes";
import { createClient } from "@/lib/supabase/client";

export type UserProfile = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    email: string | null;
    avatar_url: string | null;
    join_date: string | null;
    role?: "basic_user" | "super_admin" | string | null;
    created_at: string | null;
    updated_at: string | null;
};

export type UserPreferences = {
    user_id: string;
    clock_format: "12h" | "24h";
    default_time_zone: string | null;
    itinerary_default_view: "list" | "day" | "week";
    theme_mode?: VaiviaThemeMode | null;
    news_feed_mode?: "integrated" | "widget" | null;
    created_at: string | null;
    updated_at: string | null;
};

type AccountMenuProps = {
    userId: string;
    email?: string | null;
    joinedAt?: string | null;
    profile?: Partial<UserProfile> | null;
    preferences?: Partial<UserPreferences> | null;
    variant?:
        | "top"
        | "sidebar-profile"
        | "sidebar-settings"
        | "mobile-profile"
        | "profile-page";
};

type PassportStamp = {
    id?: string;
    countryCode: string;
    countryName: string;
    flagEmoji: string;
    flagSvgUrl?: string | null;
    firstVisitYear?: number | null;
    firstVisitedOn?: string | null;
    welcomeLabel?: string | null;
    arrivalLabel?: string | null;
    stampLanguageCode?: string | null;
    stampLanguageName?: string | null;
    airportCode?: string | null;
    airportCity?: string | null;
    airportName?: string | null;
    airportGooglePlaceId?: string | null;
    airportFormattedAddress?: string | null;
    visitCity?: string | null;
    visitRegion?: string | null;
    visitMonth?: number | null;
    visitStatus?: "visited" | "lived" | string | null;
    portOfEntryType?: string | null;
    portOfEntryName?: string | null;
    travelFriendIds?: string[];
    sourceTripTitle?: string | null;
    source: "auto" | "manual";
};

type PassportStampSortMode = "country" | "recent_first" | "recent_last";

type StampLanguageOption = {
    code: string;
    name: string;
    welcomeLabel: string;
};

type CountryOption = {
    code: string;
    alpha3?: string | null;
    name: string;
    officialName?: string | null;
    flag: string;
    flagSvgUrl?: string | null;
    flagPngUrl?: string | null;
    region?: string | null;
    subregion?: string | null;
    currencies?: Record<string, { name?: string; symbol?: string }>;
    welcomeLabel?: string | null;
    arrivalLabel?: string | null;
    primaryLanguageCode?: string | null;
    primaryLanguageName?: string | null;
    languages?: Record<string, string> | null;
    languageOptions?: StampLanguageOption[];
    capital?: string | null;
    defaultEntryAirportId?: string | null;
};

type PassportStampLocationParts = {
    countryCode: string;
    countryName: string;
    city: string;
    region: string;
    displayLabel: string;
};

type TravelBucketListItem = {
    id: string;
    placeLabel: string;
    city?: string | null;
    region?: string | null;
    countryCode: string;
    countryName?: string | null;
    flagEmoji?: string | null;
    googlePlaceId?: string | null;
    googleFormattedAddress?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    status: "in_progress" | "completed";
    completedAt?: string | null;
    passportStampId?: string | null;
};

type ScratchMapCountry = {
    id: string;
    countryCode: string;
};

type FriendProfile = {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    role?: string | null;
    themeMode?: VaiviaThemeMode | null;
    joinedAt?: string | null;
};

type FriendInvitation = {
    id: string;
    identifier: string;
    requesterUserId: string;
    addresseeUserId?: string | null;
    status: "pending" | "accepted" | "cancelled" | "declined";
    createdAt?: string | null;
};

type ProfileStats = {
    tripsPlanned: number;
    friendsCount: number;
    points: number;
    level: number;
    levelName: string;
    friends: FriendProfile[];
    sentInvitations: FriendInvitation[];
    incomingInvitations: FriendInvitation[];
    stamps: PassportStamp[];
    bucketList: TravelBucketListItem[];
    scratchMapCountries: ScratchMapCountry[];
};

type FriendProfileSnapshot = {
    friend: FriendProfile;
    points: number;
    level: number;
    levelName: string;
    stamps: PassportStamp[];
    bucketList: TravelBucketListItem[];
    scratchMapCountries: ScratchMapCountry[];
};

const FRIENDS_HEADER_PHRASES = [
    "The real ones who leave the group chat.",
    "Your favourite travel besties.",
    "People worth sharing an airport Uber with.",
    "Friends who understand “one more city.”",
    "The ones who are always down to go.",
    "Your chosen family, now boarding.",
];

const PASSPORT_STAMP_SORT_STORAGE_PREFIX = "vaivia:passport-stamp-sort:";

function isPassportStampSortMode(value: unknown): value is PassportStampSortMode {
    return (
        value === "country" ||
        value === "recent_first" ||
        value === "recent_last"
    );
}

function getStoredPassportStampSortMode(userId: string): PassportStampSortMode {
    if (typeof window === "undefined") return "recent_first";

    const storedValue = window.localStorage.getItem(
        `${PASSPORT_STAMP_SORT_STORAGE_PREFIX}${userId}`
    );

    return isPassportStampSortMode(storedValue) ? storedValue : "recent_first";
}

const MONTH_OPTIONS = [
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
];

const THEME_PROFILE_LABELS: Record<VaiviaThemeMode, string> = {
    dark: "Dark Mode",
    pink: "Pink Mode",
    greyscale: "Greyscale",
    brat: "Brat Mode",
    pride: "Pride Mode",
    light: "Light Mode",
};

const THEME_PROFILE_BADGE_CLASSES: Record<VaiviaThemeMode, string> = {
    dark: "border-lime-300/30 bg-lime-300/10 text-lime-100",
    pink: "border-pink-300/35 bg-pink-400/15 text-pink-100",
    greyscale: "border-slate-300/35 bg-slate-200/15 text-slate-100",
    brat: "border-black/30 bg-black text-[#8ACE00]",
    pride:
        "border-white/25 bg-[linear-gradient(90deg,#e40303,#ff8c00,#ffed00,#008026,#24408e,#732982)] text-white",
    light: "border-slate-300 bg-white text-slate-950",
};

function formatUserRoleLabel(role?: string | null) {
    return role === "super_admin" ? "Super Admin" : "Basic User";
}

function getNextVaiviaLevelProgress(points: number) {
    const normalizedPoints = Math.max(
        0,
        Number.isFinite(Number(points)) ? Number(points) : 0
    );
    const nextLevelThresholds = [
        { level: 2, points: 10 },
        { level: 3, points: 25 },
        { level: 4, points: 60 },
        { level: 5, points: 100 },
        { level: 6, points: 150 },
        { level: 7, points: 225 },
        { level: 8, points: 300 },
        { level: 9, points: 400 },
        { level: 10, points: 500 },
        { level: 11, points: 600 },
        { level: 12, points: 700 },
        { level: 13, points: 800 },
        { level: 14, points: 900 },
        { level: 15, points: 1000 },
        { level: 16, points: 1100 },
        { level: 17, points: 1200 },
        { level: 18, points: 1300 },
        { level: 19, points: 1400 },
        { level: 20, points: 1500 },
    ];
    const nextLevel = nextLevelThresholds.find(
        (threshold) => normalizedPoints < threshold.points
    );

    if (!nextLevel) return null;

    return {
        level: nextLevel.level,
        pointsRemaining: nextLevel.points - normalizedPoints,
    };
}

function getFriendDisplayName(friend: FriendProfile) {
    return (
        [friend.firstName, friend.lastName].filter(Boolean).join(" ").trim() ||
        friend.username ||
        "VAIVIA friend"
    );
}

function getFriendInitials(friend: FriendProfile) {
    return getFriendDisplayName(friend)
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

function formatJoinDate(value?: string | null) {
    if (!value) return "Not available";

    return new Date(value).toLocaleDateString("en-CA", {
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

function getFlagEmoji(countryCode?: string | null) {
    const normalized = countryCode?.trim().toUpperCase();
    if (!normalized || !/^[A-Z]{2}$/.test(normalized)) return "";

    return normalized
        .split("")
        .map((letter) => String.fromCodePoint(letter.charCodeAt(0) + 127397))
        .join("");
}

function getCountryName(countryCode: string) {
    try {
        return (
            new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ||
            countryCode
        );
    } catch {
        return countryCode;
    }
}

const WELCOME_LABEL_BY_COUNTRY_CODE: Record<string, string> = {
    AT: "WILLKOMMEN",
    BE: "WELKOM",
    BG: "ДОБРЕ ДОШЛИ",
    BR: "BEM-VINDO",
    CA: "WELCOME",
    CN: "欢迎",
    CU: "BIENVENIDO",
    DE: "WILLKOMMEN",
    DO: "BIENVENIDO",
    ES: "BIENVENIDO",
    FR: "BIENVENUE",
    GB: "WELCOME",
    GR: "ΚΑΛΩΣ ΗΡΘΑΤΕ",
    GT: "BIENVENIDO",
    HK: "歡迎",
    HR: "DOBRODOŠLI",
    HU: "ÜDVÖZÖLJÜK",
    ID: "SELAMAT DATANG",
    IE: "FÁILTE",
    IL: "ברוכים הבאים",
    IT: "BENVENUTO",
    JP: "ようこそ",
    KR: "환영합니다",
    MN: "ТАВТАЙ МОРИЛНО УУ",
    MX: "BIENVENIDO",
    MY: "SELAMAT DATANG",
    NL: "WELKOM",
    PE: "BIENVENIDO",
    PT: "BEM-VINDO",
    TH: "ยินดีต้อนรับ",
    TR: "HOŞ GELDİNİZ",
    TW: "歡迎",
    US: "WELCOME",
    VN: "CHÀO MỪNG",
};

const FALLBACK_MULTILINGUAL_STAMP_LANGUAGES: Record<
    string,
    StampLanguageOption[]
> = {
    BE: [
        { code: "nld", name: "Dutch", welcomeLabel: "WELKOM" },
        { code: "fra", name: "French", welcomeLabel: "BIENVENUE" },
        { code: "deu", name: "German", welcomeLabel: "WILLKOMMEN" },
    ],
    CA: [
        { code: "eng", name: "English", welcomeLabel: "WELCOME" },
        { code: "fra", name: "French", welcomeLabel: "BIENVENUE" },
    ],
    CH: [
        { code: "deu", name: "German", welcomeLabel: "WILLKOMMEN" },
        { code: "fra", name: "French", welcomeLabel: "BIENVENUE" },
        { code: "ita", name: "Italian", welcomeLabel: "BENVENUTO" },
        { code: "roh", name: "Romansh", welcomeLabel: "BAINVEGNI" },
    ],
    FI: [
        { code: "fin", name: "Finnish", welcomeLabel: "TERVETULOA" },
        { code: "swe", name: "Swedish", welcomeLabel: "VÄLKOMMEN" },
    ],
    IE: [
        { code: "eng", name: "English", welcomeLabel: "WELCOME" },
        { code: "gle", name: "Irish", welcomeLabel: "FÁILTE" },
    ],
    IN: [
        { code: "hin", name: "Hindi", welcomeLabel: "स्वागत है" },
        { code: "eng", name: "English", welcomeLabel: "WELCOME" },
    ],
    IL: [
        { code: "heb", name: "Hebrew", welcomeLabel: "ברוכים הבאים" },
        { code: "ara", name: "Arabic", welcomeLabel: "أهلاً وسهلاً" },
    ],
    LU: [
        { code: "ltz", name: "Luxembourgish", welcomeLabel: "WËLLKOMM" },
        { code: "fra", name: "French", welcomeLabel: "BIENVENUE" },
        { code: "deu", name: "German", welcomeLabel: "WILLKOMMEN" },
    ],
    MT: [
        { code: "mlt", name: "Maltese", welcomeLabel: "MERĦBA" },
        { code: "eng", name: "English", welcomeLabel: "WELCOME" },
    ],
    SG: [
        { code: "eng", name: "English", welcomeLabel: "WELCOME" },
        { code: "zho", name: "Chinese", welcomeLabel: "欢迎" },
        { code: "msa", name: "Malay", welcomeLabel: "SELAMAT DATANG" },
        { code: "tam", name: "Tamil", welcomeLabel: "வரவேற்பு" },
    ],
    ZA: [
        { code: "eng", name: "English", welcomeLabel: "WELCOME" },
        { code: "afr", name: "Afrikaans", welcomeLabel: "WELKOM" },
        { code: "zul", name: "Zulu", welcomeLabel: "WAMUKELEKILE" },
        { code: "xho", name: "Xhosa", welcomeLabel: "WAMKELEKILE" },
    ],
    TW: [{ code: "zho", name: "Mandarin Chinese", welcomeLabel: "歡迎" }],
};

function resolvePassportWelcomeLabel(
    countryCode?: string | null,
    ...candidates: Array<string | null | undefined>
) {
    const normalizedCountryCode = countryCode?.trim().toUpperCase() || "";
    const localizedLabel = WELCOME_LABEL_BY_COUNTRY_CODE[normalizedCountryCode];
    const firstCandidate =
        candidates.map((candidate) => candidate?.trim()).find(Boolean) || "";

    if (
        firstCandidate &&
        !(
            firstCandidate.toUpperCase() === "WELCOME" &&
            localizedLabel &&
            localizedLabel.toUpperCase() !== "WELCOME"
        )
    ) {
        return firstCandidate;
    }

    return localizedLabel || firstCandidate || "WELCOME";
}

function normalizeLanguageCode(value?: string | null) {
    return String(value || "").trim().toLowerCase();
}

function getFallbackStampLanguageOptions(countryCode?: string | null) {
    const normalizedCountryCode = String(countryCode || "").trim().toUpperCase();
    return FALLBACK_MULTILINGUAL_STAMP_LANGUAGES[normalizedCountryCode] || [];
}

function buildStampLanguageOptions(
    country: Pick<
        CountryOption,
        | "code"
        | "languages"
        | "primaryLanguageCode"
        | "primaryLanguageName"
        | "welcomeLabel"
        | "arrivalLabel"
    >,
    welcomeLabelsByLanguage: Record<string, string> = {}
) {
    const optionsByCode = new Map<string, StampLanguageOption>();

    getFallbackStampLanguageOptions(country.code).forEach((option) => {
        const code = normalizeLanguageCode(option.code);
        if (!code) return;
        optionsByCode.set(code, {
            ...option,
            code,
            welcomeLabel:
                welcomeLabelsByLanguage[code] || option.welcomeLabel || "WELCOME",
        });
    });

    Object.entries(country.languages || {}).forEach(([languageCode, languageName]) => {
        const code = normalizeLanguageCode(languageCode);
        const name = String(languageName || "").trim();
        if (!code || !name || optionsByCode.has(code)) return;
        optionsByCode.set(code, {
            code,
            name,
            welcomeLabel:
                welcomeLabelsByLanguage[code] ||
                resolvePassportWelcomeLabel(country.code, country.welcomeLabel, country.arrivalLabel),
        });
    });

    const primaryLanguageCode = normalizeLanguageCode(country.primaryLanguageCode);
    if (primaryLanguageCode && !optionsByCode.has(primaryLanguageCode)) {
        optionsByCode.set(primaryLanguageCode, {
            code: primaryLanguageCode,
            name: country.primaryLanguageName || primaryLanguageCode.toUpperCase(),
            welcomeLabel:
                welcomeLabelsByLanguage[primaryLanguageCode] ||
                resolvePassportWelcomeLabel(country.code, country.welcomeLabel, country.arrivalLabel),
        });
    }

    return Array.from(optionsByCode.values());
}

function getStampLanguageOptions(country?: CountryOption | null) {
    if (!country) return [];
    return country.languageOptions?.length
        ? country.languageOptions
        : buildStampLanguageOptions(country);
}

function getSelectedStampLanguageOption(
    country: CountryOption | null | undefined,
    selectedCode?: string | null
) {
    const options = getStampLanguageOptions(country);
    const normalizedSelectedCode = normalizeLanguageCode(selectedCode);
    return (
        options.find((option) => option.code === normalizedSelectedCode) ||
        options[0] ||
        null
    );
}

function getCountryCodeFromFlag(flag: string) {
    const codePoints = Array.from(flag);
    if (codePoints.length !== 2) return null;

    const letters = codePoints
        .map((character) => character.codePointAt(0))
        .filter((codePoint): codePoint is number => Boolean(codePoint))
        .map((codePoint) => String.fromCharCode(codePoint - 127397))
        .join("");

    return /^[A-Z]{2}$/.test(letters) ? letters : null;
}

function parseDestinationList(destination?: string | null) {
    if (!destination) return [];
    return destination
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function getLeadingFlag(destination: string) {
    return destination.match(/^[\u{1F1E6}-\u{1F1FF}]{2}/u)?.[0] || "";
}

function getInitialFromName(value: string) {
    return value.trim().charAt(0).toUpperCase() || "V";
}

function mergePassportStamps(stamps: PassportStamp[]) {
    return stamps
        .filter((stamp) => Boolean(stamp.countryCode))
        .sort((a, b) => {
            const aDate = a.firstVisitedOn || "";
            const bDate = b.firstVisitedOn || "";
            if (aDate && bDate && aDate !== bDate) return bDate.localeCompare(aDate);
            if (aDate !== bDate) return aDate ? -1 : 1;
            return a.countryName.localeCompare(b.countryName);
        });
}

function getYearFromDate(value?: string | null) {
    if (!value) return null;
    const year = Number(String(value).slice(0, 4));
    return Number.isFinite(year) && year > 0 ? year : null;
}

function getFirstVisitDateForTrip(trip?: { start_date?: string | null; end_date?: string | null }) {
    return trip?.start_date || trip?.end_date || null;
}

function getManualVisitDate(year: string, month?: string | number | null) {
    const trimmed = year.trim();
    if (!trimmed) return null;
    const numericYear = Number(trimmed);
    if (!Number.isInteger(numericYear) || numericYear < 1900 || numericYear > 2200) {
        return null;
    }

    const numericMonth = Number(month || 1);
    const safeMonth =
        Number.isInteger(numericMonth) && numericMonth >= 1 && numericMonth <= 12
            ? numericMonth
            : 1;

    return `${numericYear}-${String(safeMonth).padStart(2, "0")}-01`;
}

function getCurrentYearMonth() {
    const now = new Date();
    return {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
    };
}

function getAvailableStampMonths(year: string) {
    const numericYear = Number(year);
    const current = getCurrentYearMonth();

    if (!Number.isInteger(numericYear) || numericYear < 1900) {
        return MONTH_OPTIONS;
    }

    if (numericYear > current.year) {
        return [];
    }

    if (numericYear === current.year) {
        return MONTH_OPTIONS.filter(
            (month) => Number(month.value) <= current.month
        );
    }

    return MONTH_OPTIONS;
}

function getStampDateError(year: string, month?: string | number | null) {
    const numericYear = Number(year);
    const current = getCurrentYearMonth();

    if (!year.trim()) return "Add the year you completed this travel.";
    if (!Number.isInteger(numericYear) || numericYear < 1900) {
        return "Enter a valid completed travel year.";
    }

    if (numericYear > current.year) {
        return "Passport stamps can only be added for completed travel.";
    }

    const numericMonth = Number(month || 0);
    if (
        numericYear === current.year &&
        Number.isInteger(numericMonth) &&
        numericMonth > current.month
    ) {
        return "Passport stamps can only use this month or an earlier month.";
    }

    return "";
}

function getMonthLabel(month?: number | string | null) {
    const numericMonth = Number(month);
    return MONTH_OPTIONS.find((option) => Number(option.value) === numericMonth)?.label || "";
}

function formatStampVisitDate(stamp: PassportStamp) {
    const year = stamp.firstVisitYear;
    if (!year) return "Visited";
    const monthLabel = getMonthLabel(stamp.visitMonth);
    return monthLabel ? `${monthLabel} ${year}` : String(year);
}

function getStampSortDate(stamp: PassportStamp) {
    if (stamp.firstVisitedOn) {
        const timestamp = new Date(stamp.firstVisitedOn).getTime();
        if (!Number.isNaN(timestamp)) return timestamp;
    }

    if (stamp.firstVisitYear) {
        const month =
            Number.isInteger(Number(stamp.visitMonth)) &&
            Number(stamp.visitMonth) >= 1 &&
            Number(stamp.visitMonth) <= 12
                ? Number(stamp.visitMonth)
                : 1;
        return new Date(stamp.firstVisitYear, month - 1, 1).getTime();
    }

    return 0;
}

function formatBucketListCompletedDate(value?: string | null) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function getBucketListPlaceDisplay(item: TravelBucketListItem) {
    const countryName = item.countryName || getCountryName(item.countryCode);
    if (item.city) {
        return {
            primary: item.city,
            secondary: [item.region, countryName].filter(Boolean).join(", "),
        };
    }

    if (item.region) {
        return {
            primary: item.region,
            secondary: countryName,
        };
    }

    return {
        primary: countryName || item.placeLabel,
        secondary:
            item.placeLabel && item.placeLabel !== countryName
                ? item.placeLabel
                : "",
    };
}

function getUniqueStampCountryCount(stamps: PassportStamp[]) {
    return new Set(
        stamps
            .map((stamp) => stamp.countryCode?.trim().toUpperCase())
            .filter(Boolean)
    ).size;
}

function getAddressComponent(
    components: google.maps.GeocoderAddressComponent[] | undefined,
    type: string,
    format: "long_name" | "short_name" = "long_name"
) {
    return (
        components?.find((component) => component.types.includes(type))?.[format] ||
        ""
    );
}

function getPassportStampLocationParts(
    place: google.maps.places.PlaceResult,
    fallbackValue = ""
): PassportStampLocationParts {
    const countryCode = getAddressComponent(
        place.address_components,
        "country",
        "short_name"
    )
        .trim()
        .toUpperCase();
    const countryName =
        getAddressComponent(place.address_components, "country") ||
        (/^[A-Z]{2}$/.test(countryCode) ? getCountryName(countryCode) : "");
    const region = getAddressComponent(
        place.address_components,
        "administrative_area_level_1"
    );
    const city =
        getAddressComponent(place.address_components, "locality") ||
        getAddressComponent(place.address_components, "postal_town") ||
        getAddressComponent(place.address_components, "administrative_area_level_2");
    const placeTypes = place.types || [];
    const isCountry = placeTypes.includes("country");
    const isRegion =
        placeTypes.includes("administrative_area_level_1") ||
        placeTypes.includes("administrative_area_level_2");
    const inferredCity = isCountry || isRegion ? "" : city;
    const inferredRegion = isCountry ? "" : region;
    const locationName =
        (isCountry
            ? countryName
            : isRegion
              ? region || place.name
              : inferredCity || place.name || region || countryName) || fallbackValue;
    const displayLabel = [
        locationName,
        isCountry ? "" : countryName,
    ]
        .filter(Boolean)
        .join(", ");

    return {
        countryCode,
        countryName,
        city: inferredCity || "",
        region: inferredRegion || "",
        displayLabel,
    };
}

function getPlaceCoordinates(place: google.maps.places.PlaceResult) {
    const location = place.geometry?.location;
    if (!location) return { latitude: null, longitude: null };

    return {
        latitude: typeof location.lat === "function" ? location.lat() : null,
        longitude: typeof location.lng === "function" ? location.lng() : null,
    };
}

function getAirportCodeCandidate(...values: Array<string | null | undefined>) {
    for (const value of values) {
        const normalized = String(value || "").toUpperCase();
        const parentheticalMatch = normalized.match(/\(([A-Z0-9]{3,4})\)/);
        if (parentheticalMatch?.[1]) return parentheticalMatch[1];

        const codeMatch = normalized.match(/\b[A-Z]{3,4}\b/);
        if (codeMatch?.[0]) return codeMatch[0];
    }

    return "";
}

function getInitialValue(value?: string | null) {
    return value || "";
}

function getAvatarExtension(file: File) {
    const mimeExtension = file.type.split("/")[1];
    const nameExtension = file.name.split(".").pop();
    return (mimeExtension || nameExtension || "jpg").replace("jpeg", "jpg");
}

function getErrorDetails(error: unknown) {
    if (error instanceof Error) {
        return {
            message: error.message,
            name: error.name,
            cause:
                error.cause instanceof Error
                    ? error.cause.message
                    : typeof error.cause === "string"
                      ? error.cause
                      : undefined,
        };
    }

    if (error && typeof error === "object") {
        const record = error as Record<string, unknown>;
        const details = {
            message:
                record.message instanceof Error
                    ? record.message.message
                    : typeof record.message === "string"
                      ? record.message
                      : undefined,
            code: typeof record.code === "string" ? record.code : undefined,
            details:
                typeof record.details === "string" ? record.details : undefined,
            hint: typeof record.hint === "string" ? record.hint : undefined,
            status:
                typeof record.status === "number" || typeof record.status === "string"
                    ? record.status
                    : undefined,
            statusText:
                typeof record.statusText === "string"
                    ? record.statusText
                    : undefined,
        };

        if (
            Object.values(details).some(
                (value) => value !== undefined && value !== ""
            )
        ) {
            return {
                ...details,
                raw:
                    Object.keys(record).length > 0
                        ? JSON.stringify(record)
                        : Object.prototype.toString.call(error),
            };
        }

        return {
            message: "Unknown object error",
            raw:
                Object.keys(record).length > 0
                    ? JSON.stringify(record)
                    : Object.prototype.toString.call(error),
        };
    }

    return {
        message: typeof error === "string" ? error : "Unknown error",
    };
}

export default function AccountMenu({
    userId,
    email,
    joinedAt,
    profile,
    preferences,
    variant = "top",
}: AccountMenuProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isOpen, setIsOpen] = useState(false);
    const isProfilePage = variant === "profile-page";
    const isProfileSurfaceActive = isOpen || isProfilePage;
    const [avatarUrl, setAvatarUrl] = useState(() =>
        getInitialValue(profile?.avatar_url)
    );
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [firstName, setFirstName] = useState(() =>
        getInitialValue(profile?.first_name)
    );
    const [lastName, setLastName] = useState(() =>
        getInitialValue(profile?.last_name)
    );
    const [username] = useState(() =>
        getInitialValue(profile?.username)
    );
    const [emailAddress, setEmailAddress] = useState(() =>
        getInitialValue(profile?.email || email)
    );
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [mode, setMode] = useState<"profile" | "edit">("profile");
    const [profileStats, setProfileStats] = useState<ProfileStats>({
        tripsPlanned: 0,
        friendsCount: 0,
        points: 0,
        level: 1,
        levelName: "Still Packing",
        friends: [],
        sentInvitations: [],
        incomingInvitations: [],
        stamps: [],
        bucketList: [],
        scratchMapCountries: [],
    });
    const [friendInviteCancelTarget, setFriendInviteCancelTarget] =
        useState<FriendInvitation | null>(null);
    const [currentThemeMode, setCurrentThemeMode] =
        useState<VaiviaThemeMode>("dark");
    const [isLoadingProfileStats, setIsLoadingProfileStats] = useState(false);
    const [countryOptions, setCountryOptions] = useState<CountryOption[]>([]);
    const [welcomeLabelsByLanguage, setWelcomeLabelsByLanguage] = useState<
        Record<string, string>
    >({});
    const [isLoadingCountries, setIsLoadingCountries] = useState(false);
    const [countrySearchQuery, setCountrySearchQuery] = useState("");
    const [selectedStampCountryCode, setSelectedStampCountryCode] = useState("");
    const [selectedGoogleCountry, setSelectedGoogleCountry] =
        useState<CountryOption | null>(null);
    const [manualStampYear, setManualStampYear] = useState("");
    const [manualStampMonth, setManualStampMonth] = useState("");
    const [manualStampCity, setManualStampCity] = useState("");
    const [manualStampRegion, setManualStampRegion] = useState("");
    const [editStampLocationValue, setEditStampLocationValue] = useState("");
    const [manualStampLanguageCode, setManualStampLanguageCode] = useState("");
    const [manualStampStatus, setManualStampStatus] =
        useState<"visited" | "lived">("visited");
    const [passportStampFriendIds, setPassportStampFriendIds] = useState<string[]>(
        []
    );
    const [airportSearchValue, setAirportSearchValue] = useState("");
    const [selectedAirportPlaceId, setSelectedAirportPlaceId] = useState("");
    const [selectedAirportName, setSelectedAirportName] = useState("");
    const [selectedAirportFormattedAddress, setSelectedAirportFormattedAddress] =
        useState("");
    const [selectedAirportCity, setSelectedAirportCity] = useState("");
    const [selectedAirportParsedCode, setSelectedAirportParsedCode] = useState("");
    const [selectedPassportStamp, setSelectedPassportStamp] =
        useState<PassportStamp | null>(null);
    const [isAddPassportStampOpen, setIsAddPassportStampOpen] = useState(false);
    const [isEditingPassportStamp, setIsEditingPassportStamp] = useState(false);
    const [passportStampSortMode, setPassportStampSortMode] =
        useState<PassportStampSortMode>(() =>
            getStoredPassportStampSortMode(userId)
        );
    const [editStampYear, setEditStampYear] = useState("");
    const [editStampMonth, setEditStampMonth] = useState("");
    const [editStampCity, setEditStampCity] = useState("");
    const [editStampRegion, setEditStampRegion] = useState("");
    const [editStampLanguageCode, setEditStampLanguageCode] = useState("");
    const [passportStampLanguageChoiceMode, setPassportStampLanguageChoiceMode] =
        useState<"add" | "edit" | null>(null);
    const [passportStampLanguageChoiceCode, setPassportStampLanguageChoiceCode] =
        useState("");
    const [editStampStatus, setEditStampStatus] =
        useState<"visited" | "lived">("visited");
    const [isSavingStamp, setIsSavingStamp] = useState(false);
    const [bucketListTab, setBucketListTab] =
        useState<"in_progress" | "completed">("in_progress");
    const [isBucketListModalOpen, setIsBucketListModalOpen] = useState(false);
    const [editingBucketListItem, setEditingBucketListItem] =
        useState<TravelBucketListItem | null>(null);
    const [bucketListPlaceValue, setBucketListPlaceValue] = useState("");
    const [bucketListPlaceParts, setBucketListPlaceParts] =
        useState<PassportStampLocationParts | null>(null);
    const [bucketListGooglePlaceId, setBucketListGooglePlaceId] = useState("");
    const [bucketListFormattedAddress, setBucketListFormattedAddress] = useState("");
    const [bucketListLatitude, setBucketListLatitude] = useState<number | null>(null);
    const [bucketListLongitude, setBucketListLongitude] = useState<number | null>(null);
    const [isSavingBucketListItem, setIsSavingBucketListItem] = useState(false);
    const [bucketListCompletionItem, setBucketListCompletionItem] =
        useState<TravelBucketListItem | null>(null);
    const [bucketListCompletionYear, setBucketListCompletionYear] = useState("");
    const [bucketListCompletionMonth, setBucketListCompletionMonth] =
        useState("");
    const [
        bucketListCompletionLanguageCode,
        setBucketListCompletionLanguageCode,
    ] = useState("");
    const [isSavingBucketListCompletion, setIsSavingBucketListCompletion] =
        useState(false);
    const [isFriendsModalOpen, setIsFriendsModalOpen] = useState(false);
    const [friendInviteIdentifier, setFriendInviteIdentifier] = useState("");
    const [isSavingFriendInvite, setIsSavingFriendInvite] = useState(false);
    const [selectedFriend, setSelectedFriend] = useState<FriendProfile | null>(null);
    const [selectedFriendSnapshot, setSelectedFriendSnapshot] =
        useState<FriendProfileSnapshot | null>(null);
    const [isLoadingFriendSnapshot, setIsLoadingFriendSnapshot] = useState(false);
    const [isFriendOptionsOpen, setIsFriendOptionsOpen] = useState(false);
    const [friendsHeaderPhraseIndex, setFriendsHeaderPhraseIndex] = useState(0);

    const displayName = useMemo(() => {
        const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
        return fullName || username || emailAddress || "My account";
    }, [emailAddress, firstName, lastName, username]);
    const profileSubtitle = username
        ? `@${username}`
        : emailAddress || "VAIVIA traveller";
    const joinDateLabel = formatJoinDate(
        profile?.join_date || profile?.created_at || joinedAt
    );
    const passportStamps = profileStats.stamps;
    const passportCountryCount = useMemo(
        () => getUniqueStampCountryCount(passportStamps),
        [passportStamps]
    );
    const passportContinentCount = useMemo(() => {
        const regionsByCode = new Map(
            countryOptions.map((country) => [country.code, country.region || ""])
        );
        return new Set(
            passportStamps
                .map((stamp) => regionsByCode.get(stamp.countryCode) || "")
            .filter(Boolean)
        ).size;
    }, [countryOptions, passportStamps]);
    const mostVisitedPassportCountry = useMemo(() => {
        const visitsByCountry = new Map<
            string,
            { count: number; countryName: string; flagEmoji: string }
        >();

        passportStamps.forEach((stamp) => {
            const countryCode = stamp.countryCode?.trim().toUpperCase();
            if (!countryCode) return;

            const existing = visitsByCountry.get(countryCode);
            visitsByCountry.set(countryCode, {
                count: (existing?.count || 0) + 1,
                countryName:
                    existing?.countryName ||
                    stamp.countryName ||
                    getCountryName(countryCode),
                flagEmoji:
                    existing?.flagEmoji ||
                    stamp.flagEmoji ||
                    getFlagEmoji(countryCode),
            });
        });

        return (
            Array.from(visitsByCountry.values()).sort((countryA, countryB) => {
                if (countryB.count !== countryA.count) {
                    return countryB.count - countryA.count;
                }

                return countryA.countryName.localeCompare(countryB.countryName);
            })[0] || null
        );
    }, [passportStamps]);
    const scratchMapCountryCodes = useMemo(
        () =>
            Array.from(
                new Set(
                    passportStamps
                        .flatMap((stamp) => [
                            stamp.countryCode,
                            stamp.countryName,
                        ])
                        .filter(Boolean) as string[]
                )
            ),
        [passportStamps]
    );
    const scratchMapCountryYears = useMemo(() => {
        const yearsByCountry: Record<string, number[]> = {};

        passportStamps.forEach((stamp) => {
            const countryCode = stamp.countryCode?.trim().toUpperCase();
            if (!countryCode) return;

            const year =
                stamp.firstVisitYear || getYearFromDate(stamp.firstVisitedOn);
            if (!year) return;

            yearsByCountry[countryCode] = Array.from(
                new Set([...(yearsByCountry[countryCode] || []), year])
            ).sort((yearA, yearB) => yearB - yearA);
        });

        return yearsByCountry;
    }, [passportStamps]);
    const manualScratchMapCountryCodes = useMemo(
        () =>
            Array.from(
                new Set(
                    profileStats.scratchMapCountries
                        .map((country) => country.countryCode)
                        .filter(Boolean)
                )
            ),
        [profileStats.scratchMapCountries]
    );
    const currentThemeLabel = THEME_PROFILE_LABELS[currentThemeMode];
    const sortedPassportStamps = useMemo(() => {
        return [...passportStamps].sort((stampA, stampB) => {
            if (passportStampSortMode === "country") {
                return (
                    stampA.countryName.localeCompare(stampB.countryName, undefined, {
                        sensitivity: "base",
                    }) ||
                    getStampSortDate(stampB) - getStampSortDate(stampA)
                );
            }

            const dateDelta = getStampSortDate(stampB) - getStampSortDate(stampA);
            if (dateDelta !== 0) {
                return passportStampSortMode === "recent_first"
                    ? dateDelta
                    : -dateDelta;
            }

            return stampA.countryName.localeCompare(stampB.countryName, undefined, {
                sensitivity: "base",
            });
        });
    }, [passportStampSortMode, passportStamps]);
    const currentThemeBadgeClass = THEME_PROFILE_BADGE_CLASSES[currentThemeMode];
    const userRoleLabel = formatUserRoleLabel(profile?.role);
    const profilePointsLabel = `${profileStats.points.toLocaleString()} pt${
        profileStats.points === 1 ? "" : "s"
    }`;
    const nextLevelProgress = getNextVaiviaLevelProgress(profileStats.points);
    const profileLevelLabel = `Level ${profileStats.level}: ${profileStats.levelName}`;
    const selectedStampCountry = useMemo(
        () =>
            countryOptions.find(
                (country) => country.code === selectedStampCountryCode
            ) ||
            (selectedGoogleCountry?.code === selectedStampCountryCode
                ? selectedGoogleCountry
                : null),
        [countryOptions, selectedGoogleCountry, selectedStampCountryCode]
    );
    const selectedStampLanguageOptions = useMemo(
        () => getStampLanguageOptions(selectedStampCountry),
        [selectedStampCountry]
    );
    const selectedPassportStampCountry = useMemo(() => {
        if (!selectedPassportStamp) return null;
        const existingCountry = countryOptions.find(
            (country) => country.code === selectedPassportStamp.countryCode
        );
        if (existingCountry) return existingCountry;

        return {
            code: selectedPassportStamp.countryCode,
            alpha3: null,
            name: selectedPassportStamp.countryName,
            officialName: null,
            flag:
                selectedPassportStamp.flagEmoji ||
                getFlagEmoji(selectedPassportStamp.countryCode),
            flagSvgUrl: selectedPassportStamp.flagSvgUrl || null,
            flagPngUrl: null,
            region: null,
            subregion: null,
            currencies: {},
            welcomeLabel: selectedPassportStamp.welcomeLabel || null,
            arrivalLabel: selectedPassportStamp.arrivalLabel || null,
            primaryLanguageCode: selectedPassportStamp.stampLanguageCode || null,
            primaryLanguageName: selectedPassportStamp.stampLanguageName || null,
            languages: null,
            languageOptions: buildStampLanguageOptions(
                {
                    code: selectedPassportStamp.countryCode,
                    welcomeLabel: selectedPassportStamp.welcomeLabel || null,
                    arrivalLabel: selectedPassportStamp.arrivalLabel || null,
                    primaryLanguageCode:
                        selectedPassportStamp.stampLanguageCode || null,
                    primaryLanguageName:
                        selectedPassportStamp.stampLanguageName || null,
                    languages: null,
                },
                welcomeLabelsByLanguage
            ),
            capital: null,
            defaultEntryAirportId: null,
        } satisfies CountryOption;
    }, [countryOptions, selectedPassportStamp, welcomeLabelsByLanguage]);
    const editStampLanguageOptions = useMemo(
        () => getStampLanguageOptions(selectedPassportStampCountry),
        [selectedPassportStampCountry]
    );
    const bucketListCompletionCountry = useMemo(() => {
        if (!bucketListCompletionItem) return null;

        const existingCountry = countryOptions.find(
            (country) => country.code === bucketListCompletionItem.countryCode
        );
        if (existingCountry) return existingCountry;

        return {
            code: bucketListCompletionItem.countryCode,
            alpha3: null,
            name:
                bucketListCompletionItem.countryName ||
                getCountryName(bucketListCompletionItem.countryCode),
            officialName: null,
            flag:
                bucketListCompletionItem.flagEmoji ||
                getFlagEmoji(bucketListCompletionItem.countryCode),
            flagSvgUrl: null,
            flagPngUrl: null,
            region: null,
            subregion: null,
            currencies: {},
            welcomeLabel: null,
            arrivalLabel: null,
            primaryLanguageCode: null,
            primaryLanguageName: null,
            languages: null,
            languageOptions: buildStampLanguageOptions(
                {
                    code: bucketListCompletionItem.countryCode,
                    languages: null,
                    primaryLanguageCode: null,
                    primaryLanguageName: null,
                    welcomeLabel: null,
                    arrivalLabel: null,
                },
                welcomeLabelsByLanguage
            ),
            capital: null,
            defaultEntryAirportId: null,
        } satisfies CountryOption;
    }, [bucketListCompletionItem, countryOptions, welcomeLabelsByLanguage]);
    const bucketListCompletionLanguageOptions = useMemo(
        () => getStampLanguageOptions(bucketListCompletionCountry),
        [bucketListCompletionCountry]
    );
    const languageChoiceOptions =
        passportStampLanguageChoiceMode === "edit"
            ? editStampLanguageOptions
            : selectedStampLanguageOptions;
    const manualStampMonthOptions = useMemo(
        () => getAvailableStampMonths(manualStampYear),
        [manualStampYear]
    );
    const editStampMonthOptions = useMemo(
        () => getAvailableStampMonths(editStampYear),
        [editStampYear]
    );
    const bucketListCompletionMonthOptions = useMemo(
        () => getAvailableStampMonths(bucketListCompletionYear),
        [bucketListCompletionYear]
    );

    useEffect(() => {
        if (
            manualStampMonth &&
            !manualStampMonthOptions.some(
                (month) => month.value === manualStampMonth
            )
        ) {
            setManualStampMonth("");
        }
    }, [manualStampMonth, manualStampMonthOptions]);

    useEffect(() => {
        if (
            editStampMonth &&
            !editStampMonthOptions.some((month) => month.value === editStampMonth)
        ) {
            setEditStampMonth("");
        }
    }, [editStampMonth, editStampMonthOptions]);

    useEffect(() => {
        if (
            bucketListCompletionMonth &&
            !bucketListCompletionMonthOptions.some(
                (month) => month.value === bucketListCompletionMonth
            )
        ) {
            setBucketListCompletionMonth("");
        }
    }, [bucketListCompletionMonth, bucketListCompletionMonthOptions]);

    useEffect(() => {
        if (!bucketListCompletionItem) return;

        const firstLanguageCode =
            bucketListCompletionLanguageOptions[0]?.code || "";
        setBucketListCompletionLanguageCode((current) =>
            current &&
            bucketListCompletionLanguageOptions.some(
                (language) => language.code === current
            )
                ? current
                : firstLanguageCode
        );
    }, [bucketListCompletionItem, bucketListCompletionLanguageOptions]);

    useEffect(() => {
        window.localStorage.setItem(
            `${PASSPORT_STAMP_SORT_STORAGE_PREFIX}${userId}`,
            passportStampSortMode
        );
    }, [passportStampSortMode, userId]);

    useEffect(() => {
        const profileTarget = searchParams.get("profile");
        if (profileTarget !== "passport" || isProfilePage) {
            return;
        }

        if (["top", "sidebar-profile"].includes(variant)) {
            router.replace("/profile", { scroll: false });
            return;
        }

        if (variant === "mobile-profile") {
            router.replace("/profile", { scroll: false });
        }
    }, [isProfilePage, router, searchParams, variant]);

    useEffect(() => {
        if (!isProfilePage || searchParams.get("modal") !== "friends") {
            return;
        }

        setIsFriendsModalOpen(true);
        router.replace("/profile", { scroll: false });
    }, [isProfilePage, router, searchParams]);

    useEffect(() => {
        if (!isProfileSurfaceActive) return;

        let isCancelled = false;

        async function loadCountryOptions() {
            setIsLoadingCountries(true);
            try {
                const supabase = createClient();
                const { data, error } = await supabase
                    .from("countries")
                    .select(
                        "alpha2,alpha3,common_name,official_name,flag_emoji,flag_svg_url,flag_png_url,region,subregion,currencies,welcome_label,arrival_label,primary_language_code,primary_language_name,languages,capital,default_entry_airport_id"
                    )
                    .order("common_name", { ascending: true });

                if (error) throw error;

                const { data: languageData, error: languageError } = await supabase
                    .from("language_welcome_labels")
                    .select("language_code,welcome_label");

                if (languageError) {
                    console.warn("Could not load passport language labels:", {
                        ...getErrorDetails(languageError),
                    });
                }

                const languageLabels = ((languageData || []) as Array<{
                    language_code?: string | null;
                    welcome_label?: string | null;
                }>).reduce<Record<string, string>>((labels, label) => {
                    const code = normalizeLanguageCode(label.language_code);
                    const welcomeLabel = String(label.welcome_label || "").trim();
                    if (code && welcomeLabel) labels[code] = welcomeLabel;
                    return labels;
                }, {});

                const options = (data || [])
                    .map((record) => ({
                        code: String(record.alpha2 || "").toUpperCase(),
                        alpha3: record.alpha3 || null,
                        name: record.common_name || "",
                        officialName: record.official_name || null,
                        flag: record.flag_emoji || getFlagEmoji(record.alpha2),
                        flagSvgUrl: record.flag_svg_url || null,
                        flagPngUrl: record.flag_png_url || null,
                        region: record.region || null,
                        subregion: record.subregion || null,
                        currencies:
                            record.currencies &&
                            typeof record.currencies === "object" &&
                            !Array.isArray(record.currencies)
                                ? (record.currencies as CountryOption["currencies"])
                                : {},
                        welcomeLabel: record.welcome_label || null,
                        arrivalLabel: record.arrival_label || null,
                        primaryLanguageCode: record.primary_language_code || null,
                        primaryLanguageName: record.primary_language_name || null,
                        languages:
                            record.languages &&
                            typeof record.languages === "object" &&
                            !Array.isArray(record.languages)
                                ? (record.languages as Record<string, string>)
                                : null,
                        capital: record.capital || null,
                        defaultEntryAirportId: record.default_entry_airport_id || null,
                    }))
                    .map((country) => ({
                        ...country,
                        languageOptions: buildStampLanguageOptions(
                            country,
                            languageLabels
                        ),
                    }))
                    .filter((country) => country.code && country.name)
                    .sort((a, b) => a.name.localeCompare(b.name));

                if (!isCancelled) {
                    setWelcomeLabelsByLanguage(languageLabels);
                    setCountryOptions(options);
                }
            } catch (error) {
                console.warn("Could not load country options:", getErrorDetails(error));
                if (!isCancelled) setCountryOptions([]);
            } finally {
                if (!isCancelled) setIsLoadingCountries(false);
            }
        }

        loadCountryOptions();

        return () => {
            isCancelled = true;
        };
    }, [isProfileSurfaceActive]);

    useEffect(() => {
        setCurrentThemeMode(
            isVaiviaThemeMode(preferences?.theme_mode)
                ? preferences.theme_mode
                : "dark"
        );

        function handleThemeChange(event: Event) {
            const detail = (event as CustomEvent<{ mode?: VaiviaThemeMode }>).detail;
            if (detail?.mode) setCurrentThemeMode(detail.mode);
        }

        window.addEventListener("vaivia:theme-mode-change", handleThemeChange);
        return () =>
            window.removeEventListener(
                "vaivia:theme-mode-change",
                handleThemeChange
            );
    }, [preferences?.theme_mode]);

    useEffect(() => {
        if (!isProfileSurfaceActive) return;

        let isCancelled = false;

        async function loadProfileStats() {
            setIsLoadingProfileStats(true);
            const supabase = createClient();
            const today = new Date().toISOString().slice(0, 10);

            try {
                const [
                    membershipResult,
                    ownerTripsResult,
                    manualStampsResult,
                    bucketListResult,
                    scratchMapResult,
                    friendshipsResult,
                    pointsResult,
                    passportStampSharesResult,
                ] =
                    await Promise.all([
                        supabase
                            .from("trip_members")
                            .select("trip_id,user_id,status")
                            .eq("user_id", userId)
                            .eq("status", "active"),
                        supabase
                            .from("trips")
                            .select("id,user_id,title,destination,start_date,end_date")
                            .eq("user_id", userId)
                            .is("archived_at", null),
                        supabase
                            .from("user_passport_stamps")
                            .select(
                                "id,country_code,country_name,flag_emoji,source,created_at,stamped_at,first_visited_on,first_entry_iata_code,first_entry_icao_code,first_entry_city,first_entry_airport_name,first_entry_airport_google_place_id,first_entry_airport_formatted_address,welcome_label_snapshot,arrival_label_snapshot,stamp_language_code,stamp_language_name,stamp_display_country_name,stamp_display_flag,visit_city,visit_region,visit_month,visit_status,port_of_entry_type,port_of_entry_name"
                            )
                            .eq("user_id", userId),
                        (supabase.from as any)("user_travel_bucket_list")
                            .select(
                                "id,place_label,city,region,country_code,country_name,flag_emoji,google_place_id,google_formatted_address,latitude,longitude,status,completed_at,passport_stamp_id,created_at"
                            )
                            .eq("user_id", userId)
                            .order("status", { ascending: false })
                            .order("created_at", { ascending: true }),
                        (supabase.from as any)("user_scratch_map_countries")
                            .select("id,country_code")
                            .eq("user_id", userId),
                        (supabase.from as any)("user_friendships")
                            .select(
                                "id,requester_user_id,addressee_identifier,addressee_user_id,status,created_at"
                            )
                            .or(
                                `requester_user_id.eq.${userId},addressee_user_id.eq.${userId}`
                            )
                            .order("created_at", { ascending: false }),
                        supabase
                            .from("user_points")
                            .select("points,level,level_name")
                            .eq("user_id", userId)
                            .maybeSingle(),
                        supabase
                            .from("user_passport_stamp_shares")
                            .select("source_stamp_id,recipient_user_id,status")
                            .eq("sender_user_id", userId)
                            .in("status", ["pending", "accepted"]),
                    ]);

                if (membershipResult.error) throw membershipResult.error;
                if (ownerTripsResult.error) throw ownerTripsResult.error;

                if (manualStampsResult.error) {
                    console.warn("Could not load manual passport stamps:", {
                        ...getErrorDetails(manualStampsResult.error),
                        userId,
                    });
                }

                if (bucketListResult.error) {
                    console.warn("Could not load travel bucket list:", {
                        ...getErrorDetails(bucketListResult.error),
                        userId,
                    });
                }

                if (friendshipsResult.error) {
                    console.warn("Could not load friends:", {
                        ...getErrorDetails(friendshipsResult.error),
                        userId,
                    });
                }

                if (scratchMapResult.error) {
                    console.warn("Could not load scratch map countries:", {
                        ...getErrorDetails(scratchMapResult.error),
                        userId,
                    });
                }

                if (pointsResult.error) {
                    console.warn("Could not load user points:", {
                        ...getErrorDetails(pointsResult.error),
                        userId,
                    });
                }

                if (passportStampSharesResult.error) {
                    console.warn("Could not load passport stamp friend shares:", {
                        ...getErrorDetails(passportStampSharesResult.error),
                        userId,
                    });
                }

                const pointsRow = pointsResult.error ? null : pointsResult.data;
                const points = Math.max(
                    0,
                    Number.isFinite(Number(pointsRow?.points))
                        ? Number(pointsRow?.points)
                        : 0
                );
                const level = Math.max(
                    1,
                    Number.isFinite(Number(pointsRow?.level))
                        ? Number(pointsRow?.level)
                        : 1
                );
                const levelName =
                    typeof pointsRow?.level_name === "string" &&
                    pointsRow.level_name.trim()
                        ? pointsRow.level_name.trim()
                        : "Still Packing";

                const memberTripIds = ((membershipResult.data || []) as Array<{
                    trip_id?: string | null;
                }>)
                    .map((membership) => membership.trip_id)
                    .filter((tripId): tripId is string => Boolean(tripId));

                const memberTripsResult =
                    memberTripIds.length > 0
                        ? await supabase
                              .from("trips")
                              .select("id,user_id,title,destination,start_date,end_date")
                              .in("id", memberTripIds)
                              .is("archived_at", null)
                        : { data: [], error: null };

                if (memberTripsResult.error) throw memberTripsResult.error;

                const tripsById = new Map<
                    string,
                    {
                        id: string;
                        user_id?: string | null;
                        title?: string | null;
                        destination?: string | null;
                        start_date?: string | null;
                        end_date?: string | null;
                    }
                >();

                [
                    ...((ownerTripsResult.data || []) as Array<{
                        id: string;
                        user_id?: string | null;
                        title?: string | null;
                        destination?: string | null;
                        start_date?: string | null;
                        end_date?: string | null;
                    }>),
                    ...((memberTripsResult.data || []) as Array<{
                        id: string;
                        user_id?: string | null;
                        title?: string | null;
                        destination?: string | null;
                        start_date?: string | null;
                        end_date?: string | null;
                    }>),
                ].forEach((trip) => {
                    if (trip.id) tripsById.set(trip.id, trip);
                });

                const pastTripIds = Array.from(tripsById.values())
                    .filter((trip) => trip.end_date && trip.end_date < today)
                    .map((trip) => trip.id);

                const tripLegsResult =
                    pastTripIds.length > 0
                        ? await supabase
                              .from("trip_legs")
                              .select("trip_id,country_code")
                              .in("trip_id", pastTripIds)
                        : { data: [], error: null };

                if (tripLegsResult.error) {
                    console.warn("Could not load passport trip legs:", {
                        ...getErrorDetails(tripLegsResult.error),
                        userId,
                    });
                }

                const autoStamps: PassportStamp[] = [];

                ((tripLegsResult.data || []) as Array<{
                    trip_id?: string | null;
                    country_code?: string | null;
                }>).forEach((leg) => {
                    const countryCode = leg.country_code?.trim().toUpperCase();
                    if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) return;
                    const trip = leg.trip_id ? tripsById.get(leg.trip_id) : null;
                    const firstVisitedOn = getFirstVisitDateForTrip(trip || undefined);
                    autoStamps.push({
                        countryCode,
                        countryName: getCountryName(countryCode),
                        flagEmoji: getFlagEmoji(countryCode),
                        firstVisitedOn,
                        firstVisitYear: getYearFromDate(firstVisitedOn),
                        sourceTripTitle: trip?.title || null,
                        source: "auto",
                    });
                });

                pastTripIds.forEach((tripId) => {
                    const trip = tripsById.get(tripId);
                    parseDestinationList(trip?.destination).forEach((destination) => {
                        const flag = getLeadingFlag(destination);
                        const countryCode = getCountryCodeFromFlag(flag);
                        if (!countryCode) return;
                        const firstVisitedOn = getFirstVisitDateForTrip(trip);
                        autoStamps.push({
                            countryCode,
                            countryName: getCountryName(countryCode),
                            flagEmoji: flag || getFlagEmoji(countryCode),
                            firstVisitedOn,
                            firstVisitYear: getYearFromDate(firstVisitedOn),
                            sourceTripTitle: trip?.title || null,
                            source: "auto",
                        });
                    });
                });

                const manualStamps = (
                    (manualStampsResult.data || []) as Array<{
                        id?: string;
                        country_code?: string | null;
                        country_name?: string | null;
                        flag_emoji?: string | null;
                        first_visited_on?: string | null;
                        stamped_at?: string | null;
                        created_at?: string | null;
                        first_entry_iata_code?: string | null;
                        first_entry_icao_code?: string | null;
                        first_entry_city?: string | null;
                        first_entry_airport_name?: string | null;
                        first_entry_airport_google_place_id?: string | null;
                        first_entry_airport_formatted_address?: string | null;
                        welcome_label_snapshot?: string | null;
                        arrival_label_snapshot?: string | null;
                        stamp_language_code?: string | null;
                        stamp_language_name?: string | null;
                        stamp_display_country_name?: string | null;
                        stamp_display_flag?: string | null;
                        visit_city?: string | null;
                        visit_region?: string | null;
                        visit_month?: number | null;
                        visit_status?: string | null;
                        port_of_entry_type?: string | null;
                        port_of_entry_name?: string | null;
                    }>
                ).reduce<PassportStamp[]>((stamps, stamp) => {
                        const countryCode = String(stamp.country_code || "")
                            .trim()
                            .toUpperCase();
                        if (!/^[A-Z]{2}$/.test(countryCode)) return stamps;

                        stamps.push({
                            id: stamp.id,
                            countryCode,
                            countryName:
                                stamp.stamp_display_country_name ||
                                stamp.country_name ||
                                getCountryName(countryCode),
                            flagEmoji:
                                stamp.stamp_display_flag ||
                                stamp.flag_emoji ||
                                getFlagEmoji(countryCode),
                            firstVisitedOn: stamp.first_visited_on || null,
                            firstVisitYear:
                                getYearFromDate(stamp.first_visited_on) ||
                                getYearFromDate(stamp.stamped_at) ||
                                getYearFromDate(stamp.created_at),
                            welcomeLabel:
                                stamp.welcome_label_snapshot ||
                                stamp.arrival_label_snapshot ||
                                null,
                            arrivalLabel: stamp.arrival_label_snapshot || null,
                            stampLanguageCode: stamp.stamp_language_code || null,
                            stampLanguageName: stamp.stamp_language_name || null,
                            airportCode:
                                stamp.first_entry_iata_code ||
                                stamp.first_entry_icao_code ||
                                null,
                            airportCity: stamp.first_entry_city || null,
                            airportName: stamp.first_entry_airport_name || null,
                            airportGooglePlaceId:
                                stamp.first_entry_airport_google_place_id || null,
                            airportFormattedAddress:
                                stamp.first_entry_airport_formatted_address || null,
                            visitCity: stamp.visit_city || null,
                            visitRegion: stamp.visit_region || null,
                            visitMonth: stamp.visit_month || null,
                            visitStatus: stamp.visit_status || "visited",
                            portOfEntryType: stamp.port_of_entry_type || null,
                            portOfEntryName: stamp.port_of_entry_name || null,
                            source: "manual" as const,
                        });

                        return stamps;
                    }, []);

                let mergedStamps = mergePassportStamps([
                    ...autoStamps,
                    ...manualStamps,
                ]);
                const bucketListRows = (
                    bucketListResult.error ? [] : bucketListResult.data || []
                ) as any[];
                const bucketList = bucketListRows.reduce<TravelBucketListItem[]>((items, item) => {
                    const countryCode = String(item.country_code || "")
                        .trim()
                        .toUpperCase();
                    if (!/^[A-Z]{2}$/.test(countryCode)) return items;

                    items.push({
                        id: String(item.id),
                        placeLabel: String(item.place_label || "").trim(),
                        city: item.city || null,
                        region: item.region || null,
                        countryCode,
                        countryName: item.country_name || getCountryName(countryCode),
                        flagEmoji: item.flag_emoji || getFlagEmoji(countryCode),
                        googlePlaceId: item.google_place_id || null,
                        googleFormattedAddress: item.google_formatted_address || null,
                        latitude:
                            typeof item.latitude === "number" ? item.latitude : null,
                        longitude:
                            typeof item.longitude === "number" ? item.longitude : null,
                        status:
                            item.status === "completed"
                                ? "completed"
                                : "in_progress",
                        completedAt: item.completed_at || null,
                        passportStampId: item.passport_stamp_id || null,
                    });
                    return items;
                }, []);
                const scratchMapRows = (
                    scratchMapResult.error ? [] : scratchMapResult.data || []
                ) as any[];
                const scratchMapCountries = scratchMapRows.reduce<ScratchMapCountry[]>((items, item) => {
                    const countryCode = String(item.country_code || "")
                        .trim()
                        .toUpperCase();
                    if (!/^[A-Z]{3}$/.test(countryCode)) return items;

                    items.push({
                        id: String(item.id),
                        countryCode,
                    });
                    return items;
                }, []);

                const friendshipRows = (
                    friendshipsResult.error ? [] : friendshipsResult.data || []
                ) as Array<{
                    id?: string | null;
                    requester_user_id?: string | null;
                    addressee_identifier?: string | null;
                    addressee_user_id?: string | null;
                    status?: string | null;
                    created_at?: string | null;
                }>;
                const sentInvitations = friendshipRows
                    .filter(
                        (friendship) =>
                            friendship.status === "pending" &&
                            friendship.requester_user_id === userId
                    )
                    .map((friendship) => ({
                        id: String(friendship.id || ""),
                        identifier: friendship.addressee_identifier || "Pending invite",
                        requesterUserId: friendship.requester_user_id || "",
                        addresseeUserId: friendship.addressee_user_id || null,
                        status: "pending" as const,
                        createdAt: friendship.created_at || null,
                    }))
                    .filter((invitation) => invitation.id);
                const incomingInvitations = friendshipRows
                    .filter(
                        (friendship) =>
                            friendship.status === "pending" &&
                            friendship.addressee_user_id === userId
                    )
                    .map((friendship) => ({
                        id: String(friendship.id || ""),
                        identifier: friendship.addressee_identifier || "Friend invite",
                        requesterUserId: friendship.requester_user_id || "",
                        addresseeUserId: friendship.addressee_user_id || null,
                        status: "pending" as const,
                        createdAt: friendship.created_at || null,
                    }))
                    .filter((invitation) => invitation.id);
                const acceptedFriendIds = Array.from(
                    new Set(
                        friendshipRows
                            .filter((friendship) => friendship.status === "accepted")
                            .map((friendship) =>
                                friendship.requester_user_id === userId
                                    ? friendship.addressee_user_id
                                    : friendship.requester_user_id
                            )
                            .filter((friendId): friendId is string =>
                                Boolean(friendId && friendId !== userId)
                            )
                    )
                );
                const friendProfilesResult =
                    acceptedFriendIds.length > 0
                        ? await supabase
                              .from("connected_public_user_profiles")
                              .select(
                                  "id,first_name,last_name,username,avatar_url,role,join_date,created_at"
                              )
                              .in("id", acceptedFriendIds)
                        : { data: [], error: null };

                if (friendProfilesResult.error) {
                    console.warn("Could not load friend profiles:", {
                        ...getErrorDetails(friendProfilesResult.error),
                        userId,
                    });
                }

                const friendThemeResult =
                    acceptedFriendIds.length > 0
                        ? await supabase
                              .from("user_preferences")
                              .select("user_id,theme_mode")
                              .in("user_id", acceptedFriendIds)
                        : { data: [], error: null };

                if (friendThemeResult.error) {
                    console.warn("Could not load friend preferences:", {
                        ...getErrorDetails(friendThemeResult.error),
                        userId,
                    });
                }

                const friendThemesById = new Map(
                    ((friendThemeResult.data || []) as Array<{
                        user_id?: string | null;
                        theme_mode?: string | null;
                    }>).map((preference) => [
                        preference.user_id || "",
                        isVaiviaThemeMode(preference.theme_mode)
                            ? preference.theme_mode
                            : null,
                    ])
                );
                const friends = ((friendProfilesResult.data || []) as Array<{
                    id: string;
                    first_name?: string | null;
                    last_name?: string | null;
                    username?: string | null;
                    avatar_url?: string | null;
                    role?: string | null;
                    join_date?: string | null;
                    created_at?: string | null;
                }>).map((friend) => ({
                    id: friend.id,
                    firstName: friend.first_name || null,
                    lastName: friend.last_name || null,
                    username: friend.username || null,
                    email: null,
                    avatarUrl: friend.avatar_url || null,
                    role: friend.role || null,
                    themeMode: friendThemesById.get(friend.id) || null,
                    joinedAt: friend.join_date || friend.created_at || null,
                }));
                const acceptedFriendIdSet = new Set(friends.map((friend) => friend.id));
                const travelFriendIdsByStampId = (
                    passportStampSharesResult.error
                        ? []
                        : passportStampSharesResult.data || []
                ).reduce<Map<string, string[]>>((sharesByStamp, share) => {
                    const stampId = String(share.source_stamp_id || "");
                    const friendId = String(share.recipient_user_id || "");
                    if (
                        !stampId ||
                        !friendId ||
                        !acceptedFriendIdSet.has(friendId)
                    ) {
                        return sharesByStamp;
                    }

                    const existing = sharesByStamp.get(stampId) || [];
                    if (!existing.includes(friendId)) {
                        sharesByStamp.set(stampId, [...existing, friendId]);
                    }
                    return sharesByStamp;
                }, new Map());

                const stampCountryCodes = mergedStamps.map((stamp) => stamp.countryCode);
                const countryDetailsResult =
                    stampCountryCodes.length > 0
                        ? await supabase
                              .from("countries")
                              .select(
                                  "alpha2,common_name,flag_emoji,flag_svg_url,welcome_label,arrival_label,primary_language_code,capital,default_entry_airport_id"
                              )
                              .in("alpha2", stampCountryCodes)
                        : { data: [], error: null };

                if (countryDetailsResult.error) {
                    console.warn("Could not load passport country details:", {
                        ...getErrorDetails(countryDetailsResult.error),
                        userId,
                    });
                }

                const countryDetailsByCode = new Map(
                    ((countryDetailsResult.data || []) as Array<{
                        alpha2: string;
                        common_name?: string | null;
                        flag_emoji?: string | null;
                        flag_svg_url?: string | null;
                        welcome_label?: string | null;
                        arrival_label?: string | null;
                        primary_language_code?: string | null;
                        capital?: string | null;
                        default_entry_airport_id?: string | null;
                    }>).map((country) => [country.alpha2, country])
                );

                const languageCodes = Array.from(
                    new Set(
                        Array.from(countryDetailsByCode.values())
                            .map((country) => country.primary_language_code)
                            .filter(Boolean) as string[]
                    )
                );
                const languageWelcomeResult =
                    languageCodes.length > 0
                        ? await supabase
                              .from("language_welcome_labels")
                              .select("language_code,welcome_label")
                              .in("language_code", languageCodes)
                        : { data: [], error: null };

                if (languageWelcomeResult.error) {
                    console.warn("Could not load passport welcome labels:", {
                        ...getErrorDetails(languageWelcomeResult.error),
                        userId,
                    });
                }

                const welcomeLabelsByLanguage = new Map(
                    ((languageWelcomeResult.data || []) as Array<{
                        language_code?: string | null;
                        welcome_label?: string | null;
                    }>)
                        .filter(
                            (label) => label.language_code && label.welcome_label
                        )
                        .map((label) => [
                            String(label.language_code).toLowerCase(),
                            String(label.welcome_label),
                        ])
                );

                const defaultAirportIds = Array.from(
                    new Set(
                        Array.from(countryDetailsByCode.values())
                            .map((country) => country.default_entry_airport_id)
                            .filter(Boolean) as string[]
                    )
                );
                const defaultAirportsResult =
                    defaultAirportIds.length > 0
                        ? await supabase
                              .from("airports")
                              .select("id,iata_code,gps_code,municipality")
                              .in("id", defaultAirportIds)
                        : { data: [], error: null };

                if (defaultAirportsResult.error) {
                    console.warn("Could not load passport airport details:", {
                        ...getErrorDetails(defaultAirportsResult.error),
                        userId,
                    });
                }

                const airportsById = new Map(
                    ((defaultAirportsResult.data || []) as Array<{
                        id: string;
                        iata_code?: string | null;
                        gps_code?: string | null;
                        municipality?: string | null;
                    }>).map((airport) => [airport.id, airport])
                );

                mergedStamps = mergedStamps.map((stamp) => {
                    const country = countryDetailsByCode.get(stamp.countryCode);
                    const defaultAirport = country?.default_entry_airport_id
                        ? airportsById.get(country.default_entry_airport_id)
                        : null;

                    return {
                        ...stamp,
                        countryName:
                            stamp.countryName ||
                            country?.common_name ||
                            getCountryName(stamp.countryCode),
                        flagEmoji:
                            stamp.flagEmoji ||
                            country?.flag_emoji ||
                            getFlagEmoji(stamp.countryCode),
                        flagSvgUrl: stamp.flagSvgUrl || country?.flag_svg_url || null,
                        welcomeLabel: resolvePassportWelcomeLabel(
                            stamp.countryCode,
                            stamp.welcomeLabel,
                            country?.welcome_label,
                            country?.primary_language_code
                                ? welcomeLabelsByLanguage.get(
                                      country.primary_language_code.toLowerCase()
                                  )
                                : null,
                            stamp.arrivalLabel,
                            country?.arrival_label
                        ),
                        arrivalLabel:
                            stamp.arrivalLabel || country?.arrival_label || null,
                        airportCode:
                            stamp.airportCode ||
                            defaultAirport?.iata_code ||
                            defaultAirport?.gps_code ||
                            null,
                        airportCity:
                            stamp.airportCity ||
                            defaultAirport?.municipality ||
                            country?.capital ||
                            null,
                        travelFriendIds: stamp.id
                            ? travelFriendIdsByStampId.get(stamp.id) || []
                            : stamp.travelFriendIds || [],
                    };
                });

                if (!isCancelled) {
                    setProfileStats({
                        tripsPlanned: tripsById.size,
                        friendsCount: friends.length,
                        points,
                        level,
                        levelName,
                        friends,
                        sentInvitations,
                        incomingInvitations,
                        stamps: mergedStamps,
                        bucketList,
                        scratchMapCountries,
                    });
                }
            } catch (error) {
                console.error("Could not load profile stats:", {
                    ...getErrorDetails(error),
                    userId,
                });
                if (!isCancelled) {
                    setProfileStats({
                        tripsPlanned: 0,
                        friendsCount: 0,
                        points: 0,
                        level: 1,
                        levelName: "Still Packing",
                        friends: [],
                        sentInvitations: [],
                        incomingInvitations: [],
                        stamps: [],
                        bucketList: [],
                        scratchMapCountries: [],
                    });
                }
            } finally {
                if (!isCancelled) setIsLoadingProfileStats(false);
            }
        }

        loadProfileStats();

        return () => {
            isCancelled = true;
        };
    }, [isProfileSurfaceActive, userId]);

    useEffect(() => {
        if (!isProfileSurfaceActive) return;

        const interval = window.setInterval(() => {
            setFriendsHeaderPhraseIndex(
                (current) => (current + 1) % FRIENDS_HEADER_PHRASES.length
            );
        }, 4200);

        return () => window.clearInterval(interval);
    }, [isProfileSurfaceActive]);

    async function uploadAvatarIfNeeded() {
        if (!avatarFile) return avatarUrl.trim() || null;

        const supabase = createClient();
        const extension = getAvatarExtension(avatarFile);
        const path = `${userId}/avatar.${extension}`;
        const { error: uploadError } = await supabase.storage
            .from("avatars")
            .upload(path, avatarFile, {
                cacheControl: "3600",
                contentType: avatarFile.type || undefined,
                upsert: true,
            });

        if (uploadError) {
            console.error("Error uploading account avatar:", {
                ...getErrorDetails(uploadError),
                bucket: "avatars",
                path,
                fileType: avatarFile.type,
                fileSize: avatarFile.size,
            });
            throw uploadError;
        }

        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        return data.publicUrl || null;
    }

    function resetSelectedAirport() {
        setSelectedAirportPlaceId("");
        setSelectedAirportName("");
        setSelectedAirportFormattedAddress("");
        setSelectedAirportCity("");
        setSelectedAirportParsedCode("");
    }

    function getCountryOptionFromPlaceParts(parts: PassportStampLocationParts) {
        if (!/^[A-Z]{2}$/.test(parts.countryCode)) return null;

        const existingCountry = countryOptions.find(
            (country) => country.code === parts.countryCode
        );

        return (
            existingCountry || {
                code: parts.countryCode,
                alpha3: null,
                name: parts.countryName || getCountryName(parts.countryCode),
                officialName: null,
                flag: getFlagEmoji(parts.countryCode),
                flagSvgUrl: null,
                flagPngUrl: null,
                region: null,
                subregion: null,
                currencies: {},
                welcomeLabel: resolvePassportWelcomeLabel(parts.countryCode),
                arrivalLabel: null,
                primaryLanguageCode: null,
                capital: null,
                defaultEntryAirportId: null,
                primaryLanguageName: null,
                languages: null,
                languageOptions: buildStampLanguageOptions(
                    {
                        code: parts.countryCode,
                        welcomeLabel: resolvePassportWelcomeLabel(parts.countryCode),
                        arrivalLabel: null,
                        primaryLanguageCode: null,
                        primaryLanguageName: null,
                        languages: null,
                    },
                    welcomeLabelsByLanguage
                ),
            }
        );
    }

    function getPassportStampCountryAlpha2(country: CountryOption) {
        const directCode = country.code.trim().toUpperCase();
        if (/^[A-Z]{2}$/.test(directCode)) return directCode;

        const staticCountry =
            (/^[A-Z]{3}$/.test(directCode)
                ? getCountryOptionByIso3(directCode)
                : null) ||
            (country.alpha3 ? getCountryOptionByIso3(country.alpha3) : null) ||
            (country.name
                ? getCountryOptionByIso3(normalizeCountryCode(country.name) || "")
                : null);

        return staticCountry?.iso2 || directCode;
    }

    function applyManualStampLocationParts(parts: PassportStampLocationParts) {
        const country = getCountryOptionFromPlaceParts(parts);
        if (!country) {
            setSelectedStampCountryCode("");
            setSelectedGoogleCountry(null);
            setErrorMessage("Select a Google Maps city, region, or country result.");
            return false;
        }

        setErrorMessage(null);
        setSelectedGoogleCountry(country);
        setSelectedStampCountryCode(country.code);
        setManualStampLanguageCode("");
        setCountrySearchQuery(
            `${country.flag || getFlagEmoji(country.code)} ${
                parts.displayLabel || country.name
            }`
        );
        setManualStampCity(parts.city);
        setManualStampRegion(parts.region);
        return true;
    }

    function applyEditStampLocationParts(parts: PassportStampLocationParts) {
        if (!/^[A-Z]{2}$/.test(parts.countryCode)) {
            setErrorMessage("Select a Google Maps city, region, or country result.");
            return false;
        }

        setErrorMessage(null);
        setEditStampLocationValue(
            `${getFlagEmoji(parts.countryCode)} ${
                parts.displayLabel || parts.countryName || getCountryName(parts.countryCode)
            }`
        );
        setEditStampCity(parts.city);
        setEditStampRegion(parts.region);
        return true;
    }

    function handleAirportPlaceSelect(place: google.maps.places.PlaceResult) {
        const name = place.name || airportSearchValue;
        const formattedAddress = place.formatted_address || "";
        const city =
            getAddressComponent(place.address_components, "locality") ||
            getAddressComponent(place.address_components, "postal_town") ||
            getAddressComponent(
                place.address_components,
                "administrative_area_level_2"
            ) ||
            getAddressComponent(
                place.address_components,
                "administrative_area_level_1"
            );
        const parsedCode = getAirportCodeCandidate(
            name,
            formattedAddress,
            airportSearchValue
        );

        setAirportSearchValue(
            [name, formattedAddress].filter(Boolean).join(" · ") || airportSearchValue
        );
        setSelectedAirportPlaceId(place.place_id || "");
        setSelectedAirportName(name);
        setSelectedAirportFormattedAddress(formattedAddress);
        setSelectedAirportCity(city);
        setSelectedAirportParsedCode(parsedCode);

        const locationParts = getPassportStampLocationParts(
            place,
            airportSearchValue
        );
        if (/^[A-Z]{2}$/.test(locationParts.countryCode)) {
            if (isEditingPassportStamp) {
                applyEditStampLocationParts(locationParts);
            } else {
                applyManualStampLocationParts(locationParts);
            }
        }
    }

    function handleCountryPlaceSelect(place: google.maps.places.PlaceResult) {
        applyManualStampLocationParts(
            getPassportStampLocationParts(place, countrySearchQuery)
        );
    }

    function handleEditLocationPlaceSelect(place: google.maps.places.PlaceResult) {
        applyEditStampLocationParts(
            getPassportStampLocationParts(place, editStampLocationValue)
        );
    }

    function resetBucketListForm() {
        setEditingBucketListItem(null);
        setBucketListPlaceValue("");
        setBucketListPlaceParts(null);
        setBucketListGooglePlaceId("");
        setBucketListFormattedAddress("");
        setBucketListLatitude(null);
        setBucketListLongitude(null);
    }

    function beginAddBucketListItem() {
        resetBucketListForm();
        setIsBucketListModalOpen(true);
    }

    function beginEditBucketListItem(item: TravelBucketListItem) {
        setEditingBucketListItem(item);
        setBucketListPlaceValue(
            `${item.flagEmoji || getFlagEmoji(item.countryCode)} ${item.placeLabel}`
        );
        setBucketListPlaceParts({
            countryCode: item.countryCode,
            countryName: item.countryName || getCountryName(item.countryCode),
            city: item.city || "",
            region: item.region || "",
            displayLabel: item.placeLabel,
        });
        setBucketListGooglePlaceId(item.googlePlaceId || "");
        setBucketListFormattedAddress(item.googleFormattedAddress || "");
        setBucketListLatitude(item.latitude ?? null);
        setBucketListLongitude(item.longitude ?? null);
        setIsBucketListModalOpen(true);
    }

    function handleBucketListPlaceSelect(place: google.maps.places.PlaceResult) {
        const parts = getPassportStampLocationParts(place, bucketListPlaceValue);
        if (!/^[A-Z]{2}$/.test(parts.countryCode)) {
            setBucketListPlaceParts(null);
            setErrorMessage("Select a Google Maps city, region, or country result.");
            return;
        }

        const coordinates = getPlaceCoordinates(place);
        setErrorMessage(null);
        setBucketListPlaceParts(parts);
        setBucketListGooglePlaceId(place.place_id || "");
        setBucketListFormattedAddress(place.formatted_address || "");
        setBucketListLatitude(coordinates.latitude);
        setBucketListLongitude(coordinates.longitude);
        setBucketListPlaceValue(
            `${getFlagEmoji(parts.countryCode)} ${parts.displayLabel || parts.countryName}`
        );
    }

    function buildBucketListItemFromRecord(record: any): TravelBucketListItem {
        const countryCode = String(record.country_code || "")
            .trim()
            .toUpperCase();

        return {
            id: String(record.id),
            placeLabel: String(record.place_label || "").trim(),
            city: record.city || null,
            region: record.region || null,
            countryCode,
            countryName: record.country_name || getCountryName(countryCode),
            flagEmoji: record.flag_emoji || getFlagEmoji(countryCode),
            googlePlaceId: record.google_place_id || null,
            googleFormattedAddress: record.google_formatted_address || null,
            latitude: typeof record.latitude === "number" ? record.latitude : null,
            longitude: typeof record.longitude === "number" ? record.longitude : null,
            status: record.status === "completed" ? "completed" : "in_progress",
            completedAt: record.completed_at || null,
            passportStampId: record.passport_stamp_id || null,
        };
    }

    async function handleSaveBucketListItem() {
        if (!bucketListPlaceParts) {
            setErrorMessage("Select a Google Maps city, region, or country result.");
            return;
        }

        const supabase = createClient();
        setIsSavingBucketListItem(true);
        setErrorMessage(null);

        try {
            const placeLabel =
                bucketListPlaceParts.displayLabel ||
                bucketListPlaceParts.countryName ||
                bucketListPlaceValue.trim();
            const payload = {
                user_id: userId,
                place_label: placeLabel,
                city: bucketListPlaceParts.city || null,
                region: bucketListPlaceParts.region || null,
                country_code: bucketListPlaceParts.countryCode,
                country_name:
                    bucketListPlaceParts.countryName ||
                    getCountryName(bucketListPlaceParts.countryCode),
                flag_emoji: getFlagEmoji(bucketListPlaceParts.countryCode),
                google_place_id: bucketListGooglePlaceId || null,
                google_formatted_address: bucketListFormattedAddress || null,
                latitude: bucketListLatitude,
                longitude: bucketListLongitude,
                updated_at: new Date().toISOString(),
            };

            const query = editingBucketListItem
                ? (supabase.from as any)("user_travel_bucket_list")
                      .update(payload)
                      .eq("id", editingBucketListItem.id)
                      .eq("user_id", userId)
                : (supabase.from as any)("user_travel_bucket_list").insert(payload);

            const { data, error } = await query
                .select(
                    "id,place_label,city,region,country_code,country_name,flag_emoji,google_place_id,google_formatted_address,latitude,longitude,status,completed_at,passport_stamp_id"
                )
                .single();

            if (error) throw error;

            const savedItem = buildBucketListItemFromRecord(data);
            setProfileStats((current) => ({
                ...current,
                bucketList: editingBucketListItem
                    ? current.bucketList.map((item) =>
                          item.id === savedItem.id ? savedItem : item
                      )
                    : [...current.bucketList, savedItem],
            }));
            resetBucketListForm();
            setIsBucketListModalOpen(false);
        } catch (error) {
            console.error("Could not save travel bucket list item:", {
                ...getErrorDetails(error),
                userId,
            });
            setErrorMessage("Could not save bucket list item.");
        } finally {
            setIsSavingBucketListItem(false);
        }
    }

    function resetBucketListCompletionForm() {
        setBucketListCompletionItem(null);
        setBucketListCompletionYear("");
        setBucketListCompletionMonth("");
        setBucketListCompletionLanguageCode("");
    }

    function requestCompleteBucketListItem(item: TravelBucketListItem) {
        if (item.status === "completed") {
            void handleToggleBucketListItemStatus(item);
            return;
        }

        const current = getCurrentYearMonth();
        setErrorMessage(null);
        setBucketListCompletionItem(item);
        setBucketListCompletionYear(String(current.year));
        setBucketListCompletionMonth(String(current.month));
        setBucketListCompletionLanguageCode("");
    }

    async function findBucketListPassportStampId(
        supabase: ReturnType<typeof createClient>,
        item: TravelBucketListItem,
        ownerUserId: string,
        visitDate?: string | null
    ) {
        if (item.passportStampId) return item.passportStampId;

        const resolvedVisitDate =
            visitDate || (item.completedAt ? item.completedAt.slice(0, 10) : "");
        if (!resolvedVisitDate || !/^[A-Z]{2}$/.test(item.countryCode)) {
            return null;
        }

        let query = supabase
            .from("user_passport_stamps")
            .select("id")
            .eq("user_id", ownerUserId)
            .eq("country_code", item.countryCode)
            .eq("first_visited_on", resolvedVisitDate)
            .limit(2);

        query = item.city
            ? query.eq("visit_city", item.city)
            : query.is("visit_city", null);
        query = item.region
            ? query.eq("visit_region", item.region)
            : query.is("visit_region", null);

        const { data, error } = await query;

        if (error) {
            console.warn("Could not look up linked bucket list passport stamp:", {
                ...getErrorDetails(error),
                item,
                userId: ownerUserId,
                visitDate: resolvedVisitDate,
            });
            return null;
        }

        return data?.length === 1 ? data[0]?.id || null : null;
    }

    async function handleToggleBucketListItemStatus(item: TravelBucketListItem) {
        const supabase = createClient();
        const completedAt = new Date().toISOString();
        setErrorMessage(null);

        try {
            const linkedPassportStampId =
                item.status === "completed"
                    ? await findBucketListPassportStampId(supabase, item, userId)
                    : item.passportStampId || null;

            if (item.status === "completed" && linkedPassportStampId) {
                const { error: stampDeleteError } = await supabase
                    .from("user_passport_stamps")
                    .delete()
                    .eq("id", linkedPassportStampId)
                    .eq("user_id", userId);

                if (stampDeleteError) {
                    console.error("Could not delete bucket list passport stamp:", {
                        ...getErrorDetails(stampDeleteError),
                        item,
                        passportStampId: linkedPassportStampId,
                        userId,
                    });
                    throw stampDeleteError;
                }
            }

            const { data, error } = await (supabase.from as any)(
                "user_travel_bucket_list"
            )
                .update({
                    status:
                        item.status === "completed" ? "in_progress" : "completed",
                    completed_at: item.status === "completed" ? null : completedAt,
                    passport_stamp_id:
                        item.status === "completed"
                            ? null
                            : linkedPassportStampId,
                    updated_at: completedAt,
                })
                .eq("id", item.id)
                .eq("user_id", userId)
                .select(
                    "id,place_label,city,region,country_code,country_name,flag_emoji,google_place_id,google_formatted_address,latitude,longitude,status,completed_at,passport_stamp_id"
                )
                .single();

            if (error) throw error;

            const updatedItem = buildBucketListItemFromRecord(data);
            setProfileStats((current) => ({
                ...current,
                stamps:
                    item.status === "completed" && linkedPassportStampId
                        ? current.stamps.filter(
                              (stamp) => stamp.id !== linkedPassportStampId
                          )
                        : current.stamps,
                bucketList: current.bucketList.map((currentItem) =>
                    currentItem.id === updatedItem.id ? updatedItem : currentItem
                ),
            }));
        } catch (error) {
            console.error("Could not update travel bucket list item:", {
                ...getErrorDetails(error),
                item,
                userId,
            });
            setErrorMessage("Could not update bucket list item.");
        }
    }

    async function handleSaveBucketListCompletion() {
        if (!bucketListCompletionItem || !bucketListCompletionCountry) return;

        const dateError = getStampDateError(
            bucketListCompletionYear,
            bucketListCompletionMonth
        );
        if (dateError) {
            setErrorMessage(dateError);
            return;
        }

        const selectedLanguage = getSelectedStampLanguageOption(
            bucketListCompletionCountry,
            bucketListCompletionLanguageCode
        );
        const resolvedWelcomeLabel =
            selectedLanguage?.welcomeLabel ||
            resolvePassportWelcomeLabel(
                bucketListCompletionCountry.code,
                bucketListCompletionCountry.welcomeLabel,
                bucketListCompletionCountry.arrivalLabel
            );
        const firstVisitedOn = getManualVisitDate(
            bucketListCompletionYear,
            bucketListCompletionMonth
        );
        const completedAt = firstVisitedOn
            ? `${firstVisitedOn}T00:00:00.000Z`
            : new Date().toISOString();
        const supabase = createClient();

        setIsSavingBucketListCompletion(true);
        setErrorMessage(null);

        try {
            const {
                data: { user: currentUser },
                error: authError,
            } = await supabase.auth.getUser();

            if (authError || !currentUser?.id) {
                console.error("Could not resolve current user for bucket list completion:", {
                    ...getErrorDetails(authError),
                    propUserId: userId,
                });
                throw new Error("Sign in again before completing this bucket list item.");
            }

            const stampCountryCode =
                getPassportStampCountryAlpha2(bucketListCompletionCountry);
            if (!/^[A-Z]{2}$/.test(stampCountryCode)) {
                throw new Error(
                    `Could not resolve a two-letter country code for ${bucketListCompletionCountry.name}.`
                );
            }

            const countryName =
                bucketListCompletionCountry.name ||
                bucketListCompletionItem.countryName ||
                getCountryName(stampCountryCode);
            const flagEmoji =
                bucketListCompletionCountry.flag ||
                bucketListCompletionItem.flagEmoji ||
                getFlagEmoji(stampCountryCode);
            const stampPayload = {
                user_id: currentUser.id,
                country_code: stampCountryCode,
                country_name: countryName,
                flag_emoji: flagEmoji,
                first_visited_on: firstVisitedOn,
                welcome_label_snapshot: resolvedWelcomeLabel,
                arrival_label_snapshot:
                    bucketListCompletionCountry.arrivalLabel || null,
                stamp_language_code:
                    selectedLanguage?.code ||
                    bucketListCompletionCountry.primaryLanguageCode ||
                    null,
                stamp_language_name:
                    selectedLanguage?.name ||
                    bucketListCompletionCountry.primaryLanguageName ||
                    null,
                stamp_display_country_name: countryName,
                stamp_display_flag: flagEmoji,
                first_entry_airport_id: null,
                first_entry_iata_code: null,
                first_entry_icao_code: null,
                first_entry_city: bucketListCompletionItem.city || null,
                first_entry_airport_name: null,
                first_entry_airport_google_place_id: null,
                first_entry_airport_formatted_address:
                    bucketListCompletionItem.googleFormattedAddress || null,
                visit_city: bucketListCompletionItem.city || null,
                visit_region: bucketListCompletionItem.region || null,
                visit_month: bucketListCompletionMonth
                    ? Number(bucketListCompletionMonth)
                    : null,
                visit_status: "visited",
                port_of_entry_type: null,
                port_of_entry_name: null,
                source: "manual",
                updated_at: new Date().toISOString(),
            };

            const stampSelect =
                "id,country_code,country_name,flag_emoji,first_visited_on,welcome_label_snapshot,arrival_label_snapshot,stamp_language_code,stamp_language_name,stamp_display_country_name,stamp_display_flag,first_entry_iata_code,first_entry_icao_code,first_entry_city,first_entry_airport_name,first_entry_airport_google_place_id,first_entry_airport_formatted_address,visit_city,visit_region,visit_month,visit_status,port_of_entry_type,port_of_entry_name";
            const linkedPassportStampId = await findBucketListPassportStampId(
                supabase,
                bucketListCompletionItem,
                currentUser.id,
                firstVisitedOn
            );
            const stampQuery = linkedPassportStampId
                ? supabase
                      .from("user_passport_stamps")
                      .update(stampPayload)
                      .eq("id", linkedPassportStampId)
                      .eq("user_id", currentUser.id)
                : supabase.from("user_passport_stamps").insert(stampPayload);
            const { data: stampData, error: stampError } = await stampQuery
                .select(stampSelect)
                .single();

            if (stampError) {
                console.error("Bucket list passport stamp insert failed:", {
                    ...getErrorDetails(stampError),
                    countryCode: bucketListCompletionCountry.code,
                    resolvedCountryCode: stampCountryCode,
                    userId: currentUser.id,
                    bucketListItemId: bucketListCompletionItem.id,
                    firstVisitedOn,
                    visitMonth: bucketListCompletionMonth || null,
                });
                throw stampError;
            }

            const { data: bucketData, error: bucketError } = await (supabase
                .from as any)("user_travel_bucket_list")
                .update({
                    status: "completed",
                    completed_at: completedAt,
                    passport_stamp_id: stampData?.id || null,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", bucketListCompletionItem.id)
                .eq("user_id", currentUser.id)
                .select(
                    "id,place_label,city,region,country_code,country_name,flag_emoji,google_place_id,google_formatted_address,latitude,longitude,status,completed_at,passport_stamp_id"
                )
                .single();

            if (bucketError) {
                console.error("Bucket list completion update failed:", {
                    ...getErrorDetails(bucketError),
                    userId: currentUser.id,
                    bucketListItemId: bucketListCompletionItem.id,
                });
                throw bucketError;
            }

            const stamp: PassportStamp = {
                id: stampData?.id,
                countryCode:
                    stampData?.country_code || stampCountryCode,
                countryName:
                    stampData?.stamp_display_country_name ||
                    stampData?.country_name ||
                    countryName,
                flagEmoji:
                    stampData?.stamp_display_flag ||
                    stampData?.flag_emoji ||
                    flagEmoji,
                flagSvgUrl: bucketListCompletionCountry.flagSvgUrl || null,
                firstVisitedOn: stampData?.first_visited_on || firstVisitedOn,
                firstVisitYear:
                    getYearFromDate(stampData?.first_visited_on) ||
                    getYearFromDate(firstVisitedOn),
                welcomeLabel:
                    stampData?.welcome_label_snapshot ||
                    stampData?.arrival_label_snapshot ||
                    resolvedWelcomeLabel,
                arrivalLabel:
                    stampData?.arrival_label_snapshot ||
                    bucketListCompletionCountry.arrivalLabel ||
                    null,
                stampLanguageCode:
                    stampData?.stamp_language_code ||
                    selectedLanguage?.code ||
                    bucketListCompletionCountry.primaryLanguageCode ||
                    null,
                stampLanguageName:
                    stampData?.stamp_language_name ||
                    selectedLanguage?.name ||
                    bucketListCompletionCountry.primaryLanguageName ||
                    null,
                airportCode:
                    stampData?.first_entry_iata_code ||
                    stampData?.first_entry_icao_code ||
                    null,
                airportCity:
                    stampData?.first_entry_city ||
                    bucketListCompletionItem.city ||
                    null,
                airportName: stampData?.first_entry_airport_name || null,
                airportGooglePlaceId:
                    stampData?.first_entry_airport_google_place_id || null,
                airportFormattedAddress:
                    stampData?.first_entry_airport_formatted_address ||
                    bucketListCompletionItem.googleFormattedAddress ||
                    null,
                visitCity:
                    stampData?.visit_city || bucketListCompletionItem.city || null,
                visitRegion:
                    stampData?.visit_region ||
                    bucketListCompletionItem.region ||
                    null,
                visitMonth:
                    stampData?.visit_month ||
                    (bucketListCompletionMonth
                        ? Number(bucketListCompletionMonth)
                        : null),
                visitStatus: stampData?.visit_status || "visited",
                portOfEntryType: stampData?.port_of_entry_type || null,
                portOfEntryName: stampData?.port_of_entry_name || null,
                source: "manual",
            };
            const updatedItem = buildBucketListItemFromRecord(bucketData);

            setProfileStats((current) => ({
                ...current,
                stamps: mergePassportStamps([
                    ...current.stamps.filter((currentStamp) => currentStamp.id !== stamp.id),
                    stamp,
                ]),
                bucketList: current.bucketList.map((currentItem) =>
                    currentItem.id === updatedItem.id ? updatedItem : currentItem
                ),
            }));
            resetBucketListCompletionForm();
        } catch (error) {
            console.error("Could not complete bucket list item:", {
                ...getErrorDetails(error),
                item: bucketListCompletionItem,
                countryCode: bucketListCompletionCountry.code,
                resolvedCountryCode:
                    getPassportStampCountryAlpha2(bucketListCompletionCountry),
                userId,
            });
            setErrorMessage("Could not complete bucket list item.");
        } finally {
            setIsSavingBucketListCompletion(false);
        }
    }

    async function resolveAirportSnapshot(
        supabase: ReturnType<typeof createClient>,
        countryCode: string
    ) {
        const codeCandidate = selectedAirportParsedCode.trim().toUpperCase();
        const selectedName = selectedAirportName.trim();
        const selectedAddress = selectedAirportFormattedAddress.trim();
        const selectedCity = selectedAirportCity.trim();

        if (!selectedAirportPlaceId || !selectedName) {
            return {
                airportId: null,
                iataCode: null,
                icaoCode: null,
                city: null,
                name: null,
                googlePlaceId: null,
                formattedAddress: null,
            };
        }

        type AirportRow = {
            id: string;
            ident?: string | null;
            name?: string | null;
            iata_code?: string | null;
            gps_code?: string | null;
            municipality?: string | null;
        };

        let matchedAirport: AirportRow | null = null;

        if (codeCandidate) {
            const { data, error } = await supabase
                .from("airports")
                .select("id,ident,name,iata_code,gps_code,municipality")
                .or(
                    `iata_code.eq.${codeCandidate},gps_code.eq.${codeCandidate},ident.eq.${codeCandidate}`
                )
                .limit(1)
                .maybeSingle();

            if (!error && data) {
                matchedAirport = data as AirportRow;
            }
        }

        if (!matchedAirport && selectedName) {
            const escapedName = selectedName.replaceAll("%", "\\%").replaceAll("_", "\\_");
            const { data, error } = await supabase
                .from("airports")
                .select("id,ident,name,iata_code,gps_code,municipality")
                .eq("iso_country", countryCode)
                .ilike("name", `%${escapedName}%`)
                .order("scheduled_service", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!error && data) {
                matchedAirport = data as AirportRow;
            }
        }

        const matchedIata = matchedAirport?.iata_code?.trim().toUpperCase() || "";
        const matchedIcao =
            matchedAirport?.gps_code?.trim().toUpperCase() ||
            matchedAirport?.ident?.trim().toUpperCase() ||
            "";
        const inferredIata =
            codeCandidate.length === 3 && /^[A-Z0-9]{3}$/.test(codeCandidate)
                ? codeCandidate
                : "";
        const inferredIcao =
            codeCandidate.length === 4 && /^[A-Z0-9]{4}$/.test(codeCandidate)
                ? codeCandidate
                : "";

        return {
            airportId: matchedAirport?.id || null,
            iataCode: matchedIata || inferredIata || null,
            icaoCode: matchedIcao || inferredIcao || null,
            city: matchedAirport?.municipality || selectedCity || null,
            name: matchedAirport?.name || selectedName,
            googlePlaceId: selectedAirportPlaceId,
            formattedAddress: selectedAddress || null,
        };
    }

    function requestAddPassportStamp() {
        if (
            selectedStampCountry &&
            selectedStampLanguageOptions.length > 1 &&
            !manualStampLanguageCode
        ) {
            setPassportStampLanguageChoiceMode("add");
            setPassportStampLanguageChoiceCode(
                selectedStampLanguageOptions[0]?.code || ""
            );
            return;
        }

        void handleAddPassportStamp();
    }

    async function handleAddPassportStamp(languageCodeOverride?: string) {
        const selectedCountry = selectedStampCountry;
        if (!selectedCountry) return;

        const supabase = createClient();
        setIsSavingStamp(true);
        setErrorMessage(null);

        try {
            const {
                data: { user: currentUser },
                error: authError,
            } = await supabase.auth.getUser();

            if (authError || !currentUser?.id) {
                console.error("Could not resolve current user for passport stamp:", {
                    ...getErrorDetails(authError),
                    propUserId: userId,
                });
                throw new Error("Sign in again before adding a passport stamp.");
            }

            const dateError = getStampDateError(manualStampYear, manualStampMonth);
            if (dateError) {
                setErrorMessage(dateError);
                return;
            }

            const firstVisitedOn = getManualVisitDate(
                manualStampYear,
                manualStampMonth
            );
            const stampCountryCode = getPassportStampCountryAlpha2(selectedCountry);
            if (!/^[A-Z]{2}$/.test(stampCountryCode)) {
                throw new Error(
                    `Could not resolve a two-letter country code for ${selectedCountry.name}.`
                );
            }

            const airportSnapshot = await resolveAirportSnapshot(
                supabase,
                stampCountryCode
            );
            const selectedLanguage = getSelectedStampLanguageOption(
                selectedCountry,
                languageCodeOverride || manualStampLanguageCode
            );
            const resolvedWelcomeLabel =
                selectedLanguage?.welcomeLabel ||
                resolvePassportWelcomeLabel(
                    stampCountryCode,
                    selectedCountry.welcomeLabel,
                    selectedCountry.arrivalLabel
                );
            const payload = {
                user_id: currentUser.id,
                country_code: stampCountryCode,
                country_name: selectedCountry.name,
                flag_emoji: selectedCountry.flag || getFlagEmoji(stampCountryCode),
                first_visited_on: firstVisitedOn,
                welcome_label_snapshot: resolvedWelcomeLabel,
                arrival_label_snapshot: selectedCountry.arrivalLabel || null,
                stamp_language_code:
                    selectedLanguage?.code ||
                    selectedCountry.primaryLanguageCode ||
                    null,
                stamp_language_name:
                    selectedLanguage?.name ||
                    selectedCountry.primaryLanguageName ||
                    null,
                stamp_display_country_name: selectedCountry.name,
                stamp_display_flag:
                    selectedCountry.flag || getFlagEmoji(selectedCountry.code),
                first_entry_airport_id: airportSnapshot.airportId,
                first_entry_iata_code: airportSnapshot.iataCode,
                first_entry_icao_code: airportSnapshot.icaoCode,
                first_entry_city:
                    airportSnapshot.city || selectedAirportCity || selectedCountry.capital || null,
                first_entry_airport_name: airportSnapshot.name,
                first_entry_airport_google_place_id: airportSnapshot.googlePlaceId,
                first_entry_airport_formatted_address:
                    airportSnapshot.formattedAddress,
                visit_city: manualStampCity.trim() || null,
                visit_region: manualStampRegion.trim() || null,
                visit_month: manualStampMonth ? Number(manualStampMonth) : null,
                visit_status: manualStampStatus,
                port_of_entry_type: null,
                port_of_entry_name:
                    airportSnapshot.name || airportSearchValue.trim() || null,
                source: "manual",
                updated_at: new Date().toISOString(),
            };
            const { data, error } = await supabase
                .from("user_passport_stamps")
                .insert(payload)
                .select(
                    "id,country_code,country_name,flag_emoji,first_visited_on,welcome_label_snapshot,arrival_label_snapshot,stamp_language_code,stamp_language_name,stamp_display_country_name,stamp_display_flag,first_entry_iata_code,first_entry_icao_code,first_entry_city,first_entry_airport_name,first_entry_airport_google_place_id,first_entry_airport_formatted_address,visit_city,visit_region,visit_month,visit_status,port_of_entry_type,port_of_entry_name"
                )
                .single();

            if (error) {
                console.error("Passport stamp insert failed:", {
                    ...getErrorDetails(error),
                    countryCode: selectedCountry.code,
                    resolvedCountryCode: stampCountryCode,
                    userId: currentUser.id,
                    hasAirportPlaceId: Boolean(airportSnapshot.googlePlaceId),
                    hasStampLanguage: Boolean(selectedLanguage?.code),
                });
                throw error;
            }

            let sentShareCount = 0;
            let shareSendFailed = false;
            try {
                sentShareCount = await sendPassportStampToFriends(supabase, data?.id);
            } catch (shareError) {
                shareSendFailed = true;
                console.warn("Passport stamp was added but could not be shared:", {
                    ...getErrorDetails(shareError),
                    stampId: data?.id,
                    friendCount: passportStampFriendIds.length,
                });
                if (passportStampFriendIds.length > 0) {
                    setStatusMessage(
                        "Passport stamp saved, but VAIVIA could not send the friend invite. Try editing the stamp and saving again."
                    );
                }
            }

            const stamp: PassportStamp = {
                id: data?.id,
                countryCode: data?.country_code || stampCountryCode,
                countryName:
                    data?.stamp_display_country_name ||
                    data?.country_name ||
                    selectedCountry.name,
                flagEmoji:
                    data?.stamp_display_flag ||
                    data?.flag_emoji ||
                    selectedCountry.flag ||
                    getFlagEmoji(stampCountryCode),
                flagSvgUrl: selectedCountry.flagSvgUrl || null,
                firstVisitedOn: data?.first_visited_on || firstVisitedOn,
                firstVisitYear:
                    getYearFromDate(data?.first_visited_on) ||
                    getYearFromDate(firstVisitedOn),
                welcomeLabel:
                    data?.welcome_label_snapshot ||
                    data?.arrival_label_snapshot ||
                    resolvedWelcomeLabel,
                arrivalLabel: data?.arrival_label_snapshot || selectedCountry.arrivalLabel || null,
                stampLanguageCode:
                    data?.stamp_language_code ||
                    selectedLanguage?.code ||
                    selectedCountry.primaryLanguageCode ||
                    null,
                stampLanguageName:
                    data?.stamp_language_name ||
                    selectedLanguage?.name ||
                    selectedCountry.primaryLanguageName ||
                    null,
                airportCode:
                    data?.first_entry_iata_code ||
                    data?.first_entry_icao_code ||
                    null,
                airportCity: data?.first_entry_city || selectedCountry.capital || null,
                airportName: data?.first_entry_airport_name || null,
                airportGooglePlaceId:
                    data?.first_entry_airport_google_place_id || null,
                airportFormattedAddress:
                    data?.first_entry_airport_formatted_address || null,
                visitCity: data?.visit_city || manualStampCity.trim() || null,
                visitRegion: data?.visit_region || manualStampRegion.trim() || null,
                visitMonth:
                    data?.visit_month ||
                    (manualStampMonth ? Number(manualStampMonth) : null),
                visitStatus: data?.visit_status || manualStampStatus,
                portOfEntryType: data?.port_of_entry_type || null,
                portOfEntryName:
                    data?.port_of_entry_name ||
                    airportSnapshot.name ||
                    airportSearchValue.trim() ||
                    null,
                travelFriendIds: [...passportStampFriendIds],
                source: "manual",
            };

            setProfileStats((current) => ({
                ...current,
                stamps: mergePassportStamps([...current.stamps, stamp]),
            }));
            setSelectedStampCountryCode("");
            setCountrySearchQuery("");
            setManualStampYear("");
            setManualStampMonth("");
            setManualStampCity("");
            setManualStampRegion("");
            setManualStampLanguageCode("");
            setManualStampStatus("visited");
            setPassportStampFriendIds([]);
            setAirportSearchValue("");
            resetSelectedAirport();
            setIsAddPassportStampOpen(false);
            if (passportStampFriendIds.length > 0) {
                setStatusMessage(
                    shareSendFailed
                        ? "Passport stamp saved, but VAIVIA could not send the friend invite. Try editing the stamp and saving again."
                        : sentShareCount > 0
                        ? `Passport stamp sent to ${sentShareCount} friend${
                              sentShareCount === 1 ? "" : "s"
                          } for review.`
                        : "Passport stamp saved, but no friend requests were sent. Make sure the selected people are accepted friends."
                );
            }
        } catch (error) {
            console.error("Could not add passport stamp:", {
                ...getErrorDetails(error),
                countryCode: selectedCountry.code,
                resolvedCountryCode: getPassportStampCountryAlpha2(selectedCountry),
                userId,
            });
            setErrorMessage("Could not add passport stamp.");
        } finally {
            setIsSavingStamp(false);
        }
    }

    async function handleDeletePassportStamp(stamp: PassportStamp) {
        if (stamp.source !== "manual" || !stamp.id) return false;

        const supabase = createClient();
        setIsSavingStamp(true);
        setErrorMessage(null);

        try {
            const { error } = await supabase
                .from("user_passport_stamps")
                .delete()
                .eq("id", stamp.id)
                .eq("user_id", userId);

            if (error) throw error;

            setProfileStats((current) => ({
                ...current,
                stamps: current.stamps.filter(
                    (currentStamp) =>
                        !(
                            currentStamp.source === "manual" &&
                            currentStamp.id === stamp.id
                        )
                ),
            }));
            return true;
        } catch (error) {
            console.error("Could not delete passport stamp:", {
                ...getErrorDetails(error),
                stamp,
                userId,
            });
            setErrorMessage("Could not remove passport stamp.");
            return false;
        } finally {
            setIsSavingStamp(false);
        }
    }

    async function getPassportStampShareFriendIds(stampId: string) {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("user_passport_stamp_shares")
            .select("recipient_user_id,status")
            .eq("sender_user_id", userId)
            .eq("source_stamp_id", stampId)
            .in("status", ["pending", "accepted"]);

        if (error) {
            console.warn("Could not load passport stamp friend shares:", {
                ...getErrorDetails(error),
                stampId,
                userId,
            });
            return [];
        }

        const acceptedFriendIds = new Set(
            profileStats.friends.map((friend) => friend.id)
        );
        return Array.from(
            new Set(
                ((data || []) as Array<{ recipient_user_id?: string | null }>)
                    .map((share) => share.recipient_user_id)
                    .filter(
                        (friendId): friendId is string =>
                            typeof friendId === "string" &&
                            acceptedFriendIds.has(friendId)
                    )
            )
        );
    }

    async function loadPassportStampShareFriendIds(stampId: string) {
        const nextFriendIds = await getPassportStampShareFriendIds(stampId);
        setPassportStampFriendIds(nextFriendIds);
    }

    function beginEditPassportStamp(stamp: PassportStamp) {
        if (stamp.source !== "manual") return;

        setErrorMessage(null);
        setPassportStampFriendIds(stamp.travelFriendIds || []);
        setIsEditingPassportStamp(true);
        setEditStampYear(
            stamp.firstVisitYear ? String(stamp.firstVisitYear) : ""
        );
        setEditStampMonth(stamp.visitMonth ? String(stamp.visitMonth) : "");
        setEditStampCity(stamp.visitCity || "");
        setEditStampRegion(stamp.visitRegion || "");
        setEditStampLanguageCode(stamp.stampLanguageCode || "");
        setEditStampLocationValue(
            [
                stamp.flagEmoji || getFlagEmoji(stamp.countryCode),
                [stamp.visitCity, stamp.visitRegion, stamp.countryName]
                    .filter(Boolean)
                    .join(", "),
            ]
                .filter(Boolean)
                .join(" ")
        );
        setEditStampStatus(stamp.visitStatus === "lived" ? "lived" : "visited");
        setAirportSearchValue(
            [
                stamp.airportName,
                stamp.airportFormattedAddress,
                stamp.airportCode && !stamp.airportName ? stamp.airportCode : null,
            ]
                .filter(Boolean)
                .join(" · ")
        );
        setSelectedAirportPlaceId(stamp.airportGooglePlaceId || "");
        setSelectedAirportName(stamp.airportName || "");
        setSelectedAirportFormattedAddress(stamp.airportFormattedAddress || "");
        setSelectedAirportCity(stamp.airportCity || "");
        setSelectedAirportParsedCode(stamp.airportCode || "");
        if (stamp.id) {
            void loadPassportStampShareFriendIds(stamp.id);
        }
    }

    function togglePassportStampFriend(friendId: string) {
        setPassportStampFriendIds((current) =>
            current.includes(friendId)
                ? current.filter((id) => id !== friendId)
                : [...current, friendId]
        );
    }

    async function sendPassportStampToFriends(
        supabase: ReturnType<typeof createClient>,
        stampId?: string | null
    ) {
        if (!stampId || passportStampFriendIds.length === 0) return 0;
        const friendIdsToSend = Array.from(new Set(passportStampFriendIds));

        const { data, error } = await supabase.rpc("send_passport_stamp_share" as any, {
            source_stamp_id: stampId,
            recipient_user_ids: friendIdsToSend,
        });

        if (error) throw error;

        return Array.isArray(data) ? data.length : 0;
    }

    function requestUpdatePassportStamp(stamp: PassportStamp) {
        if (
            selectedPassportStampCountry &&
            editStampLanguageOptions.length > 1 &&
            !editStampLanguageCode
        ) {
            setPassportStampLanguageChoiceMode("edit");
            setPassportStampLanguageChoiceCode(
                editStampLanguageOptions[0]?.code || ""
            );
            return;
        }

        void handleUpdatePassportStamp(stamp);
    }

    async function handleUpdatePassportStamp(
        stamp: PassportStamp,
        languageCodeOverride?: string
    ) {
        if (stamp.source !== "manual" || !stamp.id) return;

        const supabase = createClient();
        setIsSavingStamp(true);
        setErrorMessage(null);

        try {
            const dateError = getStampDateError(editStampYear, editStampMonth);
            if (dateError) {
                setErrorMessage(dateError);
                return;
            }

            const airportSnapshot = await resolveAirportSnapshot(
                supabase,
                stamp.countryCode
            );
            const firstVisitedOn = getManualVisitDate(editStampYear, editStampMonth);
            const selectedLanguage = getSelectedStampLanguageOption(
                selectedPassportStampCountry,
                languageCodeOverride || editStampLanguageCode
            );
            const resolvedWelcomeLabel =
                selectedLanguage?.welcomeLabel ||
                resolvePassportWelcomeLabel(
                    stamp.countryCode,
                    stamp.welcomeLabel,
                    stamp.arrivalLabel
                );
            const payload = {
                first_visited_on: firstVisitedOn,
                welcome_label_snapshot: resolvedWelcomeLabel,
                stamp_language_code:
                    selectedLanguage?.code || stamp.stampLanguageCode || null,
                stamp_language_name:
                    selectedLanguage?.name || stamp.stampLanguageName || null,
                first_entry_airport_id: airportSnapshot.airportId,
                first_entry_iata_code: airportSnapshot.iataCode,
                first_entry_icao_code: airportSnapshot.icaoCode,
                first_entry_city: airportSnapshot.city || selectedAirportCity || null,
                first_entry_airport_name: airportSnapshot.name,
                first_entry_airport_google_place_id: airportSnapshot.googlePlaceId,
                first_entry_airport_formatted_address:
                    airportSnapshot.formattedAddress,
                visit_city: editStampCity.trim() || null,
                visit_region: editStampRegion.trim() || null,
                visit_month: editStampMonth ? Number(editStampMonth) : null,
                visit_status: editStampStatus,
                port_of_entry_type: stamp.portOfEntryType || null,
                port_of_entry_name:
                    airportSnapshot.name || airportSearchValue.trim() || null,
                updated_at: new Date().toISOString(),
            };

            const { data, error } = await supabase
                .from("user_passport_stamps")
                .update(payload)
                .eq("id", stamp.id)
                .eq("user_id", userId)
                .select(
                    "id,country_code,country_name,flag_emoji,first_visited_on,welcome_label_snapshot,arrival_label_snapshot,stamp_language_code,stamp_language_name,stamp_display_country_name,stamp_display_flag,first_entry_iata_code,first_entry_icao_code,first_entry_city,first_entry_airport_name,first_entry_airport_google_place_id,first_entry_airport_formatted_address,visit_city,visit_region,visit_month,visit_status,port_of_entry_type,port_of_entry_name"
                )
                .single();

            if (error) throw error;

            let sentShareCount = 0;
            let shareSendFailed = false;
            try {
                sentShareCount = await sendPassportStampToFriends(
                    supabase,
                    data?.id || stamp.id
                );
            } catch (shareError) {
                shareSendFailed = true;
                console.warn("Passport stamp was updated but could not be shared:", {
                    ...getErrorDetails(shareError),
                    stampId: data?.id || stamp.id,
                    friendCount: passportStampFriendIds.length,
                });
                if (passportStampFriendIds.length > 0) {
                    setStatusMessage(
                        "Passport stamp saved, but VAIVIA could not send the friend invite. Try saving again."
                    );
                }
            }

            const updatedStamp: PassportStamp = {
                ...stamp,
                countryCode: data?.country_code || stamp.countryCode,
                countryName:
                    data?.stamp_display_country_name ||
                    data?.country_name ||
                    stamp.countryName,
                flagEmoji:
                    data?.stamp_display_flag ||
                    data?.flag_emoji ||
                    stamp.flagEmoji,
                firstVisitedOn: data?.first_visited_on || null,
                firstVisitYear: getYearFromDate(data?.first_visited_on),
                welcomeLabel:
                    data?.welcome_label_snapshot ||
                    data?.arrival_label_snapshot ||
                    resolvedWelcomeLabel,
                arrivalLabel:
                    data?.arrival_label_snapshot || stamp.arrivalLabel || null,
                stampLanguageCode:
                    data?.stamp_language_code ||
                    selectedLanguage?.code ||
                    stamp.stampLanguageCode ||
                    null,
                stampLanguageName:
                    data?.stamp_language_name ||
                    selectedLanguage?.name ||
                    stamp.stampLanguageName ||
                    null,
                airportCode:
                    data?.first_entry_iata_code ||
                    data?.first_entry_icao_code ||
                    null,
                airportCity: data?.first_entry_city || null,
                airportName: data?.first_entry_airport_name || null,
                airportGooglePlaceId:
                    data?.first_entry_airport_google_place_id || null,
                airportFormattedAddress:
                    data?.first_entry_airport_formatted_address || null,
                visitCity: data?.visit_city || null,
                visitRegion: data?.visit_region || null,
                visitMonth: data?.visit_month || null,
                visitStatus: data?.visit_status || "visited",
                portOfEntryType: data?.port_of_entry_type || null,
                portOfEntryName: data?.port_of_entry_name || null,
                travelFriendIds: [...passportStampFriendIds],
                source: "manual",
            };

            setSelectedPassportStamp(updatedStamp);
            setProfileStats((current) => ({
                ...current,
                stamps: mergePassportStamps(
                    current.stamps.map((currentStamp) =>
                        currentStamp.source === "manual" &&
                        currentStamp.id === stamp.id
                            ? updatedStamp
                            : currentStamp
                    )
                ),
            }));
            setIsEditingPassportStamp(false);
            if (passportStampFriendIds.length > 0) {
                setStatusMessage(
                    shareSendFailed
                        ? "Passport stamp saved, but VAIVIA could not send the friend invite. Try saving again."
                        : sentShareCount > 0
                        ? `Passport stamp sent to ${sentShareCount} friend${
                              sentShareCount === 1 ? "" : "s"
                          } for review.`
                        : "Passport stamp updated, but no friend requests were sent. Make sure the selected people are accepted friends."
                );
            }
            setPassportStampFriendIds([]);
        } catch (error) {
            console.error("Could not update passport stamp:", {
                ...getErrorDetails(error),
                stamp,
                userId,
            });
            setErrorMessage("Could not update passport stamp.");
        } finally {
            setIsSavingStamp(false);
        }
    }

    async function handleSave(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setErrorMessage(null);
        setStatusMessage(null);

        const supabase = createClient();
        setIsSaving(true);

        try {
            const nextAvatarUrl = await uploadAvatarIfNeeded();
            const nextEmail = emailAddress.trim() || null;
            const authUpdates: {
                email?: string;
            } = {};

            if (nextEmail && nextEmail !== email) {
                authUpdates.email = nextEmail;
            }

            if (authUpdates.email) {
                const { error } = await supabase.auth.updateUser(authUpdates);
                if (error) {
                    console.error("Error updating Supabase Auth account:", {
                        ...getErrorDetails(error),
                        attemptedEmailChange: Boolean(authUpdates.email),
                    });
                    throw error;
                }
            }

            const profilePayload = {
                id: userId,
                first_name: firstName.trim() || null,
                last_name: lastName.trim() || null,
                username: profile?.username || username.trim() || null,
                email: nextEmail,
                avatar_url: nextAvatarUrl,
                join_date:
                    profile?.join_date || joinedAt || new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            const { error: profileError } = await supabase
                .from("user_profiles")
                .upsert(profilePayload, { onConflict: "id" });

            if (profileError) {
                console.error("Error saving user profile:", {
                    ...getErrorDetails(profileError),
                    payload: profilePayload,
                });
                throw profileError;
            }

            setAvatarFile(null);
            setAvatarUrl(nextAvatarUrl || "");
            setStatusMessage(
                authUpdates.email
                    ? "Saved. Check your email to confirm the address change."
                    : "Account preferences saved."
            );
            router.refresh();
        } catch (error) {
            console.error("Could not save account preferences:", {
                ...getErrorDetails(error),
                userId,
            });
            setErrorMessage(
                error instanceof Error ? error.message : "Could not save account."
            );
        } finally {
            setIsSaving(false);
        }
    }

    async function handleSignOut() {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/auth/login");
        router.refresh();
    }

    async function handleSendFriendInvite(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const identifier = friendInviteIdentifier.trim();
        if (!identifier || isSavingFriendInvite) return;

        const supabase = createClient();
        setIsSavingFriendInvite(true);
        setErrorMessage(null);
        setStatusMessage(null);

        try {
            const { data, error } = await supabase.rpc("create_friend_invitation", {
                invitee_identifier: identifier,
            });

            if (error) throw error;

            setFriendInviteIdentifier("");
            if (typeof data === "string" && data) {
                setProfileStats((current) => ({
                    ...current,
                    sentInvitations: current.sentInvitations.some(
                        (invitation) => invitation.id === data
                    )
                        ? current.sentInvitations
                        : [
                              {
                                  id: data,
                                  identifier,
                                  requesterUserId: userId,
                                  addresseeUserId: null,
                                  status: "pending",
                                  createdAt: new Date().toISOString(),
                              },
                              ...current.sentInvitations,
                          ],
                }));
            }
            setStatusMessage(
                "If this matches a VAIVIA account, they’ll receive a friend request."
            );
            router.refresh();
        } catch (error) {
            console.error("Could not send friend invite:", {
                ...getErrorDetails(error),
                userId,
            });
            setErrorMessage(
                error instanceof Error ? error.message : "Could not send friend invite."
            );
        } finally {
            setIsSavingFriendInvite(false);
        }
    }

    async function handleBlockFriend(friend: FriendProfile) {
        const confirmed = window.confirm(
            `Block ${getFriendDisplayName(friend)}? They won't be able to see your profile information or join trips with you.`
        );
        if (!confirmed) return;

        const supabase = createClient();
        setErrorMessage(null);
        setStatusMessage(null);

        try {
            const { error } = await supabase.rpc("block_friend", {
                target_user_id: friend.id,
            });

            if (error) throw error;

            setProfileStats((current) => {
                const nextFriends = current.friends.filter(
                    (currentFriend) => currentFriend.id !== friend.id
                );

                return {
                    ...current,
                    friends: nextFriends,
                    friendsCount: nextFriends.length,
                };
            });
            setSelectedFriend(null);
            setSelectedFriendSnapshot(null);
            setIsFriendOptionsOpen(false);
            setStatusMessage(`${getFriendDisplayName(friend)} has been blocked.`);
            router.refresh();
        } catch (error) {
            console.error("Could not block friend:", {
                ...getErrorDetails(error),
                friendId: friend.id,
            });
            setErrorMessage(
                error instanceof Error ? error.message : "Could not block friend."
            );
        }
    }

    function normalizeFriendSnapshot(
        fallbackFriend: FriendProfile,
        snapshot: any
    ): FriendProfileSnapshot {
        const profile = snapshot?.profile || {};
        const preferences = snapshot?.preferences || {};
        const points = snapshot?.points || {};
        const stampRows: any[] = Array.isArray(snapshot?.stamps)
            ? snapshot.stamps
            : [];
        const bucketRows: any[] = Array.isArray(snapshot?.bucketList)
            ? snapshot.bucketList
            : [];
        const scratchRows: any[] = Array.isArray(snapshot?.scratchMapCountries)
            ? snapshot.scratchMapCountries
            : [];

        const friend: FriendProfile = {
            ...fallbackFriend,
            id: String(profile.id || fallbackFriend.id),
            firstName: profile.first_name ?? fallbackFriend.firstName ?? null,
            lastName: profile.last_name ?? fallbackFriend.lastName ?? null,
            username: profile.username ?? fallbackFriend.username ?? null,
            email: profile.email ?? fallbackFriend.email ?? null,
            avatarUrl: profile.avatar_url ?? fallbackFriend.avatarUrl ?? null,
            role: profile.role ?? fallbackFriend.role ?? null,
            themeMode: isVaiviaThemeMode(preferences.theme_mode)
                ? preferences.theme_mode
                : fallbackFriend.themeMode || null,
            joinedAt:
                profile.join_date ||
                profile.created_at ||
                fallbackFriend.joinedAt ||
                null,
        };

        const stamps = stampRows.reduce<PassportStamp[]>((items, stamp: any) => {
            const countryCode = String(stamp.country_code || "")
                .trim()
                .toUpperCase();
            if (!/^[A-Z]{2}$/.test(countryCode)) return items;

            items.push({
                id: stamp.id,
                countryCode,
                countryName:
                    stamp.stamp_display_country_name ||
                    stamp.country_name ||
                    getCountryName(countryCode),
                flagEmoji:
                    stamp.stamp_display_flag ||
                    stamp.flag_emoji ||
                    getFlagEmoji(countryCode),
                firstVisitedOn: stamp.first_visited_on || null,
                firstVisitYear:
                    getYearFromDate(stamp.first_visited_on) ||
                    getYearFromDate(stamp.stamped_at) ||
                    getYearFromDate(stamp.created_at),
                welcomeLabel:
                    stamp.welcome_label_snapshot ||
                    stamp.arrival_label_snapshot ||
                    null,
                arrivalLabel: stamp.arrival_label_snapshot || null,
                stampLanguageCode: stamp.stamp_language_code || null,
                stampLanguageName: stamp.stamp_language_name || null,
                airportCode:
                    stamp.first_entry_iata_code ||
                    stamp.first_entry_icao_code ||
                    null,
                airportCity: stamp.first_entry_city || null,
                airportName: stamp.first_entry_airport_name || null,
                airportGooglePlaceId:
                    stamp.first_entry_airport_google_place_id || null,
                airportFormattedAddress:
                    stamp.first_entry_airport_formatted_address || null,
                visitCity: stamp.visit_city || null,
                visitRegion: stamp.visit_region || null,
                visitMonth: stamp.visit_month || null,
                visitStatus: stamp.visit_status || "visited",
                portOfEntryType: stamp.port_of_entry_type || null,
                portOfEntryName: stamp.port_of_entry_name || null,
                source: "manual",
            });
            return items;
        }, []);

        const bucketList = bucketRows.reduce<TravelBucketListItem[]>(
            (items, item: any) => {
                const countryCode = String(item.country_code || "")
                    .trim()
                    .toUpperCase();
                if (!/^[A-Z]{2}$/.test(countryCode)) return items;

                items.push({
                    id: String(item.id || ""),
                    placeLabel: String(item.place_label || "").trim(),
                    city: item.city || null,
                    region: item.region || null,
                    countryCode,
                    countryName: item.country_name || getCountryName(countryCode),
                    flagEmoji: item.flag_emoji || getFlagEmoji(countryCode),
                    googlePlaceId: item.google_place_id || null,
                    googleFormattedAddress: item.google_formatted_address || null,
                    latitude:
                        typeof item.latitude === "number" ? item.latitude : null,
                    longitude:
                        typeof item.longitude === "number" ? item.longitude : null,
                    status:
                        item.status === "completed" ? "completed" : "in_progress",
                    completedAt: item.completed_at || null,
                    passportStampId: item.passport_stamp_id || null,
                });
                return items;
            },
            []
        );

        const scratchMapCountries = scratchRows.reduce<ScratchMapCountry[]>(
            (items, item: any) => {
                const countryCode = String(item.country_code || "")
                    .trim()
                    .toUpperCase();
                if (!/^[A-Z]{3}$/.test(countryCode)) return items;
                items.push({ id: String(item.id || countryCode), countryCode });
                return items;
            },
            []
        );

        return {
            friend,
            points: Number.isFinite(Number(points.points))
                ? Math.max(0, Number(points.points))
                : 0,
            level: Number.isFinite(Number(points.level))
                ? Math.max(1, Number(points.level))
                : 1,
            levelName:
                typeof points.level_name === "string" && points.level_name.trim()
                    ? points.level_name.trim()
                    : "Still Packing",
            stamps,
            bucketList,
            scratchMapCountries,
        };
    }

    async function handleSelectFriend(friend: FriendProfile) {
        const supabase = createClient();
        setSelectedFriend(friend);
        setSelectedFriendSnapshot(null);
        setIsFriendOptionsOpen(false);
        setIsLoadingFriendSnapshot(true);
        setErrorMessage(null);

        try {
            const { data, error } = await (supabase.rpc as any)(
                "get_friend_profile_snapshot",
                { target_user_id: friend.id }
            );

            if (error) throw error;

            setSelectedFriendSnapshot(normalizeFriendSnapshot(friend, data));
        } catch (error) {
            console.error("Could not load friend profile:", {
                ...getErrorDetails(error),
                friendId: friend.id,
            });
            setErrorMessage("Could not load this friend profile.");
        } finally {
            setIsLoadingFriendSnapshot(false);
        }
    }

    async function handleDeleteFriend(friend: FriendProfile) {
        const confirmed = window.confirm(
            `Remove ${getFriendDisplayName(friend)} as a friend? They can add you again later.`
        );
        if (!confirmed) return;

        const supabase = createClient();
        setErrorMessage(null);
        setStatusMessage(null);

        try {
            const { error } = await (supabase.rpc as any)("unfriend_user", {
                target_user_id: friend.id,
            });

            if (error) throw error;

            setProfileStats((current) => {
                const nextFriends = current.friends.filter(
                    (currentFriend) => currentFriend.id !== friend.id
                );

                return {
                    ...current,
                    friends: nextFriends,
                    friendsCount: nextFriends.length,
                };
            });
            setSelectedFriend(null);
            setSelectedFriendSnapshot(null);
            setIsFriendOptionsOpen(false);
            setStatusMessage(`${getFriendDisplayName(friend)} has been removed.`);
            router.refresh();
        } catch (error) {
            console.error("Could not remove friend:", {
                ...getErrorDetails(error),
                friendId: friend.id,
            });
            setErrorMessage(
                error instanceof Error ? error.message : "Could not remove friend."
            );
        }
    }

    async function handleFriendInvitationStatus(
        invitationId: string,
        nextStatus: "accepted" | "declined" | "cancelled"
    ) {
        const supabase = createClient();
        setErrorMessage(null);
        setStatusMessage(null);

        try {
            const { error } = await supabase.rpc("respond_to_friend_invitation", {
                friendship_id: invitationId,
                next_status: nextStatus,
            });

            if (error) throw error;

            setProfileStats((current) => ({
                ...current,
                sentInvitations: current.sentInvitations.filter(
                    (invitation) => invitation.id !== invitationId
                ),
                incomingInvitations: current.incomingInvitations.filter(
                    (invitation) => invitation.id !== invitationId
                ),
            }));
            setStatusMessage(
                nextStatus === "accepted"
                    ? "Friend added."
                    : nextStatus === "cancelled"
                      ? "Friend invite cancelled."
                      : "Friend invite declined."
            );
            if (nextStatus === "cancelled") {
                setFriendInviteCancelTarget(null);
            }
            router.refresh();
        } catch (error) {
            console.error("Could not update friend invite:", {
                ...getErrorDetails(error),
                invitationId,
                nextStatus,
            });
            setErrorMessage(
                error instanceof Error ? error.message : "Could not update friend invite."
            );
        }
    }

    function renderProfileView(requestClose: () => void) {
        const visibleBucketListItems = profileStats.bucketList.filter(
            (item) => item.status === bucketListTab
        );
        const bucketListCounts = {
            in_progress: profileStats.bucketList.filter(
                (item) => item.status === "in_progress"
            ).length,
            completed: profileStats.bucketList.filter(
                (item) => item.status === "completed"
            ).length,
        };

        return (
            <div className="bg-[#050712] text-white">
                <div className="relative overflow-hidden border-b border-white/10 p-6 sm:p-8">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(var(--vaivia-neon-rgb),0.22),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(217,70,239,0.18),transparent_34%)]" />
                    <div className="relative flex items-start justify-between gap-4">
                        <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end">
                            <span className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-[2rem] border border-lime-300/30 bg-slate-950 text-4xl font-black text-lime-200 shadow-[0_0_44px_rgba(var(--vaivia-neon-rgb),0.22)]">
                                {avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={avatarUrl}
                                        alt=""
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    getInitialFromName(displayName)
                                )}
                            </span>
                            <div className="min-w-0">
                                <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200">
                                    VAIVIA profile
                                </p>
                                <h2
                                    id="accountPreferencesTitle"
                                    className="mt-2 truncate text-4xl font-black tracking-tight text-white sm:text-5xl"
                                >
                                    {displayName}
                                </h2>
                                <p className="mt-2 text-sm font-semibold text-slate-300">
                                    {profileSubtitle}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="inline-flex rounded-full border border-lime-300/35 bg-lime-300/[0.12] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-lime-100 shadow-xl shadow-black/20">
                                        {userRoleLabel}
                                    </span>
                                    <span className="inline-flex rounded-full border border-fuchsia-300/30 bg-fuchsia-300/[0.12] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-fuchsia-100 shadow-xl shadow-black/20">
                                        {profileLevelLabel}
                                    </span>
                                    <span
                                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em] shadow-xl shadow-black/20 ${currentThemeBadgeClass}`}
                                    >
                                        {currentThemeLabel}
                                    </span>
                                </div>
                                <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                                    Joined {joinDateLabel}
                                </p>
                            </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-3">
                            <div className="rounded-[1.15rem] border border-lime-300/35 bg-lime-300 px-4 py-2 text-right text-slate-950 shadow-[0_0_34px_rgba(var(--vaivia-neon-rgb),0.24)]">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-950/65">
                                    Points
                                </p>
                                <p className="mt-0.5 text-xl font-black leading-none">
                                    {profilePointsLabel}
                                </p>
                                {nextLevelProgress ? (
                                    <p className="mt-1 max-w-32 text-[10px] font-black uppercase leading-tight tracking-[0.12em] text-lime-950/65">
                                        {nextLevelProgress.pointsRemaining.toLocaleString()}{" "}
                                        point
                                        {nextLevelProgress.pointsRemaining === 1
                                            ? ""
                                            : "s"}{" "}
                                        until Level {nextLevelProgress.level}
                                    </p>
                                ) : null}
                            </div>
                            {!isProfilePage ? (
                                <button
                                    type="button"
                                    onClick={requestClose}
                                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 transition hover:bg-white/[0.14]"
                                    aria-label="Close account profile"
                                >
                                    <X className="h-5 w-5" aria-hidden="true" />
                                </button>
                            ) : null}
                        </div>
                    </div>

                    <div className="relative mt-6 flex flex-wrap gap-3">
                        {isProfilePage ? (
                            <Link
                                href="/settings?section=profile"
                                className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:bg-lime-200"
                            >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                                Edit profile
                            </Link>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setMode("edit")}
                                className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:bg-lime-200"
                            >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                                Edit profile
                            </button>
                        )}
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleSignOut}
                            className="border-white/10 bg-white/[0.08] text-slate-100 hover:bg-white/[0.14] hover:text-white"
                        >
                            <LogOut className="h-4 w-4" aria-hidden="true" />
                            Sign out
                        </Button>
                    </div>
                </div>

                <div className="space-y-5 p-5 sm:p-6">
                    <section
                        id="passport-stamps"
                        className="scroll-mt-28 rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20"
                    >
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                    Friends
                                </p>
                                <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-slate-300">
                                    {
                                        FRIENDS_HEADER_PHRASES[
                                            friendsHeaderPhraseIndex
                                        ]
                                    }
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsFriendsModalOpen(true)}
                                className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-lime-200"
                            >
                                <Plus className="h-4 w-4" aria-hidden="true" />
                                Add friend
                            </button>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setIsFriendsModalOpen(true)}
                                className="group/member flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] py-1.5 pl-1.5 pr-3 text-left text-white shadow-xl shadow-black/10 transition hover:border-lime-300/30 hover:bg-white/[0.1]"
                            >
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-lime-300/30 bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.20)]">
                                    {profileStats.sentInvitations.length +
                                        profileStats.incomingInvitations.length >
                                    0
                                        ? profileStats.sentInvitations.length +
                                          profileStats.incomingInvitations.length
                                        : "+"}
                                </span>
                                <span className="text-sm font-black text-white">
                                    Invited
                                </span>
                            </button>

                            {profileStats.friends.length > 0 ? (
                                profileStats.friends.map((friend) => (
                                    <button
                                        key={friend.id}
                                        type="button"
                                        onClick={() => void handleSelectFriend(friend)}
                                        className="group/member flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] py-1.5 pl-1.5 pr-3 text-left text-white shadow-xl shadow-black/10 transition hover:border-lime-300/30 hover:bg-white/[0.1]"
                                    >
                                        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/15 bg-slate-950 text-xs font-black uppercase text-lime-200 shadow-[0_0_24px_rgba(0,0,0,0.26)]">
                                            {friend.avatarUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={friend.avatarUrl}
                                                    alt=""
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                getFriendInitials(friend)
                                            )}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block max-w-28 truncate text-sm font-black">
                                                {getFriendDisplayName(friend)}
                                            </span>
                                            {friend.username ? (
                                                <span className="block max-w-28 truncate text-xs font-semibold text-slate-400">
                                                    @{friend.username}
                                                </span>
                                            ) : null}
                                        </span>
                                    </button>
                                ))
                            ) : (
                                <p className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-semibold text-slate-300">
                                    Accepted friends will show here.
                                </p>
                            )}
                        </div>
                    </section>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20">
                            <Stamp className="h-5 w-5 text-lime-200" aria-hidden="true" />
                            <p className="mt-3 text-3xl font-black">
                                {passportStamps.length}
                            </p>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                                Passport stamps
                            </p>
                        </div>
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20">
                            <MapPinned className="h-5 w-5 text-lime-200" aria-hidden="true" />
                            <p className="mt-3 text-3xl font-black">
                                {profileStats.tripsPlanned}
                            </p>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                                Trips planned
                            </p>
                        </div>
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20">
                            <UsersRound className="h-5 w-5 text-lime-200" aria-hidden="true" />
                            <p className="mt-3 text-3xl font-black">
                                {profileStats.friendsCount}
                            </p>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                                Trip friends
                            </p>
                        </div>
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20">
                            <Globe2 className="h-5 w-5 text-lime-200" aria-hidden="true" />
                            <p className="mt-3 text-3xl font-black">
                                {passportCountryCount}
                            </p>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                                Countries visited
                            </p>
                        </div>
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20">
                            <MapPinned className="h-5 w-5 text-lime-200" aria-hidden="true" />
                            <p className="mt-3 text-3xl font-black">
                                {passportContinentCount}
                            </p>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                                Continents visited
                            </p>
                        </div>
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20">
                            <List className="h-5 w-5 text-lime-200" aria-hidden="true" />
                            <p className="mt-3 text-3xl font-black">
                                {bucketListCounts.in_progress}
                            </p>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                                Bucket list in progress
                            </p>
                        </div>
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20">
                            <ListChecks className="h-5 w-5 text-lime-200" aria-hidden="true" />
                            <p className="mt-3 text-3xl font-black">
                                {bucketListCounts.completed}
                            </p>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                                Bucket list completed
                            </p>
                        </div>
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20">
                            <Globe2 className="h-5 w-5 text-lime-200" aria-hidden="true" />
                            <p className="mt-3 flex items-center gap-2 text-3xl font-black">
                                <span aria-hidden="true">
                                    {mostVisitedPassportCountry?.flagEmoji || "—"}
                                </span>
                                <span>
                                    {mostVisitedPassportCountry
                                        ? `×${mostVisitedPassportCountry.count}`
                                        : "0"}
                                </span>
                            </p>
                            <p className="mt-1 truncate text-sm font-black text-white">
                                {mostVisitedPassportCountry?.countryName ||
                                    "No stamps yet"}
                            </p>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                                Country visited most
                            </p>
                        </div>
                    </div>

                    <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                    Passport stamps
                                </p>
                                <h3 className="mt-1 text-2xl font-black text-white">
                                    Countries visited
                                </h3>
                                <p className="mt-1 text-sm font-semibold text-slate-400">
                                    Past trips add stamps automatically. Future trips do not count yet.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                <div
                                    className="flex rounded-full border border-white/10 bg-slate-950/70 p-1"
                                    aria-label="Passport stamp order"
                                >
                                    {[
                                        ["country", "A-Z"],
                                        ["recent_first", "Recent first"],
                                        ["recent_last", "Recent last"],
                                    ].map(([value, label]) => (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() =>
                                                setPassportStampSortMode(
                                                    value as PassportStampSortMode
                                                )
                                            }
                                            aria-pressed={
                                                passportStampSortMode === value
                                            }
                                            className={`rounded-full px-3 py-2 text-xs font-black transition ${
                                                passportStampSortMode === value
                                                    ? "bg-lime-300 text-slate-950"
                                                    : "text-slate-300 hover:bg-white/[0.08] hover:text-white"
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setManualStampLanguageCode("");
                                        setPassportStampLanguageChoiceMode(null);
                                        setPassportStampLanguageChoiceCode("");
                                        setIsAddPassportStampOpen(true);
                                    }}
                                    className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                    Add stamp
                                </button>
                            </div>
                        </div>

                        {isLoadingProfileStats ? (
                            <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm font-semibold text-slate-300">
                                Loading your stamps...
                            </p>
                        ) : passportStamps.length > 0 ? (
                            <div className="mt-5 grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-3 lg:grid-cols-4">
                                {sortedPassportStamps.map((stamp, stampIndex) => (
                                    <PassportStampCard
                                        key={`${stamp.source}-${stamp.countryCode}-${stamp.id || stamp.sourceTripTitle || "auto"}-${stampIndex}`}
                                        countryName={stamp.countryName}
                                        countryCode={stamp.countryCode}
                                        flagEmoji={stamp.flagEmoji}
                                        flagSvgUrl={stamp.flagSvgUrl}
                                        firstVisitYear={stamp.firstVisitYear}
                                        welcomeLabel={stamp.welcomeLabel}
                                        airportCode={stamp.airportCode}
                                        airportCity={stamp.airportCity}
                                        portOfEntryLabel={stamp.portOfEntryName}
                                        size="sm"
                                        onClick={() => {
                                            setIsEditingPassportStamp(false);
                                            setSelectedPassportStamp(stamp);
                                        }}
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm font-semibold text-slate-300">
                                No passport stamps yet. Completed trips and manual stamps will show here.
                            </p>
                        )}
                    </section>

                    <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                    Travel bucket list
                                </p>
                                <h3 className="mt-1 text-2xl font-black text-white">
                                    Places to reach next
                                </h3>
                                <p className="mt-1 text-sm font-semibold text-slate-400">
                                    Add a city, region, or country. VAIVIA can check it off when your arrival transportation completes.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={beginAddBucketListItem}
                                className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Plus className="h-4 w-4" aria-hidden="true" />
                                Add place
                            </button>
                        </div>

                        <div className="mt-4 grid gap-2 rounded-full border border-white/10 bg-slate-950/60 p-1 sm:inline-grid sm:grid-cols-2">
                            {(["in_progress", "completed"] as const).map((tab) => (
                                <button
                                    key={tab}
                                    type="button"
                                    onClick={() => setBucketListTab(tab)}
                                    className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition ${
                                        bucketListTab === tab
                                            ? "bg-lime-300 text-slate-950"
                                            : "text-slate-400 hover:bg-white/[0.08] hover:text-white"
                                    }`}
                                >
                                    {tab === "in_progress" ? "In progress" : "Completed"}{" "}
                                    <span className="opacity-70">
                                        {bucketListCounts[tab]}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {isLoadingProfileStats ? (
                            <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm font-semibold text-slate-300">
                                Loading your bucket list...
                            </p>
                        ) : visibleBucketListItems.length > 0 ? (
                            <div className="mt-5 grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-3 lg:grid-cols-4">
                                {visibleBucketListItems.map((item) => {
                                    const display = getBucketListPlaceDisplay(item);
                                    const completedDate =
                                        formatBucketListCompletedDate(
                                            item.completedAt
                                        );
                                    const isCompleted = item.status === "completed";

                                    return (
                                        <div
                                            key={item.id}
                                            className={`group/bucket relative flex h-40 w-32 flex-col items-center justify-start gap-2 rounded-[1.25rem] border px-3 py-3 text-center shadow-xl shadow-black/20 transition hover:-translate-y-0.5 sm:h-44 sm:w-36 ${
                                                isCompleted
                                                    ? "border-yellow-300/45 bg-yellow-300/20 text-yellow-50 shadow-yellow-950/20"
                                                    : "border-white/10 bg-white/[0.06] text-white hover:border-lime-300/35 hover:bg-white/[0.1]"
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    beginEditBucketListItem(item)
                                                }
                                                className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950/70 text-3xl ring-1 ring-lime-300/25 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.16)] transition"
                                                aria-label={`Edit ${item.placeLabel}`}
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className="transition group-hover/bucket:opacity-20"
                                                >
                                                    {item.flagEmoji ||
                                                        getFlagEmoji(item.countryCode)}
                                                </span>
                                                <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/70 opacity-0 backdrop-blur-sm transition group-hover/bucket:opacity-100">
                                                    <Pencil
                                                        className="h-5 w-5 text-lime-200"
                                                        aria-hidden="true"
                                                    />
                                                </span>
                                            </button>
                                            <div className="min-w-0 leading-tight">
                                                <div className="line-clamp-2 text-sm font-black">
                                                    {display.primary}
                                                </div>
                                                {display.secondary ? (
                                                    <div className="mt-0.5 line-clamp-2 text-xs font-semibold text-slate-400">
                                                        {display.secondary}
                                                    </div>
                                                ) : null}
                                                {isCompleted && completedDate ? (
                                                    <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-yellow-100/80">
                                                        {completedDate}
                                                    </div>
                                                ) : null}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    requestCompleteBucketListItem(item)
                                                }
                                                className={`mt-auto inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
                                                    isCompleted
                                                        ? "border-yellow-200/40 bg-yellow-100/10 text-yellow-50 hover:bg-yellow-100/20"
                                                        : "border-lime-300/30 bg-lime-300/10 text-lime-100 hover:bg-lime-300 hover:text-slate-950"
                                                }`}
                                                aria-label={
                                                    isCompleted
                                                        ? `Move ${display.primary} back to in progress`
                                                        : `Mark ${display.primary} visited`
                                                }
                                                title={
                                                    isCompleted
                                                        ? "Move back to in progress"
                                                        : "Mark visited"
                                                }
                                            >
                                                <Check className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm font-semibold text-slate-300">
                                {bucketListTab === "completed"
                                    ? "No completed bucket list places yet."
                                    : "No bucket list places yet. Add a city, region, or country you want to visit."}
                            </p>
                        )}
                    </section>

                    <section className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4 shadow-xl shadow-black/20">
                        <div className="mb-4 flex items-center gap-2">
                            <Globe2 className="h-5 w-5 text-lime-200" aria-hidden="true" />
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                    Scratch map
                                </p>
                                <p className="text-sm font-semibold text-slate-400">
                                    Scratch off countries from your passport stamps without leaving your profile.
                                </p>
                            </div>
                        </div>
                        <div className="md:hidden">
                            <Link
                                href="/scratch-map"
                                className="flex min-h-24 items-center justify-between gap-4 rounded-[1.25rem] border border-lime-300/25 bg-lime-300/10 p-4 text-left text-lime-100 shadow-xl shadow-black/20 transition hover:bg-lime-300 hover:text-slate-950"
                                prefetch
                            >
                                <span>
                                    <span className="block text-sm font-black">
                                        Open full-screen scratch map
                                    </span>
                                    <span className="mt-1 block text-xs font-semibold opacity-75">
                                        Zoom, pan, and scratch countries with more room.
                                    </span>
                                </span>
                                <MapPinned className="h-6 w-6 shrink-0" aria-hidden="true" />
                            </Link>
                        </div>
                        <div className="hidden md:block">
                            <ScratchMap
                                userId={userId}
                                visitedCountryCodes={scratchMapCountryCodes}
                                visitedCountryYears={scratchMapCountryYears}
                                scratchedCountryCodes={manualScratchMapCountryCodes}
                                settingsHref="/profile"
                                onScratchMapChange={(countryCodes) => {
                                    setProfileStats((current) => ({
                                        ...current,
                                        scratchMapCountries: countryCodes.map(
                                            (countryCode) => ({
                                                id: countryCode,
                                                countryCode,
                                            })
                                        ),
                                    }));
                                }}
                            />
                        </div>
                    </section>

                    {errorMessage ? (
                        <p className="rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                            {errorMessage}
                        </p>
                    ) : null}
                </div>
            </div>
        );
    }

    function renderFriendProfileView(requestClose: () => void) {
        if (!selectedFriend) return null;

        const friendSnapshot = selectedFriendSnapshot;
        const friend = friendSnapshot?.friend || selectedFriend;
        const friendStamps = friendSnapshot?.stamps || [];
        const friendBucketList = friendSnapshot?.bucketList || [];
        const friendScratchMapCountries = friendSnapshot?.scratchMapCountries || [];
        const friendThemeMode = friend.themeMode || "dark";
        const friendCountriesVisited = getUniqueStampCountryCount(friendStamps);
        const friendContinentsVisited = new Set(
            friendStamps
                .map((stamp) => {
                    const country = countryOptions.find(
                        (option) => option.code === stamp.countryCode
                    );
                    return country?.region || "";
                })
                .filter(Boolean)
        ).size;
        const friendBucketListInProgress = friendBucketList.filter(
            (item) => item.status === "in_progress"
        );
        const friendBucketListCompleted = friendBucketList.filter(
            (item) => item.status === "completed"
        );
        const friendScratchMapCountryCodes = Array.from(
            new Set(
                friendStamps
                    .flatMap((stamp) => [stamp.countryCode, stamp.countryName])
                    .filter(Boolean) as string[]
            )
        );
        const friendScratchMapCountryYears = friendStamps.reduce<
            Record<string, number[]>
        >((yearsByCountry, stamp) => {
            const countryCode = stamp.countryCode?.trim().toUpperCase();
            const year =
                stamp.firstVisitYear || getYearFromDate(stamp.firstVisitedOn);

            if (!countryCode || !year) return yearsByCountry;

            yearsByCountry[countryCode] = Array.from(
                new Set([...(yearsByCountry[countryCode] || []), year])
            ).sort((yearA, yearB) => yearB - yearA);

            return yearsByCountry;
        }, {});
        const friendManualScratchCodes = friendScratchMapCountries.map(
            (country) => country.countryCode
        );
        const readOnlyBucketListCard = (item: TravelBucketListItem) => {
            const display = getBucketListPlaceDisplay(item);
            const completedDate = formatBucketListCompletedDate(item.completedAt);
            const isCompleted = item.status === "completed";

            return (
                <div
                    key={item.id}
                    className={`flex h-40 w-32 flex-col items-center justify-start gap-2 rounded-[1.25rem] border px-3 py-3 text-center shadow-xl shadow-black/20 sm:h-44 sm:w-36 ${
                        isCompleted
                            ? "border-yellow-300/45 bg-yellow-300/20 text-yellow-50 shadow-yellow-950/20"
                            : "border-white/10 bg-white/[0.06] text-white"
                    }`}
                >
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950/70 text-3xl ring-1 ring-lime-300/25 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.16)]">
                        {item.flagEmoji || getFlagEmoji(item.countryCode)}
                    </span>
                    <div className="min-w-0 leading-tight">
                        <div className="line-clamp-2 text-sm font-black">
                            {display.primary}
                        </div>
                        {display.secondary ? (
                            <div className="mt-0.5 line-clamp-2 text-xs font-semibold text-slate-400">
                                {display.secondary}
                            </div>
                        ) : null}
                        {isCompleted && completedDate ? (
                            <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-yellow-100/80">
                                {completedDate}
                            </div>
                        ) : null}
                    </div>
                </div>
            );
        };

        return (
            <div className="bg-[#050712] text-white">
                <div className="relative overflow-hidden border-b border-white/10 p-6 sm:p-8">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(var(--vaivia-neon-rgb),0.22),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(217,70,239,0.18),transparent_34%)]" />
                    <div className="relative flex items-start justify-between gap-4">
                        <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end">
                            <span className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-[2rem] border border-lime-300/30 bg-slate-950 text-4xl font-black text-lime-200 shadow-[0_0_44px_rgba(var(--vaivia-neon-rgb),0.22)]">
                                {friend.avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={friend.avatarUrl}
                                        alt=""
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    getFriendInitials(friend)
                                )}
                            </span>
                            <div className="min-w-0">
                                <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200">
                                    Friend profile
                                </p>
                                <h2
                                    id="friendProfileTitle"
                                    className="mt-2 truncate text-4xl font-black tracking-tight text-white"
                                >
                                    {getFriendDisplayName(friend)}
                                </h2>
                                <p className="mt-2 text-sm font-semibold text-slate-300">
                                    {friend.username
                                        ? `@${friend.username}`
                                        : "VAIVIA traveller"}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="inline-flex rounded-full border border-lime-300/35 bg-lime-300/[0.12] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-lime-100 shadow-xl shadow-black/20">
                                        {formatUserRoleLabel(friend.role)}
                                    </span>
                                    <span
                                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em] shadow-xl shadow-black/20 ${
                                            THEME_PROFILE_BADGE_CLASSES[
                                                friendThemeMode
                                            ]
                                        }`}
                                    >
                                        {THEME_PROFILE_LABELS[friendThemeMode]}
                                    </span>
                                    <span className="inline-flex rounded-full border border-lime-300/35 bg-lime-300/[0.12] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-lime-100 shadow-xl shadow-black/20">
                                        Level {friendSnapshot?.level || 1}
                                    </span>
                                </div>
                                <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                                    Joined {formatJoinDate(friend.joinedAt)}
                                </p>
                            </div>
                        </div>
                        <div className="relative flex shrink-0 items-center gap-2">
                            <button
                                type="button"
                                onClick={() =>
                                    setIsFriendOptionsOpen((current) => !current)
                                }
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 transition hover:bg-white/[0.14]"
                                aria-label="Friend options"
                                aria-haspopup="menu"
                                aria-expanded={isFriendOptionsOpen}
                            >
                                <MoreHorizontal
                                    className="h-5 w-5"
                                    aria-hidden="true"
                                />
                            </button>
                            {isFriendOptionsOpen ? (
                                <div
                                    role="menu"
                                    className="absolute right-14 top-0 z-30 min-w-44 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 p-1 text-sm font-black shadow-2xl shadow-black/50 backdrop-blur-xl"
                                >
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            setIsFriendOptionsOpen(false);
                                            void handleDeleteFriend(friend);
                                        }}
                                        className="block w-full rounded-xl px-3 py-2 text-left text-slate-100 transition hover:bg-white/[0.08]"
                                    >
                                        Delete friend
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            setIsFriendOptionsOpen(false);
                                            void handleBlockFriend(friend);
                                        }}
                                        className="block w-full rounded-xl px-3 py-2 text-left text-red-100 transition hover:bg-red-400/15"
                                    >
                                        Block friend
                                    </button>
                                </div>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => {
                                    setIsFriendOptionsOpen(false);
                                    requestClose();
                                }}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 transition hover:bg-white/[0.14]"
                                aria-label="Close friend profile"
                            >
                                <X className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="max-h-[70vh] space-y-5 overflow-y-auto p-6 sm:p-8">
                    {isLoadingFriendSnapshot ? (
                        <p className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm font-semibold text-slate-300">
                            Loading their profile...
                        </p>
                    ) : (
                        <>
                            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {[
                                    {
                                        label: "Points",
                                        value: friendSnapshot?.points || 0,
                                        detail:
                                            friendSnapshot?.levelName ||
                                            "Still Packing",
                                    },
                                    {
                                        label: "Passport stamps",
                                        value: friendStamps.length,
                                        detail: `${friendCountriesVisited} countries`,
                                    },
                                    {
                                        label: "Continents",
                                        value: friendContinentsVisited,
                                        detail: "visited",
                                    },
                                    {
                                        label: "Bucket list",
                                        value: friendBucketListInProgress.length,
                                        detail: "in progress",
                                    },
                                    {
                                        label: "Completed",
                                        value: friendBucketListCompleted.length,
                                        detail: "bucket list",
                                    },
                                ].map((stat) => (
                                    <div
                                        key={stat.label}
                                        className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4"
                                    >
                                        <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                            {stat.label}
                                        </p>
                                        <p className="mt-2 text-3xl font-black text-white">
                                            {stat.value}
                                        </p>
                                        <p className="mt-1 text-xs font-semibold text-slate-400">
                                            {stat.detail}
                                        </p>
                                    </div>
                                ))}
                            </section>

                            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20">
                                <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                    Passport stamps
                                </p>
                                {friendStamps.length > 0 ? (
                                    <div className="mt-5 grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-3">
                                        {friendStamps.map((stamp, stampIndex) => (
                                            <PassportStampCard
                                                key={`${stamp.countryCode}-${stamp.id || stampIndex}`}
                                                countryName={stamp.countryName}
                                                countryCode={stamp.countryCode}
                                                flagEmoji={stamp.flagEmoji}
                                                flagSvgUrl={stamp.flagSvgUrl}
                                                firstVisitYear={stamp.firstVisitYear}
                                                welcomeLabel={stamp.welcomeLabel}
                                                airportCode={stamp.airportCode}
                                                airportCity={stamp.airportCity}
                                                portOfEntryLabel={
                                                    stamp.portOfEntryName
                                                }
                                                size="sm"
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm font-semibold text-slate-300">
                                        No passport stamps yet.
                                    </p>
                                )}
                            </section>

                            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/20">
                                <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                    Travel bucket list
                                </p>
                                {friendBucketList.length > 0 ? (
                                    <div className="mt-5 space-y-5">
                                        <div>
                                            <h3 className="text-sm font-black text-white">
                                                In progress
                                            </h3>
                                            {friendBucketListInProgress.length > 0 ? (
                                                <div className="mt-3 grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-3">
                                                    {friendBucketListInProgress.map(
                                                        readOnlyBucketListCard
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="mt-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm font-semibold text-slate-300">
                                                    No in-progress bucket list places.
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-white">
                                                Completed
                                            </h3>
                                            {friendBucketListCompleted.length > 0 ? (
                                                <div className="mt-3 grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-3">
                                                    {friendBucketListCompleted.map(
                                                        readOnlyBucketListCard
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="mt-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm font-semibold text-slate-300">
                                                    No completed bucket list places.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm font-semibold text-slate-300">
                                        No bucket list places yet.
                                    </p>
                                )}
                            </section>

                            <section className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4 shadow-xl shadow-black/20">
                                <div className="mb-4 flex items-center gap-2">
                                    <Globe2
                                        className="h-5 w-5 text-lime-200"
                                        aria-hidden="true"
                                    />
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                            Scratch map
                                        </p>
                                        <p className="text-sm font-semibold text-slate-400">
                                            Their visited and scratched-off countries.
                                        </p>
                                    </div>
                                </div>
                                <div className="md:hidden">
                                    <Link
                                        href={`/scratch-map/friends/${friend.id}`}
                                        className="flex min-h-24 items-center justify-between gap-4 rounded-[1.25rem] border border-lime-300/25 bg-lime-300/10 p-4 text-left text-lime-100 shadow-xl shadow-black/20 transition hover:bg-lime-300 hover:text-slate-950"
                                        prefetch
                                    >
                                        <span>
                                            <span className="block text-sm font-black">
                                                Open full-screen scratch map
                                            </span>
                                            <span className="mt-1 block text-xs font-semibold opacity-75">
                                                Use the dedicated map page for more room.
                                            </span>
                                        </span>
                                        <MapPinned
                                            className="h-6 w-6 shrink-0"
                                            aria-hidden="true"
                                        />
                                    </Link>
                                </div>
                                <div className="hidden md:block">
                                    <ScratchMap
                                        visitedCountryCodes={
                                            friendScratchMapCountryCodes
                                        }
                                        visitedCountryYears={
                                            friendScratchMapCountryYears
                                        }
                                        scratchedCountryCodes={
                                            friendManualScratchCodes
                                        }
                                        readOnly
                                    />
                                </div>
                            </section>
                        </>
                    )}
                </div>
            </div>
        );
    }

    return (
        <>
            {variant === "profile-page" ? (
                <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#050712] shadow-2xl shadow-black/40">
                    {renderProfileView(() => router.push("/"))}
                </div>
            ) : variant === "mobile-profile" ? (
                <Link
                    href="/profile"
                    className="group/account flex min-w-0 justify-center text-center text-[8px] font-black uppercase leading-[0.88] tracking-[0.02em] text-slate-200 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-lime-300/50"
                    aria-label="My account"
                    prefetch
                >
                    <span className="flex h-16 w-16 flex-col items-center justify-center gap-1 overflow-hidden rounded-full border border-white/10 bg-[#1f2937] px-1.5 text-slate-100 shadow-2xl shadow-black/35 backdrop-blur-xl transition group-hover/account:border-lime-300/55 group-hover/account:bg-lime-300 group-hover/account:text-slate-950">
                        {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={avatarUrl}
                                alt=""
                                className="h-7 w-7 shrink-0 rounded-full object-cover"
                            />
                        ) : (
                            <UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />
                        )}
                        <span className="line-clamp-2 max-w-full break-words text-center">
                            Account
                        </span>
                    </span>
                </Link>
            ) : variant === "sidebar-settings" ? (
                <Link
                    href="/settings"
                    className="group/item flex h-12 min-h-12 w-12 min-w-12 max-w-12 items-center justify-center gap-0 overflow-hidden rounded-[18px] border border-transparent p-0 text-slate-400 transition-all duration-300 ease-out hover:border-white/10 hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-lime-300/50 group-hover/sidebar:w-full group-hover/sidebar:max-w-full group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:px-3 group-hover/sidebar:py-2 group-focus-within/sidebar:w-full group-focus-within/sidebar:max-w-full group-focus-within/sidebar:justify-start group-focus-within/sidebar:gap-3 group-focus-within/sidebar:px-3 group-focus-within/sidebar:py-2"
                    aria-label="Settings"
                >
                    <Settings className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="pointer-events-none w-0 max-w-0 translate-x-2 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all duration-300 group-hover/sidebar:pointer-events-auto group-hover/sidebar:w-40 group-hover/sidebar:max-w-40 group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100 group-focus-within/sidebar:pointer-events-auto group-focus-within/sidebar:w-40 group-focus-within/sidebar:max-w-40 group-focus-within/sidebar:translate-x-0 group-focus-within/sidebar:opacity-100">
                        Settings
                    </span>
                </Link>
            ) : variant === "sidebar-profile" ? (
                <Link
                    href="/profile"
                    className="flex h-12 min-h-12 w-12 min-w-12 max-w-12 items-center justify-center gap-0 overflow-hidden rounded-[18px] border border-lime-300/25 bg-white/[0.04] p-0 text-left shadow-[0_0_20px_rgba(var(--vaivia-neon-rgb),0.12)] transition-all duration-300 ease-out hover:border-lime-300/45 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-lime-300/50 group-hover/sidebar:w-full group-hover/sidebar:max-w-full group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:p-2 group-focus-within/sidebar:w-full group-focus-within/sidebar:max-w-full group-focus-within/sidebar:justify-start group-focus-within/sidebar:gap-3 group-focus-within/sidebar:p-2"
                    aria-label="My account"
                    prefetch
                >
                    {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={avatarUrl}
                            alt=""
                            className="h-9 w-9 shrink-0 rounded-full border-2 border-lime-300/80 object-cover shadow-[0_0_20px_rgba(var(--vaivia-neon-rgb),0.30)]"
                        />
                    ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-lime-300/70 bg-lime-400/10 text-lime-200 shadow-[0_0_20px_rgba(var(--vaivia-neon-rgb),0.22)]">
                            <UserRound className="h-5 w-5" aria-hidden="true" />
                        </span>
                    )}
                    <span className="pointer-events-none flex w-0 max-w-0 translate-x-2 items-center gap-2 overflow-hidden opacity-0 transition-all duration-300 group-hover/sidebar:pointer-events-none group-hover/sidebar:w-52 group-hover/sidebar:max-w-52 group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100 group-focus-within/sidebar:pointer-events-none group-focus-within/sidebar:w-52 group-focus-within/sidebar:max-w-52 group-focus-within/sidebar:translate-x-0 group-focus-within/sidebar:opacity-100">
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-white">
                                {displayName}
                            </span>
                            <span className="block truncate text-xs text-slate-400">
                                {username ? `@${username}` : emailAddress}
                            </span>
                        </span>
                        <span className="shrink-0 rounded-full border border-lime-300/35 bg-lime-300/[0.12] px-2.5 py-1 text-[10px] font-black uppercase leading-none tracking-[0.08em] text-lime-200 shadow-[0_0_18px_rgba(var(--vaivia-neon-rgb),0.12)]">
                            {userRoleLabel}
                        </span>
                    </span>
                </Link>
            ) : (
                <Link
                    href="/profile"
                    className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
                    prefetch
                >
                    {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={avatarUrl}
                            alt=""
                            className="h-7 w-7 rounded-full border border-slate-200 object-cover"
                        />
                    ) : (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-100">
                            <UserRound className="h-4 w-4" aria-hidden="true" />
                        </span>
                    )}
                    My account
                </Link>
            )}

            {isOpen ? (
                <Portal>
                <AnimatedModal
                    onClose={() => setIsOpen(false)}
                    className="z-[100] items-start overflow-y-auto bg-slate-950/40 py-8"
                    panelClassName={
                        mode === "profile"
                            ? "max-w-5xl overflow-hidden rounded-[2rem] border-white/10 bg-[#050712] text-white shadow-2xl shadow-black/50"
                            : "max-w-3xl overflow-hidden rounded-md border-slate-200 bg-white text-slate-950 shadow-xl"
                    }
                    labelledBy="accountPreferencesTitle"
                >
                    {({ requestClose }) =>
                        mode === "profile" ? renderProfileView(requestClose) : (
                        <>
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    VAIVIA
                                </p>
                                <h2
                                    id="accountPreferencesTitle"
                                    className="mt-1 text-2xl font-semibold text-slate-950"
                                >
                                    My account
                                </h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    {displayName}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={requestClose}
                                className="rounded-md border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
                                aria-label="Close account preferences"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="space-y-6 p-5">
                            <button
                                type="button"
                                onClick={() => setMode("profile")}
                                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                                Back to profile
                            </button>
                            <section className="grid gap-4 md:grid-cols-[180px_1fr]">
                                <div>
                                    <h3 className="font-semibold text-slate-950">
                                        Profile
                                    </h3>
                                    <p className="mt-1 text-sm text-slate-500">
                                        Your public-facing account details.
                                    </p>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <Label htmlFor="avatarFile">
                                            Profile picture
                                        </Label>
                                        <div className="mt-2 flex items-center gap-3">
                                            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-slate-500">
                                                {avatarUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={avatarUrl}
                                                        alt=""
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : (
                                                    <Camera
                                                        className="h-5 w-5"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                            </span>
                                            <Input
                                                id="avatarFile"
                                                type="file"
                                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                                onChange={(event) => {
                                                    const file =
                                                        event.target.files?.[0] || null;
                                                    setAvatarFile(file);
                                                    if (file) {
                                                        setAvatarUrl(
                                                            URL.createObjectURL(file)
                                                        );
                                                    }
                                                }}
                                            />
                                        </div>
                                        <Label
                                            htmlFor="avatarUrl"
                                            className="mt-4 block text-xs text-slate-500"
                                        >
                                            Or paste image URL
                                        </Label>
                                        <Input
                                            id="avatarUrl"
                                            className="mt-2"
                                            value={avatarFile ? "" : avatarUrl}
                                            onChange={(event) => {
                                                setAvatarFile(null);
                                                setAvatarUrl(event.target.value);
                                            }}
                                            placeholder="https://..."
                                            autoComplete="off"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="firstName">First name</Label>
                                        <Input
                                            id="firstName"
                                            className="mt-2"
                                            value={firstName}
                                            onChange={(event) =>
                                                setFirstName(event.target.value)
                                            }
                                            autoComplete="given-name"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="lastName">Last name</Label>
                                        <Input
                                            id="lastName"
                                            className="mt-2"
                                            value={lastName}
                                            onChange={(event) =>
                                                setLastName(event.target.value)
                                            }
                                            autoComplete="family-name"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="emailAddress">Email</Label>
                                        <Input
                                            id="emailAddress"
                                            className="mt-2"
                                            type="email"
                                            value={emailAddress}
                                            onChange={(event) =>
                                                setEmailAddress(event.target.value)
                                            }
                                            autoComplete="email"
                                        />
                                    </div>
                                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                                        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            Username
                                        </span>
                                        <span className="mt-1 block font-semibold text-slate-900">
                                            {username ? `@${username}` : "Not set"}
                                        </span>
                                    </div>
                                    <div className="sm:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                                        Joined{" "}
                                        {formatJoinDate(
                                            profile?.join_date ||
                                                profile?.created_at ||
                                                joinedAt
                                        )}
                                    </div>
                                </div>
                            </section>

                            {errorMessage ? (
                                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                                    {errorMessage}
                                </p>
                            ) : null}
                            {statusMessage ? (
                                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                                    {statusMessage}
                                </p>
                            ) : null}

                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleSignOut}
                                    className="text-slate-700"
                                >
                                    <LogOut className="h-4 w-4" aria-hidden="true" />
                                    Sign out
                                </Button>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={requestClose}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={isSaving}>
                                        {isSaving ? "Saving..." : "Save"}
                                    </Button>
                                </div>
                            </div>
                        </form>
                        </>
                    )}
                </AnimatedModal>
                </Portal>
            ) : null}
            {isFriendsModalOpen ? (
                <Portal>
                    <AnimatedModal
                        onClose={() => setIsFriendsModalOpen(false)}
                        panelClassName="max-w-2xl overflow-hidden rounded-[2rem] border-white/10 bg-[#050712] text-white shadow-2xl shadow-black/50"
                        labelledBy="friendsModalTitle"
                    >
                        {({ requestClose }) => (
                            <div className="bg-[#050712] text-white">
                                <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6">
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200">
                                            Friends
                                        </p>
                                        <h2
                                            id="friendsModalTitle"
                                            className="mt-2 text-3xl font-black"
                                        >
                                            Add and manage friends
                                        </h2>
                                        <p className="mt-2 text-sm font-semibold text-slate-400">
                                            Pending invites only show exactly what you typed.
                                            Profile details appear after they accept.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={requestClose}
                                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 transition hover:bg-white/[0.14]"
                                        aria-label="Close friends"
                                    >
                                        <X className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                </div>

                                <div className="space-y-5 p-6">
                                    <form
                                        onSubmit={handleSendFriendInvite}
                                        className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4"
                                    >
                                        <Label
                                            htmlFor="friendInviteIdentifier"
                                            className="text-xs font-black uppercase tracking-[0.18em] text-lime-200"
                                        >
                                            Email or username
                                        </Label>
                                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                            <input
                                                id="friendInviteIdentifier"
                                                value={friendInviteIdentifier}
                                                onChange={(event) =>
                                                    setFriendInviteIdentifier(
                                                        event.target.value
                                                    )
                                                }
                                                placeholder="name@example.com or username"
                                                className="min-h-11 flex-1 rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                                autoComplete="off"
                                            />
                                            <button
                                                type="submit"
                                                disabled={
                                                    !friendInviteIdentifier.trim() ||
                                                    isSavingFriendInvite
                                                }
                                                className="rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {isSavingFriendInvite
                                                    ? "Sending..."
                                                    : "Send invite"}
                                            </button>
                                        </div>
                                    </form>

                                    <div className="grid gap-4 lg:grid-cols-2">
                                        <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4">
                                            <h3 className="text-sm font-black text-white">
                                                Invites you sent
                                            </h3>
                                            <div className="mt-3 space-y-2">
                                                {profileStats.sentInvitations.length > 0 ? (
                                                    profileStats.sentInvitations.map(
                                                        (invitation) => (
                                                            <div
                                                                key={invitation.id}
                                                                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3"
                                                            >
                                                                <span className="flex min-w-0 items-center gap-3">
                                                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-white/15 bg-white/[0.08] text-sm font-black uppercase text-lime-200 shadow-[0_0_20px_rgba(0,0,0,0.2)]">
                                                                        {invitation.identifier
                                                                            .trim()[0]
                                                                            ?.toUpperCase() ||
                                                                            "?"}
                                                                    </span>
                                                                    <span className="min-w-0 truncate text-sm font-bold text-slate-100">
                                                                        {
                                                                            invitation.identifier
                                                                        }
                                                                    </span>
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setFriendInviteCancelTarget(
                                                                            invitation
                                                                        )
                                                                    }
                                                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-300/30 text-red-100 transition hover:bg-red-400/10 focus:outline-none focus:ring-2 focus:ring-red-200/40"
                                                                    aria-label={`Cancel friend invite to ${invitation.identifier}`}
                                                                >
                                                                    <X
                                                                        className="h-4 w-4"
                                                                        aria-hidden="true"
                                                                    />
                                                                </button>
                                                            </div>
                                                        )
                                                    )
                                                ) : (
                                                    <p className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-sm font-semibold text-slate-400">
                                                        No pending invites sent.
                                                    </p>
                                                )}
                                            </div>
                                        </section>

                                        <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4">
                                            <h3 className="text-sm font-black text-white">
                                                Invites to you
                                            </h3>
                                            <div className="mt-3 space-y-2">
                                                {profileStats.incomingInvitations.length >
                                                0 ? (
                                                    profileStats.incomingInvitations.map(
                                                        (invitation) => (
                                                            <div
                                                                key={invitation.id}
                                                                className="rounded-2xl border border-white/10 bg-slate-950/60 p-3"
                                                            >
                                                                <p className="text-sm font-bold text-slate-100">
                                                                    Friend request for{" "}
                                                                    {invitation.identifier}
                                                                </p>
                                                                <div className="mt-3 flex flex-wrap gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            handleFriendInvitationStatus(
                                                                                invitation.id,
                                                                                "accepted"
                                                                            )
                                                                        }
                                                                        className="rounded-full bg-lime-300 px-3 py-1.5 text-xs font-black text-slate-950 transition hover:bg-lime-200"
                                                                    >
                                                                        Accept
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            handleFriendInvitationStatus(
                                                                                invitation.id,
                                                                                "declined"
                                                                            )
                                                                        }
                                                                        className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-black text-slate-200 transition hover:bg-white/[0.08]"
                                                                    >
                                                                        Decline
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )
                                                    )
                                                ) : (
                                                    <p className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-sm font-semibold text-slate-400">
                                                        No pending invites to accept.
                                                    </p>
                                                )}
                                            </div>
                                        </section>
                                    </div>

                                    {errorMessage ? (
                                        <p className="rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                                            {errorMessage}
                                        </p>
                                    ) : null}
                                    {statusMessage ? (
                                        <p className="rounded-2xl border border-lime-300/30 bg-lime-300/10 px-4 py-3 text-sm font-bold text-lime-100">
                                            {statusMessage}
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                        )}
                    </AnimatedModal>
                </Portal>
            ) : null}
            {friendInviteCancelTarget ? (
                <Portal>
                    <AnimatedModal
                        onClose={() => setFriendInviteCancelTarget(null)}
                        className="z-[120] items-center bg-slate-950/60"
                        panelClassName="max-w-md overflow-hidden rounded-[2rem] border-white/10 bg-[#050712] text-white shadow-2xl shadow-black/60"
                        labelledBy="cancelFriendInviteTitle"
                    >
                        {() => (
                            <div className="space-y-5 p-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white/15 bg-white/[0.08] text-sm font-black uppercase text-lime-200 shadow-[0_0_20px_rgba(0,0,0,0.25)]">
                                            {friendInviteCancelTarget.identifier
                                                .trim()[0]
                                                ?.toUpperCase() || "?"}
                                        </span>
                                        <div>
                                            <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                                Pending friend invite
                                            </p>
                                            <h2
                                                id="cancelFriendInviteTitle"
                                                className="mt-1 text-2xl font-black"
                                            >
                                                Cancel this invite?
                                            </h2>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setFriendInviteCancelTarget(null)}
                                        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-slate-200 transition hover:bg-white/[0.1]"
                                        aria-label="Close cancel friend invite modal"
                                    >
                                        <X className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                </div>

                                <p className="text-sm font-semibold leading-6 text-slate-300">
                                    This will rescind the friend invite to{" "}
                                    <span className="font-black text-white">
                                        {friendInviteCancelTarget.identifier}
                                    </span>
                                    . They will not be able to accept it unless you send a
                                    new invite.
                                </p>

                                <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setFriendInviteCancelTarget(null)}
                                        className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-slate-200 transition hover:bg-white/[0.08]"
                                    >
                                        Keep invite
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleFriendInvitationStatus(
                                                friendInviteCancelTarget.id,
                                                "cancelled"
                                            )
                                        }
                                        className="rounded-full bg-red-600 px-4 py-2 text-sm font-black text-white transition hover:bg-red-500"
                                    >
                                        Cancel invite
                                    </button>
                                </div>
                            </div>
                        )}
                    </AnimatedModal>
                </Portal>
            ) : null}
            {selectedFriend ? (
                <Portal>
                    <AnimatedModal
                        onClose={() => {
                            setSelectedFriend(null);
                            setSelectedFriendSnapshot(null);
                            setIsFriendOptionsOpen(false);
                        }}
                        panelClassName="max-w-5xl overflow-hidden rounded-[2rem] border-white/10 bg-[#050712] text-white shadow-2xl shadow-black/50"
                        labelledBy="friendProfileTitle"
                    >
                        {({ requestClose }) => renderFriendProfileView(requestClose)}
                    </AnimatedModal>
                </Portal>
            ) : null}
            {isAddPassportStampOpen ? (
                <Portal>
                    <AnimatedModal
                        onClose={() => setIsAddPassportStampOpen(false)}
                        className="z-[110] items-center bg-slate-950/60"
                        panelClassName="max-w-2xl overflow-visible rounded-[2rem] border-white/10 bg-[#050712] text-white shadow-2xl shadow-black/60"
                        labelledBy="addPassportStampTitle"
                    >
                        {({ requestClose }) => (
                            <div className="space-y-5 p-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                            Passport stamps
                                        </p>
                                        <h2
                                            id="addPassportStampTitle"
                                            className="mt-2 text-3xl font-black"
                                        >
                                            Add passport stamp
                                        </h2>
                                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
                                            Add a stamp for a specific trip or visit. You can add the same country more than once.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={requestClose}
                                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 transition hover:bg-white/[0.14]"
                                        aria-label="Close add passport stamp"
                                    >
                                        <X className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <Label className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                            Port of entry
                                        </Label>
                                        <PlaceAutocompleteInput
                                            value={airportSearchValue}
                                            onInputChange={(value) => {
                                                setAirportSearchValue(value);
                                                resetSelectedAirport();
                                            }}
                                            onPlaceSelect={handleAirportPlaceSelect}
                                            placeholder="Airport, train station, ship port, border crossing..."
                                            className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                        />
                                        <p className="mt-1 text-xs font-semibold text-slate-500">
                                            VAIVIA uses this to snapshot the entry point and infer the country, region, and city when Google provides them.
                                        </p>
                                    </div>

                                    <div className="sm:col-span-2">
                                        <Label className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                            Where did you go?
                                        </Label>
                                        <PlaceAutocompleteInput
                                            value={countrySearchQuery}
                                            onInputChange={(value) => {
                                                setCountrySearchQuery(value);
                                                setSelectedStampCountryCode("");
                                                setSelectedGoogleCountry(null);
                                                setManualStampCity("");
                                                setManualStampRegion("");
                                            }}
                                            onPlaceSelect={handleCountryPlaceSelect}
                                            placeholder="City, region, or country..."
                                            className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                        />
                                        <p className="mt-1 text-xs font-semibold text-slate-500">
                                            Auto-filled from your port of entry. Override it if your actual destination was somewhere else.
                                        </p>
                                    </div>
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                            Year visited
                                        </span>
                                        <input
                                            value={manualStampYear}
                                            onChange={(event) => {
                                                setErrorMessage(null);
                                                setManualStampYear(
                                                    event.target.value
                                                        .replace(/\D/g, "")
                                                        .slice(0, 4)
                                                );
                                            }}
                                            placeholder="Year"
                                            inputMode="numeric"
                                            className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                            Month visited
                                        </span>
                                        <select
                                            value={manualStampMonth}
                                            onChange={(event) => {
                                                setErrorMessage(null);
                                                setManualStampMonth(event.target.value);
                                            }}
                                            disabled={manualStampMonthOptions.length === 0}
                                            className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition focus:border-lime-300/50"
                                        >
                                            <option value="">No month</option>
                                            {manualStampMonthOptions.map((month) => (
                                                <option
                                                    key={month.value}
                                                    value={month.value}
                                                >
                                                    {month.label}
                                                </option>
                                            ))}
                                        </select>
                                        {manualStampMonthOptions.length === 0 ? (
                                            <p className="mt-1 text-xs font-semibold text-red-200">
                                                Change the year to this year or earlier to choose a month.
                                            </p>
                                        ) : null}
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                            Status
                                        </span>
                                        <select
                                            value={manualStampStatus}
                                            onChange={(event) =>
                                                setManualStampStatus(
                                                    event.target.value === "lived"
                                                        ? "lived"
                                                        : "visited"
                                                )
                                            }
                                            className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition focus:border-lime-300/50"
                                        >
                                            <option value="visited">Visited</option>
                                            <option value="lived">Lived</option>
                                        </select>
                                    </label>
                                </div>

                                {selectedStampCountry ? (
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-xs font-semibold text-slate-300">
                                        <p>
                                            Selected {selectedStampCountry.flag}{" "}
                                            {selectedStampCountry.name} (
                                            {selectedStampCountry.code}
                                            {selectedStampCountry.alpha3
                                                ? ` / ${selectedStampCountry.alpha3}`
                                                : ""}
                                            )
                                        </p>
                                    </div>
                                ) : null}

                                <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 sm:col-span-2">
                                    <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                        Travelled with a friend
                                    </p>
                                    {profileStats.friends.length > 0 ? (
                                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                            {profileStats.friends.map((friend) => {
                                                const selected =
                                                    passportStampFriendIds.includes(
                                                        friend.id
                                                    );
                                                return (
                                                    <button
                                                        key={friend.id}
                                                        type="button"
                                                        onClick={() =>
                                                            togglePassportStampFriend(
                                                                friend.id
                                                            )
                                                        }
                                                        className={`flex min-h-12 items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${
                                                            selected
                                                                ? "border-lime-300/45 bg-lime-300 text-slate-950"
                                                                : "border-white/10 bg-slate-950/70 text-white hover:border-lime-300/35 hover:bg-white/[0.08]"
                                                        }`}
                                                    >
                                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-950 text-xs font-black uppercase text-lime-200">
                                                            {friend.avatarUrl ? (
                                                                <img
                                                                    src={friend.avatarUrl}
                                                                    alt=""
                                                                    className="h-full w-full object-cover"
                                                                />
                                                            ) : (
                                                                getFriendInitials(friend)
                                                            )}
                                                        </span>
                                                        <span className="min-w-0 text-sm font-black">
                                                            {getFriendDisplayName(friend)}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="mt-3 rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-sm font-semibold text-slate-400">
                                            Add friends first, then you can send them
                                            passport stamps to accept or decline.
                                        </p>
                                    )}
                                </div>

                                {errorMessage ? (
                                    <p className="rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100 sm:col-span-2">
                                        {errorMessage}
                                    </p>
                                ) : null}

                                <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={requestClose}
                                        className="border-white/10 bg-white/[0.08] text-slate-100 hover:bg-white/[0.14] hover:text-white"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={requestAddPassportStamp}
                                        disabled={
                                            !selectedStampCountryCode ||
                                            !manualStampYear ||
                                            Boolean(
                                                getStampDateError(
                                                    manualStampYear,
                                                    manualStampMonth
                                                )
                                            ) ||
                                            isSavingStamp
                                        }
                                        className="bg-lime-300 text-slate-950 hover:bg-lime-200"
                                    >
                                        {isSavingStamp ? "Saving..." : "Add stamp"}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </AnimatedModal>
                </Portal>
            ) : null}
            {passportStampLanguageChoiceMode ? (
                <Portal>
                    <AnimatedModal
                        onClose={() => {
                            setPassportStampLanguageChoiceMode(null);
                            setPassportStampLanguageChoiceCode("");
                        }}
                        className="z-[125] items-center bg-slate-950/70"
                        panelClassName="max-w-xl rounded-[2rem] border-white/10 bg-[#050712] text-white shadow-2xl shadow-black/60"
                        labelledBy="passportStampLanguageTitle"
                    >
                        {({ requestClose }) => (
                            <div className="space-y-5 p-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                            Passport stamp
                                        </p>
                                        <h2
                                            id="passportStampLanguageTitle"
                                            className="mt-2 text-3xl font-black"
                                        >
                                            Choose stamp language
                                        </h2>
                                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
                                            This country has more than one official or
                                            commonly used language. Pick the welcome
                                            label for this badge.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={requestClose}
                                        className="rounded-full border border-white/10 bg-white/[0.06] p-2 text-slate-300 transition hover:bg-white/[0.12] hover:text-white"
                                        aria-label="Close language picker"
                                    >
                                        <X className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2">
                                    {languageChoiceOptions.map((language) => {
                                        const selected =
                                            passportStampLanguageChoiceCode ===
                                            language.code;
                                        return (
                                            <button
                                                key={language.code}
                                                type="button"
                                                onClick={() =>
                                                    setPassportStampLanguageChoiceCode(
                                                        language.code
                                                    )
                                                }
                                                className={`rounded-2xl border px-4 py-3 text-left transition ${
                                                    selected
                                                        ? "border-lime-300/45 bg-lime-300 text-slate-950"
                                                        : "border-white/10 bg-slate-950/70 text-white hover:border-lime-300/35 hover:bg-white/[0.08]"
                                                }`}
                                            >
                                                <span className="block text-sm font-black">
                                                    {language.name}
                                                </span>
                                                <span
                                                    className={`mt-1 block text-xs font-bold ${
                                                        selected
                                                            ? "text-slate-950/70"
                                                            : "text-slate-400"
                                                    }`}
                                                >
                                                    ({language.welcomeLabel})
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {errorMessage ? (
                                    <p className="rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                                        {errorMessage}
                                    </p>
                                ) : null}

                                <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={requestClose}
                                        className="border-white/10 bg-white/[0.08] text-slate-100 hover:bg-white/[0.14] hover:text-white"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="button"
                                        disabled={
                                            !passportStampLanguageChoiceCode ||
                                            isSavingStamp
                                        }
                                        onClick={() => {
                                            const selectedCode =
                                                passportStampLanguageChoiceCode;
                                            if (
                                                passportStampLanguageChoiceMode ===
                                                "edit"
                                            ) {
                                                setEditStampLanguageCode(selectedCode);
                                                setPassportStampLanguageChoiceMode(null);
                                                setPassportStampLanguageChoiceCode("");
                                                if (selectedPassportStamp) {
                                                    void handleUpdatePassportStamp(
                                                        selectedPassportStamp,
                                                        selectedCode
                                                    );
                                                }
                                                return;
                                            }

                                            setManualStampLanguageCode(selectedCode);
                                            setPassportStampLanguageChoiceMode(null);
                                            setPassportStampLanguageChoiceCode("");
                                            void handleAddPassportStamp(selectedCode);
                                        }}
                                        className="bg-lime-300 text-slate-950 hover:bg-lime-200"
                                    >
                                        {isSavingStamp ? "Saving..." : "Use language"}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </AnimatedModal>
                </Portal>
            ) : null}
            {bucketListCompletionItem ? (
                <Portal>
                    <AnimatedModal
                        onClose={() => {
                            resetBucketListCompletionForm();
                            setErrorMessage(null);
                        }}
                        className="z-[120] items-center bg-slate-950/70"
                        panelClassName="max-w-xl rounded-[2rem] border-white/10 bg-[#050712] text-white shadow-2xl shadow-black/60"
                        labelledBy="bucketListCompletionTitle"
                    >
                        {({ requestClose }) => {
                            const display = getBucketListPlaceDisplay(
                                bucketListCompletionItem
                            );
                            const showLanguagePicker =
                                bucketListCompletionLanguageOptions.length > 1;
                            const dateError = getStampDateError(
                                bucketListCompletionYear,
                                bucketListCompletionMonth
                            );
                            const canSave =
                                !dateError &&
                                Boolean(bucketListCompletionYear.trim()) &&
                                (!showLanguagePicker ||
                                    Boolean(bucketListCompletionLanguageCode)) &&
                                !isSavingBucketListCompletion;

                            return (
                                <div className="space-y-5 p-6">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                                Travel bucket list
                                            </p>
                                            <h2
                                                id="bucketListCompletionTitle"
                                                className="mt-2 text-3xl font-black"
                                            >
                                                Mark as visited
                                            </h2>
                                            <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
                                                Add the visit details and VAIVIA will
                                                create a passport stamp for this place.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                requestClose();
                                                resetBucketListCompletionForm();
                                                setErrorMessage(null);
                                            }}
                                            className="rounded-full border border-white/10 bg-white/[0.06] p-2 text-slate-300 transition hover:bg-white/[0.12] hover:text-white"
                                            aria-label="Close bucket list completion"
                                        >
                                            <X className="h-5 w-5" aria-hidden="true" />
                                        </button>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950/70 text-3xl ring-1 ring-lime-300/25">
                                                {bucketListCompletionItem.flagEmoji ||
                                                    getFlagEmoji(
                                                        bucketListCompletionItem.countryCode
                                                    )}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="font-black text-white">
                                                    {display.primary}
                                                </p>
                                                {display.secondary ? (
                                                    <p className="text-xs font-semibold text-slate-400">
                                                        {display.secondary}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>

                                    {showLanguagePicker ? (
                                        <div>
                                            <Label className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                Stamp language
                                            </Label>
                                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                                {bucketListCompletionLanguageOptions.map(
                                                    (language) => {
                                                        const selected =
                                                            bucketListCompletionLanguageCode ===
                                                            language.code;
                                                        return (
                                                            <button
                                                                key={language.code}
                                                                type="button"
                                                                onClick={() =>
                                                                    setBucketListCompletionLanguageCode(
                                                                        language.code
                                                                    )
                                                                }
                                                                className={`rounded-2xl border px-4 py-3 text-left transition ${
                                                                    selected
                                                                        ? "border-lime-300/45 bg-lime-300 text-slate-950"
                                                                        : "border-white/10 bg-slate-950/70 text-white hover:border-lime-300/35 hover:bg-white/[0.08]"
                                                                }`}
                                                            >
                                                                <span className="block text-sm font-black">
                                                                    {language.name}
                                                                </span>
                                                                <span
                                                                    className={`mt-1 block text-xs font-bold ${
                                                                        selected
                                                                            ? "text-slate-950/70"
                                                                            : "text-slate-400"
                                                                    }`}
                                                                >
                                                                    ({language.welcomeLabel})
                                                                </span>
                                                            </button>
                                                        );
                                                    }
                                                )}
                                            </div>
                                        </div>
                                    ) : null}

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <label className="block">
                                            <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                Year visited
                                            </span>
                                            <Input
                                                type="number"
                                                min="1900"
                                                max={getCurrentYearMonth().year}
                                                value={bucketListCompletionYear}
                                                onChange={(event) =>
                                                    setBucketListCompletionYear(
                                                        event.target.value
                                                    )
                                                }
                                                className="mt-2 rounded-full border-white/10 bg-slate-950 text-white"
                                            />
                                        </label>
                                        <label className="block">
                                            <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                Month visited
                                            </span>
                                            <select
                                                value={bucketListCompletionMonth}
                                                onChange={(event) =>
                                                    setBucketListCompletionMonth(
                                                        event.target.value
                                                    )
                                                }
                                                disabled={
                                                    !bucketListCompletionMonthOptions.length
                                                }
                                                className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition focus:border-lime-300/50 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                <option value="">Month</option>
                                                {bucketListCompletionMonthOptions.map(
                                                    (month) => (
                                                        <option
                                                            key={month.value}
                                                            value={month.value}
                                                        >
                                                            {month.label}
                                                        </option>
                                                    )
                                                )}
                                            </select>
                                        </label>
                                    </div>

                                    {(errorMessage || dateError) ? (
                                        <p className="rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                                            {errorMessage || dateError}
                                        </p>
                                    ) : null}

                                    <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => {
                                                requestClose();
                                                resetBucketListCompletionForm();
                                                setErrorMessage(null);
                                            }}
                                            className="border-white/10 bg-white/[0.08] text-slate-100 hover:bg-white/[0.14] hover:text-white"
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="button"
                                            disabled={!canSave}
                                            onClick={handleSaveBucketListCompletion}
                                            className="bg-lime-300 text-slate-950 hover:bg-lime-200"
                                        >
                                            {isSavingBucketListCompletion
                                                ? "Saving..."
                                                : "Add passport stamp"}
                                        </Button>
                                    </div>
                                </div>
                            );
                        }}
                    </AnimatedModal>
                </Portal>
            ) : null}
            {isBucketListModalOpen ? (
                <Portal>
                    <AnimatedModal
                        onClose={() => {
                            setIsBucketListModalOpen(false);
                            resetBucketListForm();
                        }}
                        className="z-[110] items-center bg-slate-950/60"
                        panelClassName="max-w-2xl overflow-visible rounded-[2rem] border-white/10 bg-[#050712] text-white shadow-2xl shadow-black/60"
                        labelledBy="travelBucketListTitle"
                    >
                        {({ requestClose }) => (
                            <div className="space-y-5 p-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                            Travel bucket list
                                        </p>
                                        <h2
                                            id="travelBucketListTitle"
                                            className="mt-2 text-3xl font-black"
                                        >
                                            {editingBucketListItem
                                                ? "Edit bucket list place"
                                                : "Add bucket list place"}
                                        </h2>
                                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
                                            Search for a city, region, or country so VAIVIA can match it to future trip arrivals.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            requestClose();
                                            resetBucketListForm();
                                        }}
                                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 transition hover:bg-white/[0.14]"
                                        aria-label="Close travel bucket list"
                                    >
                                        <X className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                </div>

                                <div>
                                    <Label className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                        Place
                                    </Label>
                                    <PlaceAutocompleteInput
                                        value={bucketListPlaceValue}
                                        onInputChange={(value) => {
                                            setBucketListPlaceValue(value);
                                            setBucketListPlaceParts(null);
                                            setBucketListGooglePlaceId("");
                                            setBucketListFormattedAddress("");
                                            setBucketListLatitude(null);
                                            setBucketListLongitude(null);
                                        }}
                                        onPlaceSelect={handleBucketListPlaceSelect}
                                        placeholder="City, region, or country..."
                                        className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                    />
                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                        Pick a Google Maps result so the bucket list item has a country VAIVIA can match later.
                                    </p>
                                </div>

                                {bucketListPlaceParts ? (
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                                        <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                            Selected place
                                        </p>
                                        <div className="mt-3 flex items-center gap-3">
                                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950/70 text-3xl ring-1 ring-lime-300/25">
                                                {getFlagEmoji(
                                                    bucketListPlaceParts.countryCode
                                                )}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="font-black text-white">
                                                    {bucketListPlaceParts.displayLabel ||
                                                        bucketListPlaceParts.countryName}
                                                </p>
                                                <p className="text-xs font-semibold text-slate-400">
                                                    {[
                                                        bucketListPlaceParts.city,
                                                        bucketListPlaceParts.region,
                                                        bucketListPlaceParts.countryName,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(" / ")}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}

                                {errorMessage ? (
                                    <p className="rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                                        {errorMessage}
                                    </p>
                                ) : null}

                                <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            requestClose();
                                            resetBucketListForm();
                                        }}
                                        className="border-white/10 bg-white/[0.08] text-slate-100 hover:bg-white/[0.14] hover:text-white"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={handleSaveBucketListItem}
                                        disabled={
                                            !bucketListPlaceParts ||
                                            isSavingBucketListItem
                                        }
                                        className="bg-lime-300 text-slate-950 hover:bg-lime-200"
                                    >
                                        {isSavingBucketListItem
                                            ? "Saving..."
                                            : editingBucketListItem
                                              ? "Save place"
                                              : "Add place"}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </AnimatedModal>
                </Portal>
            ) : null}
            {selectedPassportStamp ? (
                <Portal>
                    <AnimatedModal
                        onClose={() => {
                            setIsEditingPassportStamp(false);
                            setSelectedPassportStamp(null);
                        }}
                        className="z-[110] items-center bg-slate-950/60"
                        panelClassName="max-w-xl overflow-hidden rounded-[2rem] border-white/10 bg-[#050712] text-white shadow-2xl shadow-black/60"
                        labelledBy="passportStampDetailTitle"
                    >
                        {({ requestClose }) => (
                            <div className="grid gap-6 p-6 sm:grid-cols-[auto_1fr]">
                                <div className="flex justify-center">
                                    <PassportStampCard
                                        countryName={selectedPassportStamp.countryName}
                                        countryCode={selectedPassportStamp.countryCode}
                                        flagEmoji={selectedPassportStamp.flagEmoji}
                                        flagSvgUrl={selectedPassportStamp.flagSvgUrl}
                                        firstVisitYear={
                                            selectedPassportStamp.firstVisitYear
                                        }
                                        welcomeLabel={
                                            selectedPassportStamp.welcomeLabel
                                        }
                                        airportCode={selectedPassportStamp.airportCode}
                                        airportCity={selectedPassportStamp.airportCity}
                                        portOfEntryLabel={
                                            selectedPassportStamp.portOfEntryName
                                        }
                                        size="md"
                                    />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                                Passport stamp
                                            </p>
                                            <h2
                                                id="passportStampDetailTitle"
                                                className="mt-2 text-3xl font-black"
                                            >
                                                {selectedPassportStamp.countryName}
                                            </h2>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={requestClose}
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 transition hover:bg-white/[0.14]"
                                            aria-label="Close passport stamp"
                                        >
                                            <X className="h-5 w-5" aria-hidden="true" />
                                        </button>
                                    </div>
                                    <dl className="mt-5 grid gap-3 text-sm">
                                        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                                            <dt className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                First stamped
                                            </dt>
                                            <dd className="mt-1 font-bold text-white">
                                                {formatStampVisitDate(selectedPassportStamp)}
                                            </dd>
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                                            <dt className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                Visit details
                                            </dt>
                                            <dd className="mt-1 font-bold text-white">
                                                {[
                                                    selectedPassportStamp.visitCity,
                                                    selectedPassportStamp.visitRegion,
                                                    selectedPassportStamp.visitStatus ===
                                                    "lived"
                                                        ? "Lived"
                                                        : "Visited",
                                                ]
                                                    .filter(Boolean)
                                                    .join(" / ") || "Visited"}
                                            </dd>
                                        </div>
                                        {selectedPassportStamp.travelFriendIds?.length ? (
                                            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                                                <dt className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                    You went with
                                                </dt>
                                                <dd className="mt-2 flex flex-wrap gap-2">
                                                    {selectedPassportStamp.travelFriendIds
                                                        .map((friendId) =>
                                                            profileStats.friends.find(
                                                                (friend) =>
                                                                    friend.id ===
                                                                    friendId
                                                            )
                                                        )
                                                        .filter(
                                                            (
                                                                friend
                                                            ): friend is FriendProfile =>
                                                                Boolean(friend)
                                                        )
                                                        .map((friend) => (
                                                            <span
                                                                key={friend.id}
                                                                className="inline-flex items-center gap-2 rounded-full border border-lime-300/25 bg-lime-300/10 px-3 py-1.5 text-xs font-black text-lime-100"
                                                            >
                                                                {friend.avatarUrl ? (
                                                                    <img
                                                                        src={
                                                                            friend.avatarUrl
                                                                        }
                                                                        alt=""
                                                                        className="h-5 w-5 rounded-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-950 text-[10px] text-lime-200">
                                                                        {getFriendInitials(
                                                                            friend
                                                                        )}
                                                                    </span>
                                                                )}
                                                                {getFriendDisplayName(
                                                                    friend
                                                                )}
                                                            </span>
                                                        ))}
                                                </dd>
                                            </div>
                                        ) : null}
                                        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                                            <dt className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                Welcome
                                            </dt>
                                            <dd className="mt-1 font-bold text-white">
                                                {selectedPassportStamp.welcomeLabel ||
                                                    selectedPassportStamp.arrivalLabel ||
                                                    "WELCOME"}
                                            </dd>
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                                            <dt className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                Port of entry
                                            </dt>
                                            <dd className="mt-1 font-bold text-white">
                                                {selectedPassportStamp.portOfEntryName ||
                                                    [
                                                        selectedPassportStamp.airportCity,
                                                        selectedPassportStamp.airportCode,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(" / ") ||
                                                    "Not set"}
                                            </dd>
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                                            <dt className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                Source
                                            </dt>
                                            <dd className="mt-1 font-bold text-white">
                                                {selectedPassportStamp.source === "manual"
                                                    ? "Manual"
                                                    : selectedPassportStamp.sourceTripTitle ||
                                                      "Completed trip"}
                                            </dd>
                                        </div>
                                    </dl>
                                    {selectedPassportStamp.source === "manual" ? (
                                        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                                            {isEditingPassportStamp ? (
                                                <div className="space-y-3">
                                                    <div>
                                                        <Label
                                                            htmlFor="passportStampEditYear"
                                                            className="text-xs font-black uppercase tracking-[0.18em] text-lime-200"
                                                        >
                                                            Year of first completed travel
                                                        </Label>
                                                        <input
                                                            id="passportStampEditYear"
                                                            value={editStampYear}
                                                            onChange={(event) => {
                                                                setErrorMessage(null);
                                                                setEditStampYear(
                                                                    event.target.value
                                                                        .replace(/\D/g, "")
                                                                        .slice(0, 4)
                                                                );
                                                            }}
                                                            placeholder="Year"
                                                            inputMode="numeric"
                                                            className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                                        />
                                                    </div>
                                                    <div className="grid gap-3 sm:grid-cols-2">
                                                        <label className="block">
                                                            <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                                Month visited
                                                            </span>
                                                            <select
                                                                value={editStampMonth}
                                                                onChange={(event) => {
                                                                    setErrorMessage(null);
                                                                    setEditStampMonth(
                                                                        event.target.value
                                                                    );
                                                                }}
                                                                disabled={
                                                                    editStampMonthOptions.length ===
                                                                    0
                                                                }
                                                                className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition focus:border-lime-300/50"
                                                            >
                                                                <option value="">No month</option>
                                                                {editStampMonthOptions.map((month) => (
                                                                    <option
                                                                        key={month.value}
                                                                        value={month.value}
                                                                    >
                                                                        {month.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            {editStampMonthOptions.length === 0 ? (
                                                                <p className="mt-1 text-xs font-semibold text-red-200">
                                                                    Change the year to this year or earlier to choose a month.
                                                                </p>
                                                            ) : null}
                                                        </label>
                                                        <label className="block">
                                                            <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                                Status
                                                            </span>
                                                            <select
                                                                value={editStampStatus}
                                                                onChange={(event) =>
                                                                    setEditStampStatus(
                                                                        event.target.value ===
                                                                            "lived"
                                                                            ? "lived"
                                                                            : "visited"
                                                                    )
                                                                }
                                                                className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition focus:border-lime-300/50"
                                                            >
                                                                <option value="visited">
                                                                    Visited
                                                                </option>
                                                                <option value="lived">
                                                                    Lived
                                                                </option>
                                                            </select>
                                                        </label>
                                                        <div className="sm:col-span-2">
                                                            <Label className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                                Where did you go?
                                                            </Label>
                                                            <PlaceAutocompleteInput
                                                                value={editStampLocationValue}
                                                                onInputChange={(value) => {
                                                                    setEditStampLocationValue(value);
                                                                    setEditStampCity("");
                                                                    setEditStampRegion("");
                                                                }}
                                                                onPlaceSelect={
                                                                    handleEditLocationPlaceSelect
                                                                }
                                                                placeholder="City, region, or country..."
                                                                className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                                            />
                                                            <p className="mt-1 text-xs font-semibold text-slate-500">
                                                                Override this if the entry point is not the place you visited.
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {editStampLanguageOptions.length > 1 ? (
                                                        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                                                            <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                                Stamp language
                                                            </p>
                                                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                                                {editStampLanguageOptions.map(
                                                                    (language) => {
                                                                        const selected =
                                                                            editStampLanguageCode ===
                                                                            language.code;
                                                                        return (
                                                                            <button
                                                                                key={language.code}
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    setEditStampLanguageCode(
                                                                                        language.code
                                                                                    )
                                                                                }
                                                                                className={`rounded-2xl border px-3 py-2 text-left text-sm transition ${
                                                                                    selected
                                                                                        ? "border-lime-300/45 bg-lime-300 text-slate-950"
                                                                                        : "border-white/10 bg-slate-950/70 text-white hover:border-lime-300/35 hover:bg-white/[0.08]"
                                                                                }`}
                                                                            >
                                                                                <span className="block font-black">
                                                                                    {language.name}
                                                                                </span>
                                                                                <span
                                                                                    className={`mt-1 block text-xs font-bold ${
                                                                                        selected
                                                                                            ? "text-slate-950/70"
                                                                                            : "text-slate-400"
                                                                                    }`}
                                                                                >
                                                                                    ({language.welcomeLabel})
                                                                                </span>
                                                                            </button>
                                                                        );
                                                                    }
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                                                        <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                            Travelled with a friend
                                                        </p>
                                                        {profileStats.friends.length > 0 ? (
                                                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                                                {profileStats.friends.map((friend) => {
                                                                    const selected =
                                                                        passportStampFriendIds.includes(
                                                                            friend.id
                                                                        );
                                                                    return (
                                                                        <button
                                                                            key={friend.id}
                                                                            type="button"
                                                                            onClick={() =>
                                                                                togglePassportStampFriend(
                                                                                    friend.id
                                                                                )
                                                                            }
                                                                            className={`flex min-h-12 items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${
                                                                                selected
                                                                                    ? "border-lime-300/45 bg-lime-300 text-slate-950"
                                                                                    : "border-white/10 bg-slate-950/70 text-white hover:border-lime-300/35 hover:bg-white/[0.08]"
                                                                            }`}
                                                                        >
                                                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-950 text-xs font-black uppercase text-lime-200">
                                                                                {friend.avatarUrl ? (
                                                                                    <img
                                                                                        src={friend.avatarUrl}
                                                                                        alt=""
                                                                                        className="h-full w-full object-cover"
                                                                                    />
                                                                                ) : (
                                                                                    getFriendInitials(
                                                                                        friend
                                                                                    )
                                                                                )}
                                                                            </span>
                                                                            <span className="min-w-0 text-sm font-black">
                                                                                {getFriendDisplayName(
                                                                                    friend
                                                                                )}
                                                                            </span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <p className="mt-3 rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-sm font-semibold text-slate-400">
                                                                Add friends first, then you can send them passport stamps to accept or decline.
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <Label
                                                            htmlFor="passportStampEditAirport"
                                                            className="text-xs font-black uppercase tracking-[0.18em] text-lime-200"
                                                        >
                                                            Port of entry
                                                        </Label>
                                                        <PlaceAutocompleteInput
                                                            id="passportStampEditAirport"
                                                            value={airportSearchValue}
                                                            onInputChange={(value) => {
                                                                setAirportSearchValue(value);
                                                                resetSelectedAirport();
                                                            }}
                                                            onPlaceSelect={
                                                                handleAirportPlaceSelect
                                                            }
                                                            placeholder="Airport, train station, ship port, border crossing..."
                                                            className="mt-2 w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                                        />
                                                        <p className="mt-1 text-xs font-semibold text-slate-500">
                                                            Google validation helps VAIVIA snapshot
                                                            the place and convert airport entries to
                                                            codes when available.
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-wrap justify-between gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            onClick={async () => {
                                                                const deleted =
                                                                    await handleDeletePassportStamp(
                                                                        selectedPassportStamp
                                                                    );
                                                                if (deleted) {
                                                                    setIsEditingPassportStamp(
                                                                        false
                                                                    );
                                                                    setSelectedPassportStamp(
                                                                        null
                                                                    );
                                                                }
                                                            }}
                                                            disabled={isSavingStamp}
                                                            className="border-red-300/30 bg-red-400/10 text-red-100 hover:bg-red-400/20 hover:text-red-50"
                                                        >
                                                            <Trash2
                                                                className="h-4 w-4"
                                                                aria-hidden="true"
                                                            />
                                                            Delete stamp
                                                        </Button>
                                                        <div className="flex flex-wrap justify-end gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            onClick={() =>
                                                                setIsEditingPassportStamp(false)
                                                            }
                                                            className="border-white/10 bg-white/[0.08] text-slate-100 hover:bg-white/[0.14] hover:text-white"
                                                        >
                                                            Cancel
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            onClick={() =>
                                                                requestUpdatePassportStamp(
                                                                    selectedPassportStamp
                                                                )
                                                            }
                                                            disabled={isSavingStamp}
                                                            className="bg-lime-300 text-slate-950 hover:bg-lime-200"
                                                        >
                                                            {isSavingStamp
                                                                ? "Saving..."
                                                                : "Save changes"}
                                                        </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            const deleted =
                                                                await handleDeletePassportStamp(
                                                                    selectedPassportStamp
                                                                );
                                                            if (deleted) {
                                                                setSelectedPassportStamp(
                                                                    null
                                                                );
                                                            }
                                                        }}
                                                        disabled={isSavingStamp}
                                                        className="inline-flex items-center gap-2 rounded-full border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm font-black text-red-100 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        <Trash2
                                                            className="h-4 w-4"
                                                            aria-hidden="true"
                                                        />
                                                        Delete stamp
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            beginEditPassportStamp(
                                                                selectedPassportStamp
                                                            )
                                                        }
                                                        className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-lime-200"
                                                    >
                                                        <Pencil
                                                            className="h-4 w-4"
                                                            aria-hidden="true"
                                                        />
                                                        Edit stamp
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        )}
                    </AnimatedModal>
                </Portal>
            ) : null}
        </>
    );
}
