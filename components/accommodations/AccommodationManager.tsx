"use client";

import {
    Bed,
    Building2,
    CircleHelp,
    ExternalLink,
    Hotel,
    House,
    Lock,
    MapPin,
    Pencil,
    Plus,
    Trash2,
    Users,
    X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import AnimatedModal from "@/components/AnimatedModal";
import CostAllocationFields from "@/components/budget/CostAllocationFields";
import MoveTripItemButton from "@/components/MoveTripItemButton";
import PlaceAutocompleteInput from "@/components/places/PlaceAutocompleteInput";
import TripAudienceSelector from "@/components/TripAudienceSelector";
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";
import {
    ACCOMMODATION_STATUS_OPTIONS,
    ACCOMMODATION_TYPE_OPTIONS,
    getAccommodationStatusLabel,
    getAccommodationTypeLabel,
    type AccommodationActionResult,
    type AccommodationType,
    type TripAccommodation,
} from "@/lib/accommodations";
import { COMMON_CURRENCIES, formatCurrency } from "@/lib/budget";
import type { MoveTargetTrip } from "@/lib/tripMove";
import type { TripAudienceOption } from "@/lib/tripAudience";
import { getInitials } from "@/lib/travelers";

export type AccommodationAudienceParticipant = {
    item_id: string;
    participant_kind?: string | null;
    trip_member_id?: string | null;
    invitation_id?: string | null;
    family_member_id?: string | null;
    guest_name?: string | null;
};

type AccommodationManagerProps = {
    tripId: string;
    accommodations: TripAccommodation[];
    createAction: (formData: FormData) => Promise<AccommodationActionResult>;
    updateAction: (formData: FormData) => Promise<AccommodationActionResult>;
    deleteAction: (formData: FormData) => Promise<void>;
    moveItemAction?: (formData: FormData) => Promise<void>;
    moveTargetTrips?: MoveTargetTrip[];
    audienceOptions?: TripAudienceOption[];
    audienceParticipants?: AccommodationAudienceParticipant[];
    currentUserTripMemberId?: string | null;
};

type PlaceFields = Pick<
    TripAccommodation,
    | "google_place_id"
    | "google_maps_url"
    | "address"
    | "address_line_1"
    | "address_line_2"
    | "city"
    | "region"
    | "country"
    | "postal_code"
    | "latitude"
    | "longitude"
    | "website"
>;

type ModalMode =
    { type: "add"; accommodation?: null } | { type: "edit"; accommodation: TripAccommodation };

type GooglePlacePhotoState = {
    url: string;
    sourceUrl?: string | null;
    authors: Array<{
        displayName: string;
        uri?: string | null;
    }>;
};

function parseLegacyGooglePhotoAuthors(htmlAttributions: string[]) {
    return htmlAttributions
        .map((html) => {
            const attributionDocument = new DOMParser().parseFromString(html, "text/html");
            const link = attributionDocument.querySelector("a");
            const displayName = attributionDocument.body.textContent?.trim() || "";
            if (!displayName) return null;
            return {
                displayName,
                uri: link?.href || null,
            };
        })
        .filter((author): author is { displayName: string; uri: string | null } => Boolean(author));
}

function loadLegacyGooglePlacePhoto({
    placeId,
    fallbackSourceUrl,
}: {
    placeId: string;
    fallbackSourceUrl?: string | null;
}) {
    return new Promise<GooglePlacePhotoState | null>((resolve, reject) => {
        const service = new window.google.maps.places.PlacesService(document.createElement("div"));
        service.getDetails(
            {
                placeId,
                fields: ["photos", "url"],
            },
            (place, status) => {
                if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place) {
                    reject(new Error(`Google Places photo lookup failed: ${status}`));
                    return;
                }

                const placePhoto = place.photos?.[0];
                if (!placePhoto) {
                    resolve(null);
                    return;
                }

                resolve({
                    url: placePhoto.getUrl({ maxWidth: 1200, maxHeight: 640 }),
                    sourceUrl: place.url || fallbackSourceUrl,
                    authors: parseLegacyGooglePhotoAuthors(placePhoto.html_attributions),
                });
            },
        );
    });
}

const PLACE_FIELD_NAMES = [
    "google_place_id",
    "google_maps_url",
    "address_line_1",
    "address_line_2",
    "city",
    "region",
    "country",
    "postal_code",
    "latitude",
    "longitude",
] as const satisfies ReadonlyArray<Exclude<keyof PlaceFields, "address" | "website">>;

const inputClass =
    "w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50 focus:bg-white/[0.12] focus:ring-2 focus:ring-lime-300/20 [color-scheme:dark]";
const labelClass = "text-xs font-black uppercase tracking-[0.22em] text-lime-200/80";
const modalBodyClass = "space-y-5 bg-[#080511] p-6 text-white";
const secondaryButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14] hover:text-white";
const EMPTY_AUDIENCE_PARTICIPANTS: AccommodationAudienceParticipant[] = [];

