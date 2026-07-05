export type AirlineBrandTheme = {
    airlineCode: string;
    name?: string;
    primary: string;
    secondary: string;
    accent?: string;
};

const DEFAULT_FLIGHT_THEME: AirlineBrandTheme = {
    airlineCode: "DEFAULT",
    name: "Flight",
    primary: "#0F172A",
    secondary: "#F8FAFC",
    accent: "#2563EB",
};

const AIRLINE_BRAND_THEMES: Record<string, Omit<AirlineBrandTheme, "airlineCode">> = {
    AC: { name: "Air Canada", primary: "#E31B23", secondary: "#FDEBEC", accent: "#111827" },
    WS: { name: "WestJet", primary: "#00AAA6", secondary: "#E6F7F6", accent: "#003A5D" },
    PD: { name: "Porter Airlines", primary: "#6B4E9B", secondary: "#F2EEF8", accent: "#111827" },
    TS: { name: "Air Transat", primary: "#005EB8", secondary: "#EAF3FC", accent: "#00A3E0" },
    F8: { name: "Flair Airlines", primary: "#7AC143", secondary: "#F1FAEA", accent: "#111827" },
    WG: { name: "Sunwing Airlines", primary: "#F58220", secondary: "#FFF1E6", accent: "#005EB8" },
    "5T": { name: "Canadian North", primary: "#E31937", secondary: "#FDECEF", accent: "#003A70" },
    "4N": { name: "Air North", primary: "#005DAA", secondary: "#EAF4FB", accent: "#F58220" },
    PB: { name: "PAL Airlines", primary: "#0055A5", secondary: "#EAF2FA", accent: "#D71920" },
    MO: { name: "Calm Air", primary: "#005A9C", secondary: "#EAF3FA", accent: "#FCAF17" },
    P6: { name: "Pascan Aviation", primary: "#005DAA", secondary: "#EAF4FB", accent: "#111827" },
    JV: { name: "Bearskin Airlines", primary: "#003A70", secondary: "#EAF2F8", accent: "#C8102E" },
    "9M": { name: "Central Mountain Air", primary: "#005DAA", secondary: "#EAF4FB", accent: "#6BA43A" },
    "8P": { name: "Pacific Coastal Airlines", primary: "#005DAA", secondary: "#EAF4FB", accent: "#00AEEF" },
    YB: { name: "Harbour Air", primary: "#005DAA", secondary: "#EAF4FB", accent: "#00AEEF" },
    "3H": { name: "Air Inuit", primary: "#005DAA", secondary: "#EAF4FB", accent: "#D71920" },
    YN: { name: "Air Creebec", primary: "#004B8D", secondary: "#EAF2FA", accent: "#FCAF17" },
    AA: { name: "American Airlines", primary: "#0078D2", secondary: "#EEF6FC", accent: "#C8102E" },
    DL: { name: "Delta Air Lines", primary: "#C8102E", secondary: "#FDECEF", accent: "#003A70" },
    UA: { name: "United Airlines", primary: "#005DAA", secondary: "#EAF4FB", accent: "#002244" },
    WN: { name: "Southwest Airlines", primary: "#304CB2", secondary: "#EEF1FC", accent: "#F9B612" },
    AS: { name: "Alaska Airlines", primary: "#004B85", secondary: "#EAF2F8", accent: "#6BA539" },
    B6: { name: "JetBlue", primary: "#003876", secondary: "#EAF1F8", accent: "#00AEEF" },
    F9: { name: "Frontier Airlines", primary: "#006643", secondary: "#E8F5EF", accent: "#A7A9AC" },
    G4: { name: "Allegiant Air", primary: "#005DAA", secondary: "#EAF4FB", accent: "#F9A01B" },
    NK: { name: "Spirit Airlines", primary: "#FFE500", secondary: "#FFFBE6", accent: "#111827" },
    MX: { name: "Breeze Airways", primary: "#00A3E0", secondary: "#EAF8FD", accent: "#003A70" },
    HA: { name: "Hawaiian Airlines", primary: "#442D7C", secondary: "#F0EDF7", accent: "#D7288F" },
    XP: { name: "Avelo Airlines", primary: "#6F2DBD", secondary: "#F3ECFA", accent: "#FFB81C" },
    SY: { name: "Sun Country Airlines", primary: "#F58220", secondary: "#FFF1E6", accent: "#003A70" },
    FR: { name: "Ryanair", primary: "#073590", secondary: "#EEF3FE", accent: "#F1C933" },
    U2: { name: "easyJet", primary: "#FF6600", secondary: "#FFF0E6", accent: "#111827" },
    W6: { name: "Wizz Air", primary: "#C6007E", secondary: "#FBEAF5", accent: "#00A3E0" },
    TK: { name: "Turkish Airlines", primary: "#E81932", secondary: "#FDECEF", accent: "#111827" },
    LH: { name: "Lufthansa", primary: "#05164D", secondary: "#FFF4D6", accent: "#F9BA00" },
    AF: { name: "Air France", primary: "#002157", secondary: "#EEF3FA", accent: "#ED2939" },
    BA: { name: "British Airways", primary: "#2E5C99", secondary: "#EEF4FB", accent: "#C8102E" },
    KL: { name: "KLM", primary: "#00A1DE", secondary: "#EAF8FD", accent: "#003A70" },
    VY: { name: "Vueling", primary: "#FFCC00", secondary: "#FFF8D6", accent: "#111827" },
    IB: { name: "Iberia", primary: "#D71920", secondary: "#FDEDEE", accent: "#FDB913" },
    SK: { name: "SAS", primary: "#003A70", secondary: "#EAF2F8", accent: "#A7A9AC" },
    DY: { name: "Norwegian", primary: "#D81920", secondary: "#FDEDEE", accent: "#111827" },
    AZ: { name: "ITA Airways", primary: "#005EB8", secondary: "#EAF3FC", accent: "#007A53" },
    TP: { name: "TAP Air Portugal", primary: "#006A4E", secondary: "#E8F5F0", accent: "#D00000" },
    LX: { name: "SWISS", primary: "#E30613", secondary: "#FDEBEC", accent: "#111827" },
    OS: { name: "Austrian Airlines", primary: "#E30613", secondary: "#FDEBEC", accent: "#111827" },
    SN: { name: "Brussels Airlines", primary: "#E31B23", secondary: "#FDEBEC", accent: "#111827" },
    EI: { name: "Aer Lingus", primary: "#008374", secondary: "#E7F6F4", accent: "#006272" },
    AY: { name: "Finnair", primary: "#002F6C", secondary: "#EAF1F8", accent: "#111827" },
    LO: { name: "LOT Polish Airlines", primary: "#003A70", secondary: "#EAF2F8", accent: "#D71920" },
    A3: { name: "Aegean Airlines", primary: "#005DAA", secondary: "#EAF4FB", accent: "#00A3E0" },
    PC: { name: "Pegasus Airlines", primary: "#F58220", secondary: "#FFF1E6", accent: "#111827" },
    XQ: { name: "SunExpress", primary: "#F9A01B", secondary: "#FFF4E0", accent: "#005DAA" },
    EW: { name: "Eurowings", primary: "#6D2077", secondary: "#F3ECF5", accent: "#00A3E0" },
    HV: { name: "Transavia", primary: "#00A94F", secondary: "#E8F8EF", accent: "#111827" },
    BY: { name: "TUI Airways", primary: "#70CBF4", secondary: "#EAF8FE", accent: "#D40E14" },
    LS: { name: "Jet2", primary: "#D71920", secondary: "#FDEDEE", accent: "#111827" },
    V7: { name: "Volotea", primary: "#E6007E", secondary: "#FCEAF5", accent: "#111827" },
    OU: { name: "Croatia Airlines", primary: "#005DAA", secondary: "#EAF4FB", accent: "#D71920" },
    UX: { name: "Air Europa", primary: "#003A70", secondary: "#EAF2F8", accent: "#00AEEF" },
    MU: { name: "China Eastern Airlines", primary: "#D71920", secondary: "#FDEDEE", accent: "#003A70" },
    CZ: { name: "China Southern Airlines", primary: "#005BAC", secondary: "#EAF3FB", accent: "#D71920" },
    CA: { name: "Air China", primary: "#D71920", secondary: "#FDEDEE", accent: "#F9C400" },
    "6E": { name: "IndiGo", primary: "#003A70", secondary: "#EAF2F8", accent: "#00A3E0" },
    NH: { name: "All Nippon Airways", primary: "#003A70", secondary: "#EAF2F8", accent: "#00A3E0" },
    JL: { name: "Japan Airlines", primary: "#D71920", secondary: "#FDEDEE", accent: "#111827" },
    KE: { name: "Korean Air", primary: "#00A3E0", secondary: "#EAF8FD", accent: "#003A70" },
    OZ: { name: "Asiana Airlines", primary: "#7A1E3A", secondary: "#F6EDF1", accent: "#B8975A" },
    CX: { name: "Cathay Pacific", primary: "#006564", secondary: "#E7F3F2", accent: "#111827" },
    SQ: { name: "Singapore Airlines", primary: "#00266B", secondary: "#EAF1F8", accent: "#F9A01B" },
    TG: { name: "Thai Airways", primary: "#4B2E83", secondary: "#F1EDF8", accent: "#C08A2D" },
    VN: { name: "Vietnam Airlines", primary: "#005DAA", secondary: "#EAF4FB", accent: "#C9A227" },
    VJ: { name: "VietJet Air", primary: "#E31B23", secondary: "#FDEBEC", accent: "#FFD100" },
    AK: { name: "AirAsia", primary: "#E31B23", secondary: "#FDEBEC", accent: "#111827" },
    MH: { name: "Malaysia Airlines", primary: "#003A70", secondary: "#EAF2F8", accent: "#D71920" },
    GA: { name: "Garuda Indonesia", primary: "#005DAA", secondary: "#EAF4FB", accent: "#00A3A3" },
    JT: { name: "Lion Air", primary: "#D71920", secondary: "#FDEDEE", accent: "#111827" },
    ID: { name: "Batik Air", primary: "#5C2D91", secondary: "#F2ECF8", accent: "#B8975A" },
    "5J": { name: "Cebu Pacific", primary: "#FFD100", secondary: "#FFF9D9", accent: "#00A651" },
    PR: { name: "Philippine Airlines", primary: "#003A70", secondary: "#EAF2F8", accent: "#D71920" },
    BR: { name: "EVA Air", primary: "#007A53", secondary: "#E8F5F0", accent: "#F9A01B" },
    CI: { name: "China Airlines", primary: "#005DAA", secondary: "#EAF4FB", accent: "#D71920" },
    JX: { name: "STARLUX Airlines", primary: "#7A5C3E", secondary: "#F4EFEA", accent: "#B8975A" },
    HU: { name: "Hainan Airlines", primary: "#B31B1B", secondary: "#F8EAEA", accent: "#C9A227" },
    MF: { name: "XiamenAir", primary: "#005DAA", secondary: "#EAF4FB", accent: "#00A3A3" },
    ZH: { name: "Shenzhen Airlines", primary: "#D71920", secondary: "#FDEDEE", accent: "#003A70" },
    "9C": { name: "Spring Airlines", primary: "#8DC63F", secondary: "#F1FAEA", accent: "#111827" },
    HO: { name: "Juneyao Air", primary: "#C8102E", secondary: "#FDECEF", accent: "#B8975A" },
    EK: { name: "Emirates", primary: "#D71920", secondary: "#FDEDEE", accent: "#111827" },
    QR: { name: "Qatar Airways", primary: "#5C0632", secondary: "#F6EDF2", accent: "#B8975A" },
    EY: { name: "Etihad Airways", primary: "#7A5C3E", secondary: "#F4EFEA", accent: "#B8975A" },
    SV: { name: "Saudia", primary: "#006C35", secondary: "#E8F5EF", accent: "#C9A227" },
};

