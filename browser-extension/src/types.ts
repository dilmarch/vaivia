export type Price = {
    amount: number | null;
    currency: string | null;
    basis: "total" | "per_night" | "per_person" | "unknown";
};

export type CaptureSource = {
    url: string;
    siteName: string;
    capturedAt: string;
};

export type HotelCapture = {
    type: "hotel";
    captureKind: "comparison" | "confirmed";
    confidence: number;
    warnings: string[];
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
    price: Price;
    cancellationPolicy: string | null;
    freeCancellationEndsOn: string | null;
    paymentTerms: string | null;
    confirmationNumber: string | null;
    source: CaptureSource;
};

export type FlightLeg = {
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

export type FlightCapture = {
    type: "flight";
    captureKind: "comparison" | "confirmed";
    confidence: number;
    warnings: string[];
    label: string;
    isRoundTrip: boolean;
    returnLegCount: number;
    legs: FlightLeg[];
    price: Price;
    cabinClass: string | null;
    baggageInfo: string | null;
    confirmationNumber: string | null;
    source: CaptureSource;
};

export type TravelCapture = HotelCapture | FlightCapture;

export type VaiviaTrip = {
    id: string;
    slug: string;
    title: string;
    destination: string | null;
    startDate: string | null;
    endDate: string | null;
};

export type StoredSession = {
    accessToken: string;
    expiresAt: string;
};
