export type BrowserExtensionTrip = {
    id: string;
    slug: string;
    title: string;
    destination: string | null;
    startDate: string | null;
    endDate: string | null;
};

export type BrowserExtensionPrice = {
    amount: number | null;
    currency: string | null;
    basis: "total" | "per_night" | "per_person" | "unknown";
};

export type BrowserExtensionSource = {
    url: string;
    siteName: string;
    capturedAt: string;
};

export type BrowserExtensionHotelCapture = {
    type: "hotel";
    captureKind: "comparison" | "confirmed";
    name: string;
    address: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    postalCode: string | null;
    latitude: number | null;
    longitude: number | null;
    googlePlaceId: string | null;
    checkInDate: string;
    checkOutDate: string;
    roomType: string | null;
    guests: number | null;
    rooms: number | null;
    price: BrowserExtensionPrice;
    cancellationPolicy: string | null;
    freeCancellationEndsOn: string | null;
    paymentTerms: string | null;
    confirmationNumber: string | null;
    source: BrowserExtensionSource;
};

export type BrowserExtensionFlightLeg = {
    departureLocation: string;
    arrivalLocation: string;
    departureDate: string;
    arrivalDate: string;
    departureTime: string;
    arrivalTime: string;
    departureTimezone: string;
    arrivalTimezone: string;
    departureTerminal: string;
    arrivalTerminal: string;
    flightNumber: string;
    airlineName: string;
    cost: string;
    currency: string;
};

export type BrowserExtensionFlightCapture = {
    type: "flight";
    captureKind: "comparison" | "confirmed";
    label: string;
    isRoundTrip: boolean;
    returnLegCount: number;
    legs: BrowserExtensionFlightLeg[];
    price: BrowserExtensionPrice;
    cabinClass: string | null;
    baggageInfo: string | null;
    confirmationNumber: string | null;
    source: BrowserExtensionSource;
};

export type BrowserExtensionCapture =
    | BrowserExtensionHotelCapture
    | BrowserExtensionFlightCapture;

export type BrowserExtensionCaptureRequest = {
    tripId: string;
    capture: BrowserExtensionCapture;
};

export type BrowserExtensionCaptureResponse = {
    ok: true;
    destinationUrl: string;
    recordId?: string;
};
