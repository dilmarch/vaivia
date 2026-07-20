import "./sidepanel.css";
import type { FlightCapture, FlightLeg, HotelCapture, StoredSession, TravelCapture, VaiviaTrip } from "./types";

const API_BASE_URL = (import.meta.env.VITE_VAIVIA_APP_URL || "https://app.thetravellinglinguist.com").replace(/\/$/, "");
const SESSION_KEY = "vaiviaSession";
const AUTO_DETECT_KEY = "vaiviaAutoDetect";
const PENDING_CAPTURE_KEY = "vaiviaPendingCapture";
const AUTO_DETECT_SCRIPT_ID = "vaivia-confirmation-detector";
const AUTO_DETECT_MATCHES = [
    "https://*.booking.com/*",
    "https://*.expedia.com/*",
    "https://*.expedia.ca/*",
    "https://*.hotels.com/*",
    "https://*.kayak.com/*",
    "https://*.kayak.ca/*",
    "https://*.aircanada.com/*",
    "https://*.westjet.com/*",
];

type PanelState = {
    session: StoredSession | null;
    trips: VaiviaTrip[];
    capture: TravelCapture | null;
    loading: boolean;
    saving: boolean;
    error: string | null;
    success: { message: string; destinationUrl: string } | null;
    autoDetect: boolean;
};

const state: PanelState = {
    session: null,
    trips: [],
    capture: null,
    loading: true,
    saving: false,
    error: null,
    success: null,
    autoDetect: false,
};

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("VAIVIA side panel root is missing.");
const appRoot = app;

function escapeHtml(value: unknown) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatTripDates(trip: VaiviaTrip) {
    return [trip.startDate, trip.endDate].filter(Boolean).join(" → ") || "Dates not set";
}

function getSelectedTripId() {
    return (document.querySelector<HTMLSelectElement>("#trip-id")?.value || "").trim();
}

function headerTemplate() {
    return `<header class="header"><div class="brand"><span class="mark">V</span><div><p class="eyebrow">Travel companion</p><p class="brand-title">VAIVIA</p></div></div>${
        state.session
            ? '<button class="icon-button" id="disconnect" type="button" title="Disconnect this browser">×</button>'
            : ""
    }</header>`;
}

function signedOutTemplate() {
    return `<section class="card"><div class="hero"><p class="eyebrow">Save while you browse</p><h1>Send travel options straight to VAIVIA.</h1><p class="muted">Connect your account, open a hotel or selected flight itinerary, and review the details before anything is saved.</p></div><div class="card-body"><button class="button full" id="connect" type="button">Connect to VAIVIA</button></div></section>`;
}

function autoDetectTemplate() {
    return `<div class="auto-detect"><div><p class="eyebrow">Booking detection</p><p class="muted">Prompt on supported confirmation pages</p></div><button class="toggle ${state.autoDetect ? "on" : ""}" id="auto-detect" type="button" role="switch" aria-checked="${state.autoDetect}" title="${state.autoDetect ? "Turn off" : "Turn on"} automatic booking detection"></button></div>`;
}

function loadingTemplate() {
    return '<section class="card empty"><div class="spinner"></div><h2>Reading this page</h2><p class="muted">Looking for hotel or flight details…</p></section>';
}

function tripOptionsTemplate() {
    if (!state.trips.length) return '<option value="">No active trips found</option>';
    return state.trips
        .map(
            (trip) =>
                `<option value="${escapeHtml(trip.id)}">${escapeHtml(trip.title)} · ${escapeHtml(formatTripDates(trip))}</option>`
        )
        .join("");
}

function warningsTemplate(capture: TravelCapture) {
    return capture.warnings.length
        ? `<div class="status warning"><ul class="warnings">${capture.warnings.map((warning) => `<li>• ${escapeHtml(warning)}</li>`).join("")}</ul></div>`
        : "";
}

function commonCaptureHeader(capture: TravelCapture, title: string) {
    const confirmed = capture.captureKind === "confirmed";
    return `<div class="capture-head"><div><p class="eyebrow">${capture.type === "hotel" ? "Stay detected" : "Flight detected"}</p><h2>${escapeHtml(title)}</h2><p class="muted">${Math.round(capture.confidence * 100)}% extraction confidence · ${escapeHtml(capture.source.siteName)}</p></div><span class="pill ${confirmed ? "confirmed" : ""}">${confirmed ? "Booked" : "Compare"}</span></div>`;
}

