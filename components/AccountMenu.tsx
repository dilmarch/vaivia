"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
    Camera,
    Globe2,
    LogOut,
    MapPinned,
    Pencil,
    Plus,
    Settings,
    Stamp,
    UserRound,
    UsersRound,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AnimatedModal from "@/components/AnimatedModal";
import PassportStampCard from "@/components/PassportStamp";
import PlaceAutocompleteInput from "@/components/places/PlaceAutocompleteInput";
import Portal from "@/components/Portal";
import { createClient } from "@/lib/supabase/client";

export type UserProfile = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    email: string | null;
    avatar_url: string | null;
    join_date: string | null;
    created_at: string | null;
    updated_at: string | null;
};

export type UserPreferences = {
    user_id: string;
    clock_format: "12h" | "24h";
    default_time_zone: string | null;
    itinerary_default_view: "list" | "day" | "week";
    created_at: string | null;
    updated_at: string | null;
};

type AccountMenuProps = {
    userId: string;
    email?: string | null;
    joinedAt?: string | null;
    profile?: Partial<UserProfile> | null;
    preferences?: Partial<UserPreferences> | null;
    variant?: "top" | "sidebar-profile" | "sidebar-settings" | "mobile-profile";
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
    airportCode?: string | null;
    airportCity?: string | null;
    sourceTripTitle?: string | null;
    source: "auto" | "manual";
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
    capital?: string | null;
    defaultEntryAirportId?: string | null;
};

type ProfileStats = {
    tripsPlanned: number;
    friendsCount: number;
    stamps: PassportStamp[];
};

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
    const stampsByCode = new Map<string, PassportStamp>();

    stamps.forEach((stamp) => {
        if (!stamp.countryCode) return;
        const existing = stampsByCode.get(stamp.countryCode);
        if (
            !existing ||
            existing.source !== "manual" ||
            (stamp.firstVisitYear &&
                (!existing.firstVisitYear ||
                    stamp.firstVisitYear < existing.firstVisitYear))
        ) {
            stampsByCode.set(stamp.countryCode, stamp);
        }
    });

    return Array.from(stampsByCode.values()).sort((a, b) =>
        a.countryName.localeCompare(b.countryName)
    );
}

function getYearFromDate(value?: string | null) {
    if (!value) return null;
    const year = Number(String(value).slice(0, 4));
    return Number.isFinite(year) && year > 0 ? year : null;
}

function getFirstVisitDateForTrip(trip?: { start_date?: string | null; end_date?: string | null }) {
    return trip?.start_date || trip?.end_date || null;
}

function getManualFirstVisitedOn(year: string) {
    const trimmed = year.trim();
    if (!trimmed) return null;
    const numericYear = Number(trimmed);
    if (!Number.isInteger(numericYear) || numericYear < 1900 || numericYear > 2200) {
        return null;
    }

    return `${numericYear}-01-01`;
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
    if (error && typeof error === "object") {
        const record = error as Record<string, unknown>;
        return {
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
        };
    }

    return {
        message: error instanceof Error ? error.message : "Unknown error",
    };
}