function GooglePlaceCoverPhoto({
    accommodation,
    isGoogleReady,
}: {
    accommodation: TripAccommodation;
    isGoogleReady: boolean;
}) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [shouldLoad, setShouldLoad] = useState(false);
    const [photo, setPhoto] = useState<GooglePlacePhotoState | null>(null);

    useEffect(() => {
        const element = containerRef.current;
        if (!element || shouldLoad) return;

        if (!("IntersectionObserver" in window)) {
            setShouldLoad(true);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                setShouldLoad(true);
                observer.disconnect();
            },
            { rootMargin: "180px" },
        );
        observer.observe(element);

        return () => observer.disconnect();
    }, [shouldLoad]);

    useEffect(() => {
        if (!shouldLoad || !isGoogleReady || !accommodation.google_place_id) {
            return;
        }

        let isActive = true;

        async function loadPhoto() {
            let nextPhoto: GooglePlacePhotoState | null = null;
            try {
                const { Place } = (await window.google.maps.importLibrary(
                    "places",
                )) as google.maps.PlacesLibrary;
                const place = new Place({ id: accommodation.google_place_id! });
                const { place: fetchedPlace } = await place.fetchFields({
                    fields: ["photos", "googleMapsURI"],
                });

                const placePhoto = fetchedPlace.photos?.[0];
                if (placePhoto) {
                    nextPhoto = {
                        url: placePhoto.getURI({
                            maxWidth: 1200,
                            maxHeight: 640,
                        }),
                        sourceUrl:
                            placePhoto.googleMapsURI ||
                            fetchedPlace.googleMapsURI ||
                            accommodation.google_maps_url,
                        authors: placePhoto.authorAttributions.map((author) => ({
                            displayName: author.displayName,
                            uri: author.uri,
                        })),
                    };
                }
            } catch (newPlacesError) {
                if (process.env.NODE_ENV === "development") {
                    console.warn(
                        "Google Places (New) photo lookup failed; trying the existing Places service:",
                        {
                            placeId: accommodation.google_place_id,
                            error: newPlacesError,
                        },
                    );
                }
            }

            if (!nextPhoto) {
                try {
                    nextPhoto = await loadLegacyGooglePlacePhoto({
                        placeId: accommodation.google_place_id!,
                        fallbackSourceUrl: accommodation.google_maps_url,
                    });
                } catch (legacyPlacesError) {
                    if (process.env.NODE_ENV === "development") {
                        console.warn("Could not load Google Place accommodation photo:", {
                            placeId: accommodation.google_place_id,
                            error: legacyPlacesError,
                        });
                    }
                }
            }

            if (isActive && nextPhoto) setPhoto(nextPhoto);
        }

        void loadPhoto();
        return () => {
            isActive = false;
        };
    }, [accommodation.google_maps_url, accommodation.google_place_id, isGoogleReady, shouldLoad]);

    const photoSourceUrl = photo?.sourceUrl || accommodation.google_maps_url;

    return (
        <div
            ref={containerRef}
            className="relative h-44 overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.2),transparent_52%),linear-gradient(135deg,#172033,#03030a_70%)]"
        >
            <div className="absolute inset-0 flex items-center justify-center">
                <Hotel className="h-10 w-10 text-lime-200/35" aria-hidden="true" />
            </div>
            {photo ? (
                // Google photo URIs must be used fresh and must not be proxied or cached.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={photo.url}
                    alt={`${accommodation.hotel_name} from Google Maps`}
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={() => setPhoto(null)}
                />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-slate-950/10" />

            {photo && photoSourceUrl ? (
                <div className="absolute bottom-2 right-2 max-w-[calc(100%_-_1rem)] truncate rounded-full bg-slate-950/80 px-2.5 py-1 text-[9px] font-bold text-white shadow-lg backdrop-blur-sm">
                    {photo.authors.length > 0 ? (
                        <>
                            Photo by{" "}
                            {photo.authors.map((author, index) => (
                                <span key={`${author.displayName}-${index}`}>
                                    {index > 0 ? ", " : ""}
                                    {author.uri ? (
                                        <a
                                            href={author.uri}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="underline decoration-white/50 underline-offset-2 hover:text-lime-200"
                                        >
                                            {author.displayName}
                                        </a>
                                    ) : (
                                        author.displayName
                                    )}
                                </span>
                            ))}
                            <span aria-hidden="true"> · </span>
                        </>
                    ) : null}
                    <a
                        href={photoSourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-white/50 underline-offset-2 hover:text-lime-200"
                    >
                        Google Maps
                    </a>
                </div>
            ) : null}
        </div>
    );
}

const ACCOMMODATION_TYPE_ICONS: Record<AccommodationType, typeof Hotel> = {
    hotel: Hotel,
    motel: Building2,
    home_rental: House,
    hostel: Bed,
    friend_family: Users,
    other: CircleHelp,
};

function getAddressComponent(
    place: google.maps.places.PlaceResult,
    type: string,
    format: "long_name" | "short_name" = "long_name",
) {
    return (
        place.address_components?.find((component) => component.types.includes(type))?.[format] ||
        ""
    );
}

function getStreetAddress(place: google.maps.places.PlaceResult) {
    const streetNumber = getAddressComponent(place, "street_number");
    const route = getAddressComponent(place, "route");
    return [streetNumber, route].filter(Boolean).join(" ");
}

function buildPlaceFields(place: google.maps.places.PlaceResult): PlaceFields {
    return {
        google_place_id: place.place_id || null,
        google_maps_url: place.url || null,
        address: place.formatted_address || null,
        address_line_1: getStreetAddress(place) || null,
        address_line_2: getAddressComponent(place, "subpremise") || null,
        city:
            getAddressComponent(place, "locality") ||
            getAddressComponent(place, "postal_town") ||
            getAddressComponent(place, "administrative_area_level_2") ||
            null,
        region: getAddressComponent(place, "administrative_area_level_1") || null,
        country: getAddressComponent(place, "country") || null,
        postal_code: getAddressComponent(place, "postal_code") || null,
        latitude: place.geometry?.location?.lat() ?? null,
        longitude: place.geometry?.location?.lng() ?? null,
        website: place.website || null,
    };
}

function getInitialPlaceFields(accommodation?: TripAccommodation | null): PlaceFields {
    return {
        google_place_id: accommodation?.google_place_id || null,
        google_maps_url: accommodation?.google_maps_url || null,
        address: accommodation?.address || null,
        address_line_1: accommodation?.address_line_1 || null,
        address_line_2: accommodation?.address_line_2 || null,
        city: accommodation?.city || null,
        region: accommodation?.region || null,
        country: accommodation?.country || null,
        postal_code: accommodation?.postal_code || null,
        latitude: accommodation?.latitude || null,
        longitude: accommodation?.longitude || null,
        website: accommodation?.website || null,
    };
}

function formatDisplayDate(value: string) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(date);
}

function formatDisplayTime(value?: string | null) {
    if (!value) return "";
    const [hourText, minuteText] = value.split(":");
    const date = new Date();
    date.setHours(Number(hourText), Number(minuteText), 0, 0);
    return new Intl.DateTimeFormat("en", {
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function formValue(value: string | number | null | undefined) {
    return value == null ? "" : String(value);
}

function participantMatchesOption(
    participant: AccommodationAudienceParticipant,
    option: TripAudienceOption,
) {
    if (option.kind === "member") {
        return participant.trip_member_id === option.id;
    }
    if (option.kind === "invitation") {
        return participant.invitation_id === option.id;
    }
    if (option.kind === "family_member") {
        return participant.family_member_id === option.id;
    }
    return participant.guest_name === option.displayName;
}

function getAccommodationAudienceOptions({
    accommodation,
    options,
    participants,
    currentUserTripMemberId,
}: {
    accommodation: TripAccommodation;
    options: TripAudienceOption[];
    participants: AccommodationAudienceParticipant[];
    currentUserTripMemberId?: string | null;
}) {
    const audienceMode = accommodation.audience_mode || "everyone";
    if (audienceMode === "everyone") return options;

    const selectedOptions = options.filter((option) =>
        participants.some((participant) => participantMatchesOption(participant, option)),
    );
    if (selectedOptions.length > 0 || audienceMode === "custom") {
        return selectedOptions;
    }

    return currentUserTripMemberId
        ? options.filter(
              (option) => option.kind === "member" && option.id === currentUserTripMemberId,
          )
        : options.filter((option) => option.kind === "member" && option.isCurrentUser);
}

function AccommodationAudienceAvatars({
    accommodation,
    options,
    participants,
    currentUserTripMemberId,
}: {
    accommodation: TripAccommodation;
    options: TripAudienceOption[];
    participants: AccommodationAudienceParticipant[];
    currentUserTripMemberId?: string | null;
}) {
    const selectedOptions = getAccommodationAudienceOptions({
        accommodation,
        options,
        participants,
        currentUserTripMemberId,
    });
    const guestNames = participants
        .filter(
            (participant) =>
                participant.participant_kind === "guest" && Boolean(participant.guest_name),
        )
        .map((participant) => participant.guest_name as string);
    const people = [
        ...selectedOptions.map((option) => ({
            key: `${option.kind}:${option.id}`,
            displayName: option.displayName,
            avatarUrl: option.avatarUrl || null,
            isInvited: option.status === "invited",
        })),
        ...guestNames.map((displayName) => ({
            key: `guest:${displayName}`,
            displayName,
            avatarUrl: null,
            isInvited: false,
        })),
    ].filter(
        (person, index, allPeople) =>
            allPeople.findIndex((candidate) => candidate.key === person.key) === index,
    );

    if (people.length === 0) return null;

    const visiblePeople = people.slice(0, 5);
    const extraCount = people.length - visiblePeople.length;
    const names = people.map((person) => person.displayName).join(", ");

    return (
        <div
            className="ml-auto flex shrink-0 items-center -space-x-2"
            role="group"
            aria-label={`Booked for ${names}`}
        >
            {visiblePeople.map((person) => (
                <span
                    key={person.key}
                    title={person.displayName}
                    className={`relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-[#03030a] text-[10px] font-black uppercase shadow-lg ${
                        person.isInvited
                            ? "bg-amber-300 text-slate-950"
                            : "bg-slate-800 text-lime-200"
                    }`}
                >
                    {person.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                        getInitials(person.displayName)
                    )}
                </span>
            ))}
            {extraCount > 0 ? (
                <span
                    className="relative flex h-9 min-w-9 items-center justify-center rounded-full border-2 border-[#03030a] bg-lime-300 px-1.5 text-[10px] font-black text-slate-950 shadow-lg"
                    title={`${extraCount} more travelers`}
                >
                    +{extraCount}
                </span>
            ) : null}
        </div>
    );
}

function AccommodationForm({
    tripId,
    mode,
    action,
    moveItemAction,
    moveTargetTrips,
    audienceOptions = [],
    audienceParticipants = [],
    currentUserTripMemberId = null,
    onClose,
}: {
    tripId: string;
    mode: ModalMode;
    action: (formData: FormData) => Promise<AccommodationActionResult>;
    moveItemAction?: (formData: FormData) => Promise<void>;
    moveTargetTrips?: MoveTargetTrip[];
    audienceOptions?: TripAudienceOption[];
    audienceParticipants?: AccommodationAudienceParticipant[];
    currentUserTripMemberId?: string | null;
    onClose: () => void;
}) {
    const accommodation = mode.type === "edit" ? mode.accommodation : null;
    const [hotelName, setHotelName] = useState(accommodation?.hotel_name || "");
    const [address, setAddress] = useState(accommodation?.address || "");
    const [website, setWebsite] = useState(accommodation?.website || "");
    const [type, setType] = useState<AccommodationType>(
        accommodation?.accommodation_type || "other",
    );
    const [placeFields, setPlaceFields] = useState<PlaceFields>(() =>
        getInitialPlaceFields(accommodation),
    );
    const [costAmount, setCostAmount] = useState(formValue(accommodation?.cost));
    const [errors, setErrors] = useState<string[]>([]);
    const [isSaving, startSavingTransition] = useTransition();
    const isSubmittingRef = useRef(false);
    const selectedAudienceOptions = accommodation
        ? getAccommodationAudienceOptions({
              accommodation,
              options: audienceOptions,
              participants: audienceParticipants.filter(
                  (participant) => participant.item_id === accommodation.id,
              ),
              currentUserTripMemberId,
          })
        : [];

    function handlePlaceSelect(place: google.maps.places.PlaceResult) {
        if (!place.place_id) {
            if (process.env.NODE_ENV === "development") {
                console.warn("Google place selection did not include a place_id:", {
                    name: place.name,
                    formattedAddress: place.formatted_address,
                    types: place.types,
                });
            }
            return;
        }

        const fields = buildPlaceFields(place);
        const placeName = place.name || place.formatted_address || "";

        setPlaceFields(fields);
        setHotelName(placeName);
        setAddress(fields.address || "");
        setWebsite(fields.website || "");
    }

    function hydrateFormData(formData: FormData) {
        formData.set("trip_id", tripId);
        if (accommodation) formData.set("accommodation_id", accommodation.id);
        formData.set("hotel_name", hotelName);
        formData.set("address", address);
        formData.set("website", website);

        PLACE_FIELD_NAMES.forEach((fieldName) => {
            formData.set(fieldName, formValue(placeFields[fieldName]));
        });
    }

    function validate(formData: FormData) {
        const nextErrors: string[] = [];
        const checkInDate = String(formData.get("check_in_date") || "");
        const checkOutDate = String(formData.get("check_out_date") || "");
        const freeCancellationEndsOn = String(formData.get("free_cancellation_ends_on") || "");
        const checkInStart = String(formData.get("check_in_time_start") || "");
        const checkInEnd = String(formData.get("check_in_time_end") || "");
        const websiteValue = String(formData.get("website") || "").trim();

        if (!String(formData.get("hotel_name") || "").trim()) {
            nextErrors.push("Accommodation name is required.");
        }
        if (!checkInDate) nextErrors.push("Check-in date is required.");
        if (!checkOutDate) nextErrors.push("Check-out date is required.");
        if (checkInDate && checkOutDate && checkOutDate <= checkInDate) {
            nextErrors.push("Check-out date must be after check-in date.");
        }
        if (freeCancellationEndsOn && checkInDate && freeCancellationEndsOn > checkInDate) {
            nextErrors.push("Free cancellation must end on or before check-in.");
        }
        if (checkInStart && checkInEnd && checkInEnd <= checkInStart) {
            nextErrors.push("Check-in end time must be after check-in start time.");
        }
        if (
            websiteValue &&
            !/^https?:\/\/\S+\.\S+/i.test(
                /^https?:\/\//i.test(websiteValue) ? websiteValue : `https://${websiteValue}`,
            )
        ) {
            nextErrors.push("Website must be a valid URL.");
        }
        const costValue = String(formData.get("cost") || "").trim();
        if (costValue) {
            const cost = Number(costValue.replace(/,/g, ""));
            if (!Number.isFinite(cost) || cost <= 0) {
                nextErrors.push("Cost must be greater than 0.");
            }
        }

        setErrors(nextErrors);
        return nextErrors.length === 0;
    }

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                if (isSubmittingRef.current) return;

                const formData = new FormData(event.currentTarget);
                hydrateFormData(formData);
                if (!validate(formData)) return;

                isSubmittingRef.current = true;
                startSavingTransition(() => {
                    void action(formData)
                        .then((result) => {
                            if (!result.ok) {
                                isSubmittingRef.current = false;
                                setErrors([result.error]);
                                return;
                            }

                            onClose();
                        })
                        .catch((error: unknown) => {
                            isSubmittingRef.current = false;
                            const message =
                                error instanceof Error
                                    ? error.message
                                    : "Could not save accommodation.";
                            setErrors([message]);
                        });
                });
            }}
            className={modalBodyClass}
        >
            <input type="hidden" name="trip_id" value={tripId} />
            {accommodation ? (
                <input type="hidden" name="accommodation_id" value={accommodation.id} />
            ) : null}
            {PLACE_FIELD_NAMES.map((fieldName) => (
                <input
                    key={fieldName}
                    type="hidden"
                    name={fieldName}
                    value={formValue(placeFields[fieldName])}
                />
            ))}

            {errors.length > 0 ? (
                <div className="rounded-2xl border border-red-300/40 bg-red-950/80 p-4 text-sm font-semibold text-red-50">
                    {errors.map((error) => (
                        <p key={error}>{error}</p>
                    ))}
                </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 md:col-span-2">
                    <span className={labelClass}>Hotel / accommodation name</span>
                    <PlaceAutocompleteInput
                        id="hotelName"
                        value={hotelName}
                        onInputChange={setHotelName}
                        onPlaceSelect={handlePlaceSelect}
                        placeholder="Search Google Maps or enter a city/address"
                        required
                        className={inputClass}
                    />
                    <input type="hidden" name="hotel_name" value={hotelName} />
                    <span className="block text-xs font-bold text-slate-400">
                        Google Maps is optional. You can enter a hotel, residence, address, or city
                        for planning.
                    </span>
                </label>

                <label className="space-y-2 md:col-span-2">
                    <span className={labelClass}>Address</span>
                    <textarea
                        name="address"
                        value={address}
                        onChange={(event) => setAddress(event.target.value)}
                        rows={3}
                        className={inputClass}
                    />
                </label>

                <label className="space-y-2">
                    <span className={labelClass}>Check-in date</span>
                    <DateInput
                        name="check_in_date"
                        defaultValue={accommodation?.check_in_date || ""}
                        required
                        className={inputClass}
                    />
                </label>

                <label className="space-y-2">
                    <span className={labelClass}>Check-out date</span>
                    <DateInput
                        name="check_out_date"
                        defaultValue={accommodation?.check_out_date || ""}
                        required
                        className={inputClass}
                    />
                </label>

                <label className="space-y-2 md:col-span-2">
                    <span className={labelClass}>Free cancellation ends</span>
                    <DateInput
                        name="free_cancellation_ends_on"
                        defaultValue={accommodation?.free_cancellation_ends_on || ""}
                        className={inputClass}
                    />
                    <span className="block text-xs font-bold text-slate-400">
                        Optional. VAIVIA can remind you 48 hours before this date.
                    </span>
                </label>

                <div className="grid gap-4 md:col-span-2 md:grid-cols-3">
                    <label className="space-y-2">
                        <span className={labelClass}>Check-in time start</span>
                        <TimeInput
                            name="check_in_time_start"
                            defaultValue={accommodation?.check_in_time_start || ""}
                            className={inputClass}
                        />
                    </label>

                    <label className="space-y-2">
                        <span className={labelClass}>Check-in time end</span>
                        <TimeInput
                            name="check_in_time_end"
                            defaultValue={accommodation?.check_in_time_end || ""}
                            onBlur={(event) => {
                                if (
                                    event.currentTarget.value === "00:00" ||
                                    event.currentTarget.value === "00:00:00"
                                ) {
                                    event.currentTarget.value = "23:59";
                                }
                            }}
                            className={inputClass}
                        />
                    </label>

                    <label className="space-y-2">
                        <span className={labelClass}>Check-out time</span>
                        <TimeInput
                            name="check_out_time"
                            defaultValue={accommodation?.check_out_time || ""}
                            className={inputClass}
                        />
                    </label>
                </div>

                <fieldset className="space-y-2 md:col-span-2">
                    <legend className={labelClass}>Accommodation type</legend>
                    <input type="hidden" name="accommodation_type" value={type} />
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {ACCOMMODATION_TYPE_OPTIONS.map((option) => {
                            const Icon = ACCOMMODATION_TYPE_ICONS[option.value];
                            const isSelected = type === option.value;

                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => setType(option.value)}
                                    className={`group flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-center transition ${
                                        isSelected
                                            ? "border-lime-300 bg-lime-300 text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)]"
                                            : "border-white/10 bg-white/[0.08] text-slate-200 hover:border-lime-300/35 hover:bg-white/[0.13] hover:text-white"
                                    }`}
                                >
                                    <span
                                        className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition ${
                                            isSelected
                                                ? "border-slate-950/10 bg-slate-950 text-lime-200"
                                                : "border-white/10 bg-slate-950/70 text-lime-200 group-hover:border-lime-300/25"
                                        }`}
                                    >
                                        <Icon className="h-5 w-5" aria-hidden="true" />
                                    </span>
                                    <span className="text-xs font-black uppercase tracking-[0.14em]">
                                        {option.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </fieldset>

                <label className="space-y-2">
                    <span className={labelClass}>Status</span>
                    <select
                        name="status"
                        defaultValue={accommodation?.status || "tentative"}
                        className={inputClass}
                    >
                        {ACCOMMODATION_STATUS_OPTIONS.map((option) => (
                            <option
                                key={option.value}
                                value={option.value}
                                className="bg-slate-950 text-white"
                            >
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>

                <div className="md:col-span-2">
                    <TripAudienceSelector
                        options={audienceOptions}
                        currentUserTripMemberId={currentUserTripMemberId}
                        initialAudienceMode={accommodation?.audience_mode || "everyone"}
                        initialSelectedOptions={selectedAudienceOptions}
                        heading="Guests"
                        description="Choose everyone, just yourself, or select individual guests for this accommodation."
                        alwaysShowOptions
                        privateSectionId="accommodation-private-section"
                    />
                </div>

                <div className="grid gap-3 md:col-span-2 md:grid-cols-[1fr_180px]">
                    <label className="space-y-2">
                        <span className={labelClass}>Cost</span>
                        <input
                            type="number"
                            name="cost"
                            min="0"
                            step="0.01"
                            value={costAmount}
                            onChange={(event) => setCostAmount(event.target.value)}
                            placeholder="0.00"
                            className={inputClass}
                        />
                    </label>
                    <label className="space-y-2">
                        <span className={labelClass}>Currency</span>
                        <select
                            name="currency"
                            defaultValue={accommodation?.currency || "CAD"}
                            className={inputClass}
                        >
                            {COMMON_CURRENCIES.map((currency) => (
                                <option
                                    key={currency}
                                    value={currency}
                                    className="bg-slate-950 text-white"
                                >
                                    {currency}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="md:col-span-2">
                    <CostAllocationFields
                        amount={costAmount}
                        participants={audienceOptions}
                        currentUserTripMemberId={currentUserTripMemberId}
                        tone="dark"
                    />
                </div>

                <label className="space-y-2 md:col-span-2">
                    <span className={labelClass}>Website</span>
                    <input
                        type="text"
                        name="website"
                        value={website}
                        onChange={(event) => setWebsite(event.target.value)}
                        placeholder="https://example.com"
                        className={inputClass}
                    />
                </label>

                <label
                    id="accommodation-private-section"
                    className="flex scroll-mt-24 items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4 md:col-span-2"
                >
                    <input
                        type="checkbox"
                        name="is_private"
                        defaultChecked={Boolean(accommodation?.is_private)}
                        className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950 text-lime-300"
                    />
                    <span>
                        <span className="block text-sm font-black text-white">
                            Private accommodation
                        </span>
                        <span className="text-sm font-semibold text-slate-400">
                            Private accommodations are only visible to you.
                        </span>
                    </span>
                </label>

                <label className="space-y-2 md:col-span-2">
                    <span className={labelClass}>Notes</span>
                    <textarea
                        name="notes"
                        defaultValue={accommodation?.notes || ""}
                        rows={4}
                        className={inputClass}
                    />
                </label>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-white/10 pt-5">
                {accommodation && moveItemAction ? (
                    <MoveTripItemButton
                        itemType="accommodation"
                        itemId={accommodation.id}
                        currentTripId={tripId}
                        targetTrips={moveTargetTrips || []}
                        moveAction={moveItemAction}
                        itemLabel={accommodation.hotel_name}
                        className={secondaryButtonClass}
                    />
                ) : null}
                <button type="button" onClick={onClose} className={secondaryButtonClass}>
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-full bg-lime-300 px-5 py-2 text-sm font-black text-slate-950 shadow-[0_0_26px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:-translate-y-0.5 hover:bg-lime-200"
                >
                    {isSaving ? "Saving..." : "Save accommodation"}
                </button>
            </div>
        </form>
    );
}

function AccommodationModal({
    tripId,
    mode,
    createAction,
    updateAction,
    moveItemAction,
    moveTargetTrips,
    audienceOptions,
    audienceParticipants,
    currentUserTripMemberId,
    onClose,
}: {
    tripId: string;
    mode: ModalMode;
    createAction: (formData: FormData) => Promise<AccommodationActionResult>;
    updateAction: (formData: FormData) => Promise<AccommodationActionResult>;
    moveItemAction?: (formData: FormData) => Promise<void>;
    moveTargetTrips?: MoveTargetTrip[];
    audienceOptions?: TripAudienceOption[];
    audienceParticipants?: AccommodationAudienceParticipant[];
    currentUserTripMemberId?: string | null;
    onClose: () => void;
}) {
    const isEdit = mode.type === "edit";

    return (
        <AnimatedModal
            onClose={onClose}
            panelClassName="max-w-3xl"
            labelledBy="accommodation-modal-title"
            presentation
        >
            {({ requestClose }) => (
                <>
                    <div className="vaivia-modal-header flex items-start justify-between gap-4">
                        <div>
                            <p className="vaivia-modal-eyebrow">Accommodations</p>
                            <h2 id="accommodation-modal-title" className="vaivia-modal-title">
                                {isEdit ? "Edit accommodation" : "Add accommodation"}
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="vaivia-modal-close"
                            aria-label="Close accommodation modal"
                        >
                            <X className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </div>
                    <AccommodationForm
                        tripId={tripId}
                        mode={mode}
                        action={isEdit ? updateAction : createAction}
                        moveItemAction={moveItemAction}
                        moveTargetTrips={moveTargetTrips}
                        audienceOptions={audienceOptions}
                        audienceParticipants={audienceParticipants}
                        currentUserTripMemberId={currentUserTripMemberId}
                        onClose={requestClose}
                    />
                </>
            )}
        </AnimatedModal>
    );
}

export function AccommodationCreateModal({
    tripId,
    createAction,
    moveItemAction,
    moveTargetTrips,
    audienceOptions,
    audienceParticipants,
    currentUserTripMemberId,
    onClose,
}: {
    tripId: string;
    createAction: (formData: FormData) => Promise<AccommodationActionResult>;
    moveItemAction?: (formData: FormData) => Promise<void>;
    moveTargetTrips?: MoveTargetTrip[];
    audienceOptions?: TripAudienceOption[];
    audienceParticipants?: AccommodationAudienceParticipant[];
    currentUserTripMemberId?: string | null;
    onClose: () => void;
}) {
    return (
        <AccommodationModal
            tripId={tripId}
            mode={{ type: "add" }}
            createAction={createAction}
            updateAction={createAction}
            moveItemAction={moveItemAction}
            moveTargetTrips={moveTargetTrips}
            audienceOptions={audienceOptions}
            audienceParticipants={audienceParticipants}
            currentUserTripMemberId={currentUserTripMemberId}
            onClose={onClose}
        />
    );
}

function AccommodationCard({
    accommodation,
    isGoogleReady,
    audienceOptions,
    audienceParticipants,
    currentUserTripMemberId,
    onEdit,
    onDelete,
}: {
    accommodation: TripAccommodation;
    isGoogleReady: boolean;
    audienceOptions: TripAudienceOption[];
    audienceParticipants: AccommodationAudienceParticipant[];
    currentUserTripMemberId?: string | null;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const isCancelled = accommodation.status === "cancelled";
    const checkInWindow =
        accommodation.check_in_time_start || accommodation.check_in_time_end
            ? ` between ${[
                  formatDisplayTime(accommodation.check_in_time_start),
                  formatDisplayTime(accommodation.check_in_time_end),
              ]
                  .filter(Boolean)
                  .join(" and ")}`
            : "";

    return (
        <article
            className={`overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#03030a]/90 text-white shadow-2xl shadow-black/25 transition hover:-translate-y-0.5 hover:border-lime-300/25 ${
                isCancelled ? "opacity-60" : ""
            }`}
        >
            <GooglePlaceCoverPhoto accommodation={accommodation} isGoogleReady={isGoogleReady} />
            <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-2xl font-black tracking-tight">
                                {accommodation.hotel_name}
                            </h3>
                            {accommodation.is_private ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.08] px-2.5 py-1 text-xs font-black uppercase tracking-wide text-lime-200">
                                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                                    Private
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-1 text-sm font-bold text-slate-300">
                            {getAccommodationStatusLabel(accommodation.status)} ·{" "}
                            {getAccommodationTypeLabel(accommodation.accommodation_type)}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onEdit}
                            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 transition hover:border-lime-300/40 hover:text-lime-200"
                            aria-label={`Edit ${accommodation.hotel_name}`}
                        >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={onDelete}
                            className="flex h-10 w-10 items-center justify-center rounded-full border border-red-300/20 bg-red-500/10 text-red-100 transition hover:border-red-300/50 hover:bg-red-500/20"
                            aria-label={`Delete ${accommodation.hotel_name}`}
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {accommodation.address ? (
                    <p className="mt-4 flex gap-2 text-sm font-semibold text-slate-300">
                        <MapPin
                            className="mt-0.5 h-4 w-4 shrink-0 text-lime-200"
                            aria-hidden="true"
                        />
                        <span>{accommodation.address}</span>
                    </p>
                ) : null}

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/80">
                            Check-in
                        </p>
                        <p className="mt-1 text-lg font-black">
                            {formatDisplayDate(accommodation.check_in_date)}
                        </p>
                        {checkInWindow ? (
                            <p className="mt-1 text-sm font-semibold text-slate-400">
                                {checkInWindow.trim()}
                            </p>
                        ) : null}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/80">
                            Check-out
                        </p>
                        <p className="mt-1 text-lg font-black">
                            {formatDisplayDate(accommodation.check_out_date)}
                        </p>
                        {accommodation.check_out_time ? (
                            <p className="mt-1 text-sm font-semibold text-slate-400">
                                {formatDisplayTime(accommodation.check_out_time)}
                            </p>
                        ) : null}
                    </div>
                </div>

                {accommodation.free_cancellation_ends_on ? (
                    <div className="mt-4 rounded-2xl border border-lime-300/25 bg-lime-300/10 px-4 py-3">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/80">
                            Free cancellation ends
                        </p>
                        <p className="mt-1 text-sm font-black text-lime-100">
                            {formatDisplayDate(accommodation.free_cancellation_ends_on)}
                        </p>
                    </div>
                ) : null}

                {accommodation.notes ? (
                    <p className="mt-4 whitespace-pre-line text-sm font-semibold leading-6 text-slate-300">
                        {accommodation.notes}
                    </p>
                ) : null}

                {accommodation.cost ? (
                    <p className="mt-4 inline-flex rounded-full border border-lime-300/30 bg-lime-300/15 px-3 py-1 text-sm font-black text-lime-100">
                        {formatCurrency(
                            Number(accommodation.cost),
                            accommodation.currency || "CAD",
                        )}
                    </p>
                ) : null}

                <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                    <div className="flex flex-wrap gap-2">
                        {accommodation.website ? (
                            <a
                                href={accommodation.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={secondaryButtonClass}
                            >
                                Website
                                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            </a>
                        ) : null}
                        {accommodation.google_maps_url ? (
                            <a
                                href={accommodation.google_maps_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={secondaryButtonClass}
                            >
                                Open in Google Maps
                                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            </a>
                        ) : null}
                    </div>
                    <AccommodationAudienceAvatars
                        accommodation={accommodation}
                        options={audienceOptions}
                        participants={audienceParticipants}
                        currentUserTripMemberId={currentUserTripMemberId}
                    />
                </div>
            </div>
        </article>
    );
}

export default function AccommodationManager({
    tripId,
    accommodations,
    createAction,
    updateAction,
    deleteAction,
    moveItemAction,
    moveTargetTrips,
    audienceOptions = [],
    audienceParticipants = [],
    currentUserTripMemberId = null,
}: AccommodationManagerProps) {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [modalMode, setModalMode] = useState<ModalMode | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<TripAccommodation | null>(null);
    const [isPending, startTransition] = useTransition();
    const handledAddParamRef = useRef<string | null>(null);
    const sortedAccommodations = useMemo(
        () =>
            [...accommodations].sort((a, b) => {
                const dateSort = a.check_in_date.localeCompare(b.check_in_date);
                if (dateSort !== 0) return dateSort;
                return (a.created_at || "").localeCompare(b.created_at || "");
            }),
        [accommodations],
    );
    const audienceParticipantsByItemId = useMemo(() => {
        const participantsByItemId = new Map<string, AccommodationAudienceParticipant[]>();
        audienceParticipants.forEach((participant) => {
            const current = participantsByItemId.get(participant.item_id) || [];
            current.push(participant);
            participantsByItemId.set(participant.item_id, current);
        });
        return participantsByItemId;
    }, [audienceParticipants]);

    useEffect(() => {
        if (window.google?.maps?.places) {
            setIsGoogleReady(true);
            return;
        }

        const interval = window.setInterval(() => {
            if (!window.google?.maps?.places) return;
            setIsGoogleReady(true);
            window.clearInterval(interval);
        }, 250);

        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        if (searchParams.get("addAccommodation") !== "1") return;
        const key = `${pathname || ""}:${searchParams.toString()}`;
        if (handledAddParamRef.current === key) return;
        handledAddParamRef.current = key;

        setModalMode({ type: "add" });
        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.delete("addAccommodation");
        const nextQuery = nextParams.toString();
        router.replace(`${pathname || ""}${nextQuery ? `?${nextQuery}` : ""}`, {
            scroll: false,
        });
    }, [pathname, router, searchParams]);

    function confirmDelete() {
        if (!deleteTarget) return;
        const formData = new FormData();
        formData.set("trip_id", tripId);
        formData.set("accommodation_id", deleteTarget.id);
        startTransition(async () => {
            await deleteAction(formData);
            setDeleteTarget(null);
        });
    }

    return (
        <>
            {googleMapsApiKey ? (
                <Script
                    id="google-maps-places"
                    src={`https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places`}
                    strategy="afterInteractive"
                    onLoad={() => setIsGoogleReady(true)}
                    onReady={() => setIsGoogleReady(true)}
                />
            ) : null}
            <section className="rounded-[2rem] border border-white/10 bg-[#03030a]/90 p-5 text-white shadow-2xl shadow-black/30 md:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-300">
                            Places to stay
                        </p>
                        <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
                            Accommodations
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={() => setModalMode({ type: "add" })}
                        className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:-translate-y-0.5 hover:bg-lime-200"
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Add accommodation
                    </button>
                </div>

                {sortedAccommodations.length === 0 ? (
                    <div className="mt-8 rounded-[1.5rem] border border-dashed border-white/15 bg-white/[0.05] p-8 text-center">
                        <h3 className="text-xl font-black">No accommodations yet.</h3>
                        <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
                            Add hotels, rentals, hostels, or places you’re staying so they’re easy
                            to find during your trip.
                        </p>
                    </div>
                ) : (
                    <div className="mt-8 grid gap-4 xl:grid-cols-2">
                        {sortedAccommodations.map((accommodation) => (
                            <AccommodationCard
                                key={accommodation.id}
                                accommodation={accommodation}
                                isGoogleReady={isGoogleReady}
                                audienceOptions={audienceOptions}
                                audienceParticipants={
                                    audienceParticipantsByItemId.get(accommodation.id) ||
                                    EMPTY_AUDIENCE_PARTICIPANTS
                                }
                                currentUserTripMemberId={currentUserTripMemberId}
                                onEdit={() =>
                                    setModalMode({
                                        type: "edit",
                                        accommodation,
                                    })
                                }
                                onDelete={() => setDeleteTarget(accommodation)}
                            />
                        ))}
                    </div>
                )}
            </section>

            {modalMode ? (
                <AccommodationModal
                    tripId={tripId}
                    mode={modalMode}
                    createAction={createAction}
                    updateAction={updateAction}
                    moveItemAction={moveItemAction}
                    moveTargetTrips={moveTargetTrips}
                    audienceOptions={audienceOptions}
                    audienceParticipants={audienceParticipants}
                    currentUserTripMemberId={currentUserTripMemberId}
                    onClose={() => setModalMode(null)}
                />
            ) : null}

            {deleteTarget ? (
                <div className="vaivia-modal-backdrop" role="presentation">
                    <div
                        className="vaivia-modal-confirm"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-accommodation-title"
                    >
                        <h2
                            id="delete-accommodation-title"
                            className="text-xl font-black text-slate-950"
                        >
                            Delete accommodation?
                        </h2>
                        <p className="mt-2 text-sm font-semibold text-slate-600">
                            This will remove {deleteTarget.hotel_name} from this trip.
                        </p>
                        <div className="mt-5 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-100"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmDelete}
                                disabled={isPending}
                                className="rounded-full bg-red-600 px-4 py-2 text-sm font-black text-white transition hover:bg-red-500 disabled:cursor-wait disabled:opacity-60"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