function hotelTemplate(capture: HotelCapture) {
    return `<section class="card">${commonCaptureHeader(capture, capture.name)}<form class="form" id="capture-form">${warningsTemplate(capture)}<div class="field"><label for="trip-id">VAIVIA trip</label><select class="input" id="trip-id" required>${tripOptionsTemplate()}</select></div><div class="field"><label for="hotel-name">Property name</label><input class="input" id="hotel-name" value="${escapeHtml(capture.name)}" required /></div><div class="field"><label for="hotel-address">Address</label><input class="input" id="hotel-address" value="${escapeHtml(capture.address || "")}" /></div><div class="grid"><div class="field"><label for="check-in">Check-in</label><input class="input" id="check-in" type="date" value="${escapeHtml(capture.checkInDate)}" required /></div><div class="field"><label for="check-out">Check-out</label><input class="input" id="check-out" type="date" value="${escapeHtml(capture.checkOutDate)}" required /></div><div class="field"><label for="price">${capture.price.basis === "per_night" ? "Nightly price" : "Total price"}</label><input class="input" id="price" type="number" min="0" step="0.01" value="${escapeHtml(capture.price.amount || "")}" /></div><div class="field"><label for="currency">Currency</label><input class="input" id="currency" maxlength="3" value="${escapeHtml(capture.price.currency || "")}" /></div></div><div class="field"><label for="room-type">Room</label><input class="input" id="room-type" value="${escapeHtml(capture.roomType || "")}" /></div><div class="field"><label for="cancellation">Cancellation</label><textarea class="input" id="cancellation" rows="2">${escapeHtml(capture.cancellationPolicy || "")}</textarea></div><button class="button full" type="submit" ${state.saving || !state.trips.length ? "disabled" : ""}>${state.saving ? "Adding…" : capture.captureKind === "confirmed" ? "Add booked stay to VAIVIA" : "Add to Compare Stays"}</button></form></section>`;
}

function legTemplate(leg: FlightLeg, index: number) {
    const field = (name: keyof FlightLeg, label: string, type = "text") =>
        `<div class="field"><label>${label}</label><input class="input" data-leg="${index}" data-field="${name}" type="${type}" value="${escapeHtml(leg[name])}" /></div>`;
    return `<div class="leg"><p class="leg-title">Segment ${index + 1}</p><div class="grid">${field("departureLocation", "From")}${field("arrivalLocation", "To")}${field("departureDate", "Departure date", "date")}${field("arrivalDate", "Arrival date", "date")}${field("departureTime", "Departure time", "time")}${field("arrivalTime", "Arrival time", "time")}${field("flightNumber", "Flight number")}${field("airlineName", "Airline")}</div></div>`;
}

function flightTemplate(capture: FlightCapture) {
    return `<section class="card">${commonCaptureHeader(capture, capture.label)}<form class="form" id="capture-form">${warningsTemplate(capture)}<div class="field"><label for="trip-id">VAIVIA trip</label><select class="input" id="trip-id" required>${tripOptionsTemplate()}</select></div><div class="field"><label for="flight-label">Option label</label><input class="input" id="flight-label" value="${escapeHtml(capture.label)}" /></div>${capture.legs.map(legTemplate).join("")}<div class="grid"><div class="field"><label for="price">Total price</label><input class="input" id="price" type="number" min="0" step="0.01" value="${escapeHtml(capture.price.amount || "")}" /></div><div class="field"><label for="currency">Currency</label><input class="input" id="currency" maxlength="3" value="${escapeHtml(capture.price.currency || "")}" /></div></div><button class="button full" type="submit" ${state.saving || !state.trips.length ? "disabled" : ""}>${state.saving ? "Adding…" : capture.captureKind === "confirmed" ? "Add booked flight to VAIVIA" : "Add to Compare Flights"}</button></form></section>`;
}

function emptyTemplate() {
    return `<section class="card empty"><div class="mark" style="margin:0 auto">?</div><h2>No travel option detected</h2><p class="muted">Open a hotel property page or a selected flight itinerary with dates and pricing visible, then try again.</p><button class="button secondary" id="scan" type="button">Scan this page again</button></section>`;
}

function render() {
    const status = `${state.error ? `<div class="status error">${escapeHtml(state.error)}</div>` : ""}${
        state.success
            ? `<div class="status success">${escapeHtml(state.success.message)} <button class="button secondary" id="open-vaivia" type="button">Open in VAIVIA</button></div>`
            : ""
    }`;
    let body = signedOutTemplate();

    if (state.session) {
        body = state.loading
            ? loadingTemplate()
            : state.capture?.type === "hotel"
              ? hotelTemplate(state.capture)
              : state.capture?.type === "flight"
                ? flightTemplate(state.capture)
                : emptyTemplate();
    }

    appRoot.innerHTML = `<div class="shell">${headerTemplate()}<div class="content">${status}${state.session ? autoDetectTemplate() : ""}${body}</div></div>`;
    bindEvents();
}

async function ensureLocalPermission() {
    const url = new URL(API_BASE_URL);
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return true;
    return chrome.permissions.request({ origins: [`${url.origin}/*`] });
}