export default function AccountMenu({
    userId,
    email,
    joinedAt,
    profile,
    variant = "top",
}: AccountMenuProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isOpen, setIsOpen] = useState(false);
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
    const [username, setUsername] = useState(() =>
        getInitialValue(profile?.username)
    );
    const [emailAddress, setEmailAddress] = useState(() =>
        getInitialValue(profile?.email || email)
    );
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [mode, setMode] = useState<"profile" | "edit">("profile");
    const [profileStats, setProfileStats] = useState<ProfileStats>({
        tripsPlanned: 0,
        friendsCount: 0,
        stamps: [],
    });
    const [isLoadingProfileStats, setIsLoadingProfileStats] = useState(false);
    const [countryOptions, setCountryOptions] = useState<CountryOption[]>([]);
    const [isLoadingCountries, setIsLoadingCountries] = useState(false);
    const [countrySearchQuery, setCountrySearchQuery] = useState("");
    const [selectedStampCountryCode, setSelectedStampCountryCode] = useState("");
    const [selectedGoogleCountry, setSelectedGoogleCountry] =
        useState<CountryOption | null>(null);
    const [manualStampYear, setManualStampYear] = useState("");
    const [airportSearchValue, setAirportSearchValue] = useState("");
    const [selectedAirportPlaceId, setSelectedAirportPlaceId] = useState("");
    const [selectedAirportName, setSelectedAirportName] = useState("");
    const [selectedAirportFormattedAddress, setSelectedAirportFormattedAddress] =
        useState("");
    const [selectedAirportCity, setSelectedAirportCity] = useState("");
    const [selectedAirportParsedCode, setSelectedAirportParsedCode] = useState("");
    const [selectedPassportStamp, setSelectedPassportStamp] =
        useState<PassportStamp | null>(null);
    const [isSavingStamp, setIsSavingStamp] = useState(false);

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
    const filteredCountryOptions = useMemo(() => {
        const query = countrySearchQuery.trim().toLowerCase();
        if (!query) return countryOptions.slice(0, 10);

        return countryOptions
            .filter((country) =>
                [
                    country.name,
                    country.officialName,
                    country.code,
                    country.alpha3,
                    country.region,
                    country.subregion,
                    ...Object.keys(country.currencies || {}),
                    ...Object.values(country.currencies || {}).map(
                        (currency) => currency.name || ""
                    ),
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase()
                    .includes(query)
            )
            .slice(0, 12);
    }, [countryOptions, countrySearchQuery]);

    function openAccount() {
        setMode("profile");
        setIsOpen(true);
    }

    useEffect(() => {
        const profileTarget = searchParams.get("profile");
        if (
            profileTarget !== "passport" ||
            !["top", "sidebar-profile"].includes(variant)
        ) {
            return;
        }

        setMode("profile");
        setIsOpen(true);

        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.delete("profile");
        router.replace(
            `${pathname || "/"}${nextParams.toString() ? `?${nextParams}` : ""}`,
            { scroll: false }
        );
    }, [pathname, router, searchParams, variant]);

    useEffect(() => {
        if (!isOpen) return;

        let isCancelled = false;

        async function loadCountryOptions() {
            setIsLoadingCountries(true);
            try {
                const supabase = createClient();
                const { data, error } = await supabase
                    .from("countries")
                    .select(
                        "alpha2,alpha3,common_name,official_name,flag_emoji,flag_svg_url,flag_png_url,region,subregion,currencies,welcome_label,arrival_label,primary_language_code,capital,default_entry_airport_id"
                    )
                    .order("common_name", { ascending: true });

                if (error) throw error;

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
                        capital: record.capital || null,
                        defaultEntryAirportId: record.default_entry_airport_id || null,
                    }))
                    .filter((country) => country.code && country.name)
                    .sort((a, b) => a.name.localeCompare(b.name));

                if (!isCancelled) setCountryOptions(options);
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
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        let isCancelled = false;

        async function loadProfileStats() {
            setIsLoadingProfileStats(true);
            const supabase = createClient();
            const today = new Date().toISOString().slice(0, 10);

            try {
                const [membershipResult, ownerTripsResult, manualStampsResult] =
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
                                "id,country_code,country_name,flag_emoji,source,created_at,stamped_at,first_visited_on,first_entry_iata_code,first_entry_icao_code,first_entry_city,first_entry_airport_name,first_entry_airport_google_place_id,first_entry_airport_formatted_address,welcome_label_snapshot,arrival_label_snapshot,stamp_display_country_name,stamp_display_flag"
                            )
                            .eq("user_id", userId),
                    ]);

                if (membershipResult.error) throw membershipResult.error;
                if (ownerTripsResult.error) throw ownerTripsResult.error;

                if (manualStampsResult.error) {
                    console.warn("Could not load manual passport stamps:", {
                        ...getErrorDetails(manualStampsResult.error),
                        userId,
                    });
                }

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

                const tripIds = Array.from(tripsById.keys());
                const allMembersResult =
                    tripIds.length > 0
                        ? await supabase
                              .from("trip_members")
                              .select("trip_id,user_id,status")
                              .in("trip_id", tripIds)
                              .eq("status", "active")
                        : { data: [], error: null };

                if (allMembersResult.error) throw allMembersResult.error;

                const friendIds = new Set<string>();
                ((allMembersResult.data || []) as Array<{
                    user_id?: string | null;
                }>).forEach((member) => {
                    if (member.user_id && member.user_id !== userId) {
                        friendIds.add(member.user_id);
                    }
                });

                Array.from(tripsById.values()).forEach((trip) => {
                    if (trip.user_id && trip.user_id !== userId) {
                        friendIds.add(trip.user_id);
                    }
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
                        stamp_display_country_name?: string | null;
                        stamp_display_flag?: string | null;
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
                            airportCode:
                                stamp.first_entry_iata_code ||
                                stamp.first_entry_icao_code ||
                                null,
                            airportCity: stamp.first_entry_city || null,
                            source: "manual" as const,
                        });

                        return stamps;
                    }, []);

                let mergedStamps = mergePassportStamps([
                    ...autoStamps,
                    ...manualStamps,
                ]);

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
                    };
                });

                if (!isCancelled) {
                    setProfileStats({
                        tripsPlanned: tripsById.size,
                        friendsCount: friendIds.size,
                        stamps: mergedStamps,
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
                        stamps: [],
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
    }, [isOpen, userId]);

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
    }

    function handleCountryPlaceSelect(place: google.maps.places.PlaceResult) {
        const countryCode = getAddressComponent(
            place.address_components,
            "country",
            "short_name"
        )
            .trim()
            .toUpperCase();
        const countryName =
            getAddressComponent(place.address_components, "country") ||
            place.name ||
            countrySearchQuery;

        if (!/^[A-Z]{2}$/.test(countryCode)) {
            setSelectedStampCountryCode("");
            setSelectedGoogleCountry(null);
            setErrorMessage("Select a Google Maps country, city, or place result.");
            return;
        }

        const existingCountry = countryOptions.find(
            (country) => country.code === countryCode
        );
        const fallbackCountry: CountryOption = existingCountry || {
            code: countryCode,
            alpha3: null,
            name: countryName || getCountryName(countryCode),
            officialName: null,
            flag: getFlagEmoji(countryCode),
            flagSvgUrl: null,
            flagPngUrl: null,
            region: null,
            subregion: null,
            currencies: {},
            welcomeLabel: resolvePassportWelcomeLabel(countryCode),
            arrivalLabel: null,
            primaryLanguageCode: null,
            capital: null,
            defaultEntryAirportId: null,
        };

        setErrorMessage(null);
        setSelectedGoogleCountry(fallbackCountry);
        setSelectedStampCountryCode(countryCode);
        setCountrySearchQuery(
            `${fallbackCountry.flag || getFlagEmoji(countryCode)} ${
                fallbackCountry.name
            }`
        );
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

    async function handleAddPassportStamp() {
        const selectedCountry = selectedStampCountry;
        if (!selectedCountry) return;
        if (!selectedAirportPlaceId || !selectedAirportName.trim()) {
            setErrorMessage(
                "Select a Google Maps airport result for the airport of entry."
            );
            return;
        }

        const supabase = createClient();
        setIsSavingStamp(true);
        setErrorMessage(null);

        try {
            const firstVisitedOn = getManualFirstVisitedOn(manualStampYear);
            const airportSnapshot = await resolveAirportSnapshot(
                supabase,
                selectedCountry.code
            );
            const resolvedWelcomeLabel = resolvePassportWelcomeLabel(
                selectedCountry.code,
                selectedCountry.welcomeLabel,
                selectedCountry.arrivalLabel
            );
            const payload = {
                user_id: userId,
                country_code: selectedCountry.code,
                country_name: selectedCountry.name,
                flag_emoji: selectedCountry.flag || getFlagEmoji(selectedCountry.code),
                first_visited_on: firstVisitedOn,
                welcome_label_snapshot: resolvedWelcomeLabel,
                arrival_label_snapshot: selectedCountry.arrivalLabel || null,
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
                source: "manual",
                updated_at: new Date().toISOString(),
            };
            const { data, error } = await supabase
                .from("user_passport_stamps")
                .upsert(payload, { onConflict: "user_id,country_code" })
                .select(
                    "id,country_code,country_name,flag_emoji,first_visited_on,welcome_label_snapshot,arrival_label_snapshot,stamp_display_country_name,stamp_display_flag,first_entry_iata_code,first_entry_icao_code,first_entry_city,first_entry_airport_name,first_entry_airport_google_place_id,first_entry_airport_formatted_address"
                )
                .single();

            if (error) throw error;

            const stamp: PassportStamp = {
                id: data?.id,
                countryCode: data?.country_code || selectedCountry.code,
                countryName:
                    data?.stamp_display_country_name ||
                    data?.country_name ||
                    selectedCountry.name,
                flagEmoji:
                    data?.stamp_display_flag ||
                    data?.flag_emoji ||
                    selectedCountry.flag ||
                    getFlagEmoji(selectedCountry.code),
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
                airportCode:
                    data?.first_entry_iata_code ||
                    data?.first_entry_icao_code ||
                    null,
                airportCity: data?.first_entry_city || selectedCountry.capital || null,
                source: "manual",
            };

            setProfileStats((current) => ({
                ...current,
                stamps: mergePassportStamps([...current.stamps, stamp]),
            }));
            setSelectedStampCountryCode("");
            setCountrySearchQuery("");
            setManualStampYear("");
            setAirportSearchValue("");
            resetSelectedAirport();
        } catch (error) {
            console.error("Could not add passport stamp:", {
                ...getErrorDetails(error),
                countryCode: selectedCountry.code,
                userId,
            });
            setErrorMessage("Could not add passport stamp.");
        } finally {
            setIsSavingStamp(false);
        }
    }

    async function handleDeletePassportStamp(stamp: PassportStamp) {
        if (stamp.source !== "manual" || !stamp.id) return;

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
        } catch (error) {
            console.error("Could not delete passport stamp:", {
                ...getErrorDetails(error),
                stamp,
                userId,
            });
            setErrorMessage("Could not remove passport stamp.");
        } finally {
            setIsSavingStamp(false);
        }
    }

    async function handleSave(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setErrorMessage(null);
        setStatusMessage(null);

        if (newPassword || confirmPassword) {
            if (newPassword.length < 6) {
                setErrorMessage("Password must be at least 6 characters.");
                return;
            }

            if (newPassword !== confirmPassword) {
                setErrorMessage("Password confirmation does not match.");
                return;
            }
        }

        const supabase = createClient();
        setIsSaving(true);

        try {
            const nextAvatarUrl = await uploadAvatarIfNeeded();
            const nextEmail = emailAddress.trim() || null;
            const authUpdates: {
                email?: string;
                password?: string;
            } = {};

            if (nextEmail && nextEmail !== email) {
                authUpdates.email = nextEmail;
            }

            if (newPassword) {
                authUpdates.password = newPassword;
            }

            if (authUpdates.email || authUpdates.password) {
                const { error } = await supabase.auth.updateUser(authUpdates);
                if (error) {
                    console.error("Error updating Supabase Auth account:", {
                        ...getErrorDetails(error),
                        attemptedEmailChange: Boolean(authUpdates.email),
                        attemptedPasswordChange: Boolean(authUpdates.password),
                    });
                    throw error;
                }
            }

            const profilePayload = {
                id: userId,
                first_name: firstName.trim() || null,
                last_name: lastName.trim() || null,
                username: username.trim() || null,
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
            setNewPassword("");
            setConfirmPassword("");
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

    function renderProfileView(requestClose: () => void) {
        const visitedCountryCodes = new Set(
            passportStamps.map((stamp) => stamp.countryCode)
        );
        const mapCountries = countryOptions.filter((country) =>
            visitedCountryCodes.has(country.code)
        );

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
                                <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                                    Joined {joinDateLabel}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 transition hover:bg-white/[0.14]"
                            aria-label="Close account profile"
                        >
                            <X className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </div>

                    <div className="relative mt-6 flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => setMode("edit")}
                            className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:bg-lime-200"
                        >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Edit profile
                        </button>
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
                    <div className="grid gap-3 sm:grid-cols-3">
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
                            <div className="min-w-0 flex-1 sm:max-w-xl">
                                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]">
                                    <div className="relative">
                                        <PlaceAutocompleteInput
                                            value={countrySearchQuery}
                                            onInputChange={(value) => {
                                                setCountrySearchQuery(value);
                                                setSelectedStampCountryCode("");
                                                setSelectedGoogleCountry(null);
                                            }}
                                            onPlaceSelect={handleCountryPlaceSelect}
                                            placeholder="Search country, city, or place..."
                                            className="w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                        />
                                        {isLoadingCountries ||
                                        filteredCountryOptions.length > 0 ? (
                                            <div className="absolute right-0 top-full z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl">
                                            {isLoadingCountries ? (
                                                <p className="px-3 py-2 text-sm font-semibold text-slate-400">
                                                    Loading countries...
                                                </p>
                                            ) : filteredCountryOptions.length > 0 ? (
                                                filteredCountryOptions.map((country) => {
                                                    const currencyCodes = Object.keys(
                                                        country.currencies || {}
                                                    );
                                                    const isSelected =
                                                        selectedStampCountryCode ===
                                                        country.code;

                                                    return (
                                                        <button
                                                            key={country.code}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedStampCountryCode(
                                                                    country.code
                                                                );
                                                                setCountrySearchQuery(
                                                                    `${country.flag} ${country.name}`
                                                                );
                                                            }}
                                                            className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition ${
                                                                isSelected
                                                                    ? "bg-lime-300 text-slate-950"
                                                                    : "text-white hover:bg-white/[0.08]"
                                                            }`}
                                                        >
                                                            <span
                                                                className="mt-0.5 text-xl"
                                                                aria-hidden="true"
                                                            >
                                                                {country.flag ||
                                                                    getFlagEmoji(
                                                                        country.code
                                                                    )}
                                                            </span>
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block text-sm font-black">
                                                                    {country.name}
                                                                </span>
                                                                <span
                                                                    className={`mt-0.5 block text-xs font-semibold ${
                                                                        isSelected
                                                                            ? "text-slate-800"
                                                                            : "text-slate-400"
                                                                    }`}
                                                                >
                                                                    {[
                                                                        country.officialName,
                                                                        [
                                                                            country.code,
                                                                            country.alpha3,
                                                                        ]
                                                                            .filter(Boolean)
                                                                            .join(" / "),
                                                                        [
                                                                            country.region,
                                                                            country.subregion,
                                                                        ]
                                                                            .filter(Boolean)
                                                                            .join(" - "),
                                                                        currencyCodes.length
                                                                            ? currencyCodes.join(
                                                                                  ", "
                                                                              )
                                                                            : "",
                                                                    ]
                                                                        .filter(Boolean)
                                                                        .join(" · ")}
                                                                </span>
                                                            </span>
                                                        </button>
                                                    );
                                                })
                                            ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                    <input
                                        value={manualStampYear}
                                        onChange={(event) =>
                                            setManualStampYear(
                                                event.target.value.replace(/\D/g, "").slice(0, 4)
                                            )
                                        }
                                        placeholder="Year"
                                        inputMode="numeric"
                                        className="w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                    />
                                </div>
                                <div className="mt-2">
                                    <PlaceAutocompleteInput
                                        value={airportSearchValue}
                                        onInputChange={(value) => {
                                            setAirportSearchValue(value);
                                            resetSelectedAirport();
                                        }}
                                        onPlaceSelect={handleAirportPlaceSelect}
                                        placeholder="Airport of entry, e.g. YUL or Montréal airport"
                                        className="w-full rounded-full border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                    />
                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                        Select a Google Maps airport result so VAIVIA can
                                        snapshot the airport name and code for the stamp.
                                    </p>
                                </div>
                                {selectedStampCountry ? (
                                    <p className="mt-2 text-xs font-semibold text-slate-400">
                                        Selected {selectedStampCountry.flag}{" "}
                                        {selectedStampCountry.name} (
                                        {selectedStampCountry.code}
                                        {selectedStampCountry.alpha3
                                            ? ` / ${selectedStampCountry.alpha3}`
                                            : ""}
                                        )
                                        {selectedAirportPlaceId ? (
                                            <>
                                                {" "}
                                                · Entry{" "}
                                                {selectedAirportParsedCode
                                                    ? selectedAirportParsedCode
                                                    : selectedAirportName}
                                            </>
                                        ) : null}
                                    </p>
                                ) : null}
                            </div>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleAddPassportStamp}
                                    disabled={
                                        !selectedStampCountryCode ||
                                        !selectedAirportPlaceId ||
                                        isSavingStamp
                                    }
                                    className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                    Add
                                </button>
                            </div>
                        </div>

                        {isLoadingProfileStats ? (
                            <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm font-semibold text-slate-300">
                                Loading your stamps...
                            </p>
                        ) : passportStamps.length > 0 ? (
                            <div className="mt-5 grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-3 lg:grid-cols-4">
                                {passportStamps.map((stamp) => (
                                    <PassportStampCard
                                        key={`${stamp.source}-${stamp.countryCode}-${stamp.id || "auto"}`}
                                        countryName={stamp.countryName}
                                        countryCode={stamp.countryCode}
                                        flagEmoji={stamp.flagEmoji}
                                        flagSvgUrl={stamp.flagSvgUrl}
                                        firstVisitYear={stamp.firstVisitYear}
                                        welcomeLabel={stamp.welcomeLabel}
                                        airportCode={stamp.airportCode}
                                        airportCity={stamp.airportCity}
                                        size="sm"
                                        onClick={() => setSelectedPassportStamp(stamp)}
                                        removable={stamp.source === "manual"}
                                        onRemove={() => handleDeletePassportStamp(stamp)}
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm font-semibold text-slate-300">
                                No passport stamps yet. Completed trips and manual stamps will show here.
                            </p>
                        )}
                    </section>

                    <section className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4 shadow-xl shadow-black/20">
                        <div className="flex items-center gap-2">
                            <Globe2 className="h-5 w-5 text-lime-200" aria-hidden="true" />
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                                    Scratch map
                                </p>
                                <p className="text-sm font-semibold text-slate-400">
                                    Highlighted countries reflect your passport stamps.
                                </p>
                            </div>
                        </div>
                        <div className="relative mt-4 min-h-56 overflow-hidden rounded-[1.25rem] border border-white/10 bg-[radial-gradient(circle_at_30%_35%,rgba(var(--vaivia-neon-rgb),0.16),transparent_24%),radial-gradient(circle_at_65%_45%,rgba(217,70,239,0.14),transparent_24%),linear-gradient(135deg,#030712,#0f172a)] p-4">
                            <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:28px_28px]" />
                            <div className="relative flex h-full min-h-48 flex-wrap content-center items-center justify-center gap-2">
                                {mapCountries.length > 0 ? (
                                    mapCountries.map((country) => (
                                        <span
                                            key={country.code}
                                            className="inline-flex items-center gap-1 rounded-full border border-lime-300/35 bg-lime-300 px-3 py-1 text-xs font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)]"
                                        >
                                            <span aria-hidden="true">{country.flag}</span>
                                            {country.code}
                                        </span>
                                    ))
                                ) : (
                                    <p className="text-center text-sm font-bold text-slate-400">
                                        Add a stamp to start highlighting your map.
                                    </p>
                                )}
                            </div>
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

    return (
        <>
            {variant === "mobile-profile" ? (
                <button
                    type="button"
                    onClick={openAccount}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-lime-300/20 bg-white/[0.06] px-5 py-2.5 text-sm font-black text-lime-100 transition hover:bg-lime-300/10 focus:outline-none focus:ring-2 focus:ring-lime-300/50"
                    aria-label="My account"
                >
                    {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={avatarUrl}
                            alt=""
                            className="h-5 w-5 rounded-full border border-lime-300/80 object-cover shadow-[0_0_14px_rgba(var(--vaivia-neon-rgb),0.25)]"
                        />
                    ) : (
                        <UserRound className="h-5 w-5" aria-hidden="true" />
                    )}
                    <span>Account</span>
                </button>
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
                <button
                    type="button"
                    onClick={openAccount}
                    className="flex h-12 min-h-12 w-12 min-w-12 max-w-12 items-center justify-center gap-0 overflow-hidden rounded-[18px] border border-lime-300/25 bg-white/[0.04] p-0 text-left shadow-[0_0_20px_rgba(var(--vaivia-neon-rgb),0.12)] transition-all duration-300 ease-out hover:border-lime-300/45 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-lime-300/50 group-hover/sidebar:w-full group-hover/sidebar:max-w-full group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:p-2 group-focus-within/sidebar:w-full group-focus-within/sidebar:max-w-full group-focus-within/sidebar:justify-start group-focus-within/sidebar:gap-3 group-focus-within/sidebar:p-2"
                    aria-label="My account"
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
                    <span className="pointer-events-none w-0 max-w-0 translate-x-2 overflow-hidden opacity-0 transition-all duration-300 group-hover/sidebar:pointer-events-auto group-hover/sidebar:w-40 group-hover/sidebar:max-w-40 group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100 group-focus-within/sidebar:pointer-events-auto group-focus-within/sidebar:w-40 group-focus-within/sidebar:max-w-40 group-focus-within/sidebar:translate-x-0 group-focus-within/sidebar:opacity-100">
                        <span className="block truncate text-sm font-semibold text-white">
                            {displayName}
                        </span>
                        <span className="block truncate text-xs text-slate-400">
                            {username ? `@${username}` : emailAddress}
                        </span>
                    </span>
                </button>
            ) : (
                <button
                    type="button"
                    onClick={openAccount}
                    className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
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
                </button>
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
                                        <Label htmlFor="username">Username</Label>
                                        <Input
                                            id="username"
                                            className="mt-2"
                                            value={username}
                                            onChange={(event) =>
                                                setUsername(event.target.value)
                                            }
                                            autoComplete="username"
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

                            <section className="grid gap-4 border-t border-slate-200 pt-6 md:grid-cols-[180px_1fr]">
                                <div>
                                    <h3 className="font-semibold text-slate-950">
                                        Password
                                    </h3>
                                    <p className="mt-1 text-sm text-slate-500">
                                        Leave blank to keep your current password.
                                    </p>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <Label htmlFor="newPassword">
                                            New password
                                        </Label>
                                        <Input
                                            id="newPassword"
                                            className="mt-2"
                                            type="password"
                                            value={newPassword}
                                            onChange={(event) =>
                                                setNewPassword(event.target.value)
                                            }
                                            autoComplete="new-password"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="confirmPassword">
                                            Confirm password
                                        </Label>
                                        <Input
                                            id="confirmPassword"
                                            className="mt-2"
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(event) =>
                                                setConfirmPassword(event.target.value)
                                            }
                                            autoComplete="new-password"
                                        />
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
            {selectedPassportStamp ? (
                <Portal>
                    <AnimatedModal
                        onClose={() => setSelectedPassportStamp(null)}
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
                                                {selectedPassportStamp.firstVisitYear ||
                                                    "Visited"}
                                            </dd>
                                        </div>
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
                                                Entry
                                            </dt>
                                            <dd className="mt-1 font-bold text-white">
                                                {[
                                                    selectedPassportStamp.airportCity,
                                                    selectedPassportStamp.airportCode,
                                                ]
                                                    .filter(Boolean)
                                                    .join(" / ") || "Not set"}
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
                                </div>
                            </div>
                        )}
                    </AnimatedModal>
                </Portal>
            ) : null}
        </>
    );
}