export function getAirlineBrandTheme(airlineCode?: string | null): AirlineBrandTheme {
    const normalizedCode = airlineCode?.trim().toUpperCase() || "";
    const theme = AIRLINE_BRAND_THEMES[normalizedCode];

    if (!theme) return DEFAULT_FLIGHT_THEME;

    return {
        airlineCode: normalizedCode,
        ...theme,
    };
}

export function hexToRgb(hex: string) {
    const normalizedHex = hex.replace("#", "").trim();
    const fullHex =
        normalizedHex.length === 3
            ? normalizedHex
                  .split("")
                  .map((character) => `${character}${character}`)
                  .join("")
            : normalizedHex;

    if (!/^[0-9A-Fa-f]{6}$/.test(fullHex)) return null;

    return {
        r: Number.parseInt(fullHex.slice(0, 2), 16),
        g: Number.parseInt(fullHex.slice(2, 4), 16),
        b: Number.parseInt(fullHex.slice(4, 6), 16),
    };
}

function getLinearRgbChannel(channel: number) {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function getRelativeLuminance(hex: string) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;

    return (
        0.2126 * getLinearRgbChannel(rgb.r) +
        0.7152 * getLinearRgbChannel(rgb.g) +
        0.0722 * getLinearRgbChannel(rgb.b)
    );
}

export function getContrastRatio(foregroundHex: string, backgroundHex: string) {
    const foregroundLuminance = getRelativeLuminance(foregroundHex);
    const backgroundLuminance = getRelativeLuminance(backgroundHex);
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);

    return (lighter + 0.05) / (darker + 0.05);
}

export function getReadableTextColor(backgroundHex: string) {
    const whiteContrast = getContrastRatio("#FFFFFF", backgroundHex);
    const slateContrast = getContrastRatio("#0F172A", backgroundHex);

    return whiteContrast >= slateContrast ? "#FFFFFF" : "#0F172A";
}

export function ensureReadableColor({
    foreground,
    background,
    fallbackLight = "#FFFFFF",
    fallbackDark = "#0F172A",
}: {
    foreground?: string | null;
    background: string;
    fallbackLight?: string;
    fallbackDark?: string;
}) {
    if (foreground && getContrastRatio(foreground, background) >= 4.5) {
        return foreground;
    }

    return getContrastRatio(fallbackLight, background) >=
        getContrastRatio(fallbackDark, background)
        ? fallbackLight
        : fallbackDark;
}