function randomState() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function connect() {
    state.loading = true;
    state.error = null;
    render();

    try {
        if (!(await ensureLocalPermission())) throw new Error("VAIVIA permission was not granted.");
        const redirectUri = chrome.identity.getRedirectURL("vaivia");
        const oauthState = randomState();
        const connectUrl = new URL("/extension/connect", API_BASE_URL);
        connectUrl.searchParams.set("redirect_uri", redirectUri);
        connectUrl.searchParams.set("state", oauthState);
        const finalUrl = await chrome.identity.launchWebAuthFlow({
            url: connectUrl.toString(),
            interactive: true,
        });
        if (!finalUrl) throw new Error("VAIVIA did not complete the connection.");
        const callback = new URL(finalUrl);
        if (callback.searchParams.get("state") !== oauthState) {
            throw new Error("The VAIVIA connection could not be verified.");
        }
        const code = callback.searchParams.get("code");
        if (!code) throw new Error("VAIVIA did not return a connection code.");
        const response = await fetch(`${API_BASE_URL}/api/extension/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, extensionId: chrome.runtime.id }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not connect to VAIVIA.");
        state.session = {
            accessToken: payload.accessToken,
            expiresAt: payload.expiresAt,
        };
        await chrome.storage.local.set({ [SESSION_KEY]: state.session });
        await loadTrips();
        await scanActivePage();
    } catch (error) {
        state.error = error instanceof Error ? error.message : "Could not connect to VAIVIA.";
    } finally {
        state.loading = false;
        render();
    }
}

async function apiFetch(path: string, init?: RequestInit) {
    if (!state.session) throw new Error("Connect to VAIVIA first.");
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${state.session.accessToken}`,
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
            ...init?.headers,
        },
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
        state.session = null;
        await chrome.storage.local.remove(SESSION_KEY);
    }
    if (!response.ok) throw new Error(payload.error || "VAIVIA could not complete that request.");
    return payload;
}

async function loadTrips() {
    const payload = await apiFetch("/api/extension/trips");
    state.trips = Array.isArray(payload.trips) ? payload.trips : [];
}

async function scanActivePage() {
    state.loading = true;
    state.error = null;
    state.success = null;
    render();

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.id || !tab.url || /^(chrome|edge|about):/.test(tab.url)) {
            throw new Error("Chrome does not allow extensions to read this page.");
        }
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content-script.js"],
        });
        const result = await chrome.tabs.sendMessage(tab.id, { type: "VAIVIA_EXTRACT_PAGE" });
        if (!result?.ok) throw new Error(result?.error || "Could not read this page.");
        state.capture = result.capture || null;
    } catch (error) {
        state.capture = null;
        state.error = error instanceof Error ? error.message : "Could not read this page.";
    } finally {
        state.loading = false;
        render();
    }
}

function readHotelForm(capture: HotelCapture): HotelCapture {
    const amount = Number(document.querySelector<HTMLInputElement>("#price")?.value);
    return {
        ...capture,
        name: document.querySelector<HTMLInputElement>("#hotel-name")?.value.trim() || "",
        address: document.querySelector<HTMLInputElement>("#hotel-address")?.value.trim() || null,
        checkInDate: document.querySelector<HTMLInputElement>("#check-in")?.value || "",
        checkOutDate: document.querySelector<HTMLInputElement>("#check-out")?.value || "",
        roomType: document.querySelector<HTMLInputElement>("#room-type")?.value.trim() || null,
        cancellationPolicy:
            document.querySelector<HTMLTextAreaElement>("#cancellation")?.value.trim() || null,
        price: {
            ...capture.price,
            amount: Number.isFinite(amount) && amount > 0 ? amount : null,
            currency:
                document.querySelector<HTMLInputElement>("#currency")?.value.trim().toUpperCase() ||
                null,
        },
    };
}

function readFlightForm(capture: FlightCapture): FlightCapture {
    const legs = capture.legs.map((leg) => ({ ...leg }));
    document.querySelectorAll<HTMLInputElement>("[data-leg][data-field]").forEach((input) => {
        const index = Number(input.dataset.leg);
        const field = input.dataset.field as keyof FlightLeg;
        if (legs[index] && field) legs[index][field] = input.value.trim();
    });
    const amount = Number(document.querySelector<HTMLInputElement>("#price")?.value);
    return {
        ...capture,
        label: document.querySelector<HTMLInputElement>("#flight-label")?.value.trim() || capture.label,
        legs,
        price: {
            ...capture.price,
            amount: Number.isFinite(amount) && amount > 0 ? amount : null,
            currency:
                document.querySelector<HTMLInputElement>("#currency")?.value.trim().toUpperCase() ||
                null,
        },
    };
}

async function saveCapture(event: SubmitEvent) {
    event.preventDefault();
    if (!state.capture) return;
    const tripId = getSelectedTripId();
    if (!tripId) {
        state.error = "Choose a VAIVIA trip first.";
        render();
        return;
    }

    state.saving = true;
    state.error = null;
    state.success = null;
    const capture =
        state.capture.type === "hotel"
            ? readHotelForm(state.capture)
            : readFlightForm(state.capture);
    state.capture = capture;
    render();

    try {
        const payload = await apiFetch("/api/extension/captures", {
            method: "POST",
            body: JSON.stringify({ tripId, capture }),
        });
        state.success = {
            message:
                capture.captureKind === "confirmed"
                    ? "Booked travel added to VAIVIA."
                    : `${capture.type === "hotel" ? "Stay" : "Flight"} option added to VAIVIA.`,
            destinationUrl: payload.destinationUrl,
        };
    } catch (error) {
        state.error = error instanceof Error ? error.message : "Could not save this travel option.";
    } finally {
        state.saving = false;
        render();
    }
}

async function disconnect() {
    try {
        if (state.session) await apiFetch("/api/extension/token", { method: "DELETE" });
    } catch {
        // Removing the local token still disconnects this browser UI.
    }
    await chrome.storage.local.remove(SESSION_KEY);
    state.session = null;
    state.trips = [];
    state.capture = null;
    state.error = null;
    state.success = null;
    render();
}

async function setAutoDetection(enabled: boolean) {
    state.error = null;
    try {
        if (enabled) {
            const granted = await chrome.permissions.request({ origins: AUTO_DETECT_MATCHES });
            if (!granted) throw new Error("Automatic booking detection permission was not granted.");
            const registered = await chrome.scripting.getRegisteredContentScripts();
            if (!registered.some((script) => script.id === AUTO_DETECT_SCRIPT_ID)) {
                await chrome.scripting.registerContentScripts([
                    {
                        id: AUTO_DETECT_SCRIPT_ID,
                        matches: AUTO_DETECT_MATCHES,
                        js: ["content-script.js"],
                        runAt: "document_idle",
                        persistAcrossSessions: true,
                    },
                ]);
            }
        } else {
            const registered = await chrome.scripting.getRegisteredContentScripts();
            if (registered.some((script) => script.id === AUTO_DETECT_SCRIPT_ID)) {
                await chrome.scripting.unregisterContentScripts({ ids: [AUTO_DETECT_SCRIPT_ID] });
            }
            await chrome.permissions.remove({ origins: AUTO_DETECT_MATCHES });
        }
        state.autoDetect = enabled;
        await chrome.storage.local.set({ [AUTO_DETECT_KEY]: enabled });
    } catch (error) {
        state.error = error instanceof Error ? error.message : "Could not change booking detection.";
    }
    render();
}

function bindEvents() {
    document.querySelector("#connect")?.addEventListener("click", () => void connect());
    document.querySelector("#disconnect")?.addEventListener("click", () => void disconnect());
    document.querySelector("#scan")?.addEventListener("click", () => void scanActivePage());
    document.querySelector("#auto-detect")?.addEventListener("click", () =>
        void setAutoDetection(!state.autoDetect)
    );
    document.querySelector<HTMLFormElement>("#capture-form")?.addEventListener("submit", (event) =>
        void saveCapture(event as SubmitEvent)
    );
    document.querySelector("#open-vaivia")?.addEventListener("click", () => {
        if (state.success) void chrome.tabs.create({ url: `${API_BASE_URL}${state.success.destinationUrl}` });
    });
}

async function initialize() {
    const stored = await chrome.storage.local.get(SESSION_KEY);
    const settings = await chrome.storage.local.get(AUTO_DETECT_KEY);
    state.autoDetect = settings[AUTO_DETECT_KEY] === true;
    const pending = await chrome.storage.session.get(PENDING_CAPTURE_KEY);
    const pendingCapture = pending[PENDING_CAPTURE_KEY] as TravelCapture | undefined;
    if (pendingCapture) {
        state.capture = pendingCapture;
        await chrome.storage.session.remove(PENDING_CAPTURE_KEY);
    }
    const session = stored[SESSION_KEY] as StoredSession | undefined;
    if (session?.accessToken && new Date(session.expiresAt).getTime() > Date.now()) {
        state.session = session;
        try {
            await loadTrips();
            if (!pendingCapture) await scanActivePage();
        } catch (error) {
            state.error = error instanceof Error ? error.message : "Could not load VAIVIA.";
        }
    }
    state.loading = false;
    render();
}


chrome.storage.onChanged.addListener((changes, areaName) => {
    const change = changes[PENDING_CAPTURE_KEY];
    if (areaName !== "session" || !change?.newValue) return;
    state.capture = change.newValue as TravelCapture;
    state.loading = false;
    state.error = null;
    state.success = null;
    void chrome.storage.session.remove(PENDING_CAPTURE_KEY);
    render();
});

render();
void initialize();
