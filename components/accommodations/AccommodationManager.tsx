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
import { useMemo, useState, useTransition } from "react";
import AnimatedModal from "@/components/AnimatedModal";
import CostAllocationFields from "@/components/budget/CostAllocationFields";
import MoveTripItemButton from "@/components/MoveTripItemButton";
import PlaceAutocompleteInput from "@/components/places/PlaceAutocompleteInput";
import TripAudienceSelector from "@/components/TripAudienceSelector";
import {
    ACCOMMODATION_STATUS_OPTIONS,
    ACCOMMODATION_TYPE_OPTIONS,
    getAccommodationStatusLabel,
    getAccommodationTypeLabel,
    type AccommodationType,
    type TripAccommodation,
} from "@/lib/accommodations";
import { COMMON_CURRENCIES, formatCurrency } from "@/lib/budget";
import type { MoveTargetTrip } from "@/lib/tripMove";
import type { TripAudienceOption } from "@/lib/tripAudience";

type AccommodationManagerProps = {
    tripId: string;
    accommodations: TripAccommodation[];
    createAction: (formData: FormData) => Promise<void>;
    updateAction: (formData: FormData) => Promise<void>;
    deleteAction: (formData: FormData) => Promise<void>;
    moveItemAction?: (formData: FormData) => Promise<void>;
    moveTargetTrips?: MoveTargetTrip[];
    audienceOptions?: TripAudienceOption[];
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
    | { type: "add"; accommodation?: null }
    | { type: "edit"; accommodation: TripAccommodation };

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
const labelClass =
    "text-xs font-black uppercase tracking-[0.22em] text-lime-200/80";
const modalBodyClass =
    "space-y-5 bg-[#080511] p-6 text-white";
const secondaryButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14] hover:text-white";

const ACCOMMODATION_TYPE_ICONS: Record<
    AccommodationType,
    typeof Hotel
> = {
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
    format: "long_name" | "short_name" = "long_name"
) {
    return (
        place.address_components?.find((component) => component.types.includes(type))?.[
            format
        ] || ""
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

function AccommodationForm({
    tripId,
    mode,
    action,
    moveItemAction,
    moveTargetTrips,
    audienceOptions = [],
    currentUserTripMemberId = null,
    onClose,
}: {
    tripId: string;
    mode: ModalMode;
    action: (formData: FormData) => Promise<void>;
    moveItemAction?: (formData: FormData) => Promise<void>;
    moveTargetTrips?: MoveTargetTrip[];
    audienceOptions?: TripAudienceOption[];
    currentUserTripMemberId?: string | null;
    onClose: () => void;
}) {
    const accommodation = mode.type === "edit" ? mode.accommodation : null;
    const [hotelName, setHotelName] = useState(accommodation?.hotel_name || "");
    const [address, setAddress] = useState(accommodation?.address || "");
    const [website, setWebsite] = useState(accommodation?.website || "");
    const [type, setType] = useState<AccommodationType>(
        accommodation?.accommodation_type || "other"
    );
    const [placeFields, setPlaceFields] = useState<PlaceFields>(() =>
        getInitialPlaceFields(accommodation)
    );
    const [costAmount, setCostAmount] = useState(formValue(accommodation?.cost));
    const [errors, setErrors] = useState<string[]>([]);
    const [isSaving, startSavingTransition] = useTransition();

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
        if (checkInStart && checkInEnd && checkInEnd <= checkInStart) {
            nextErrors.push("Check-in end time must be after check-in start time.");
        }
        if (
            websiteValue &&
            !/^https?:\/\/\S+\.\S+/i.test(
                /^https?:\/\//i.test(websiteValue)
                    ? websiteValue
                    : `https://${websiteValue}`
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
                const formData = new FormData(event.currentTarget);
                hydrateFormData(formData);
                if (!validate(formData)) return;

                startSavingTransition(() => {
                    void action(formData)
                        .then(onClose)
                        .catch((error: unknown) => {
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
                        Google Maps is optional. You can enter a hotel, residence,
                        address, or city for planning.
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
                    <input
                        type="date"
                        name="check_in_date"
                        defaultValue={accommodation?.check_in_date || ""}
                        required
                        className={inputClass}
                    />
                </label>

                <label className="space-y-2">
                    <span className={labelClass}>Check-out date</span>
                    <input
                        type="date"
                        name="check_out_date"
                        defaultValue={accommodation?.check_out_date || ""}
                        required
                        className={inputClass}
                    />
                </label>

                <label className="space-y-2">
                    <span className={labelClass}>Check-in time start</span>
                    <input
                        type="time"
                        name="check_in_time_start"
                        defaultValue={accommodation?.check_in_time_start || ""}
                        className={inputClass}
                    />
                </label>

                <label className="space-y-2">
                    <span className={labelClass}>Check-in time end</span>
                    <input
                        type="time"
                        name="check_in_time_end"
                        defaultValue={accommodation?.check_in_time_end || ""}
                        className={inputClass}
                    />
                </label>

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

                <div className="md:col-span-2">
                    <TripAudienceSelector
                        options={audienceOptions}
                        currentUserTripMemberId={currentUserTripMemberId}
                        initialAudienceMode={
                            accommodation?.audience_mode || "everyone"
                        }
                        privateSectionId="accommodation-private-section"
                    />
                </div>

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
                <button
                    type="button"
                    onClick={onClose}
                    className={secondaryButtonClass}
                >
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
    currentUserTripMemberId,
    onClose,
}: {
    tripId: string;
    mode: ModalMode;
    createAction: (formData: FormData) => Promise<void>;
    updateAction: (formData: FormData) => Promise<void>;
    moveItemAction?: (formData: FormData) => Promise<void>;
    moveTargetTrips?: MoveTargetTrip[];
    audienceOptions?: TripAudienceOption[];
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
    currentUserTripMemberId,
    onClose,
}: {
    tripId: string;
    createAction: (formData: FormData) => Promise<void>;
    moveItemAction?: (formData: FormData) => Promise<void>;
    moveTargetTrips?: MoveTargetTrip[];
    audienceOptions?: TripAudienceOption[];
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
            currentUserTripMemberId={currentUserTripMemberId}
            onClose={onClose}
        />
    );
}

function AccommodationCard({
    accommodation,
    onEdit,
    onDelete,
}: {
    accommodation: TripAccommodation;
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
            className={`rounded-[1.6rem] border border-white/10 bg-[#03030a]/90 p-5 text-white shadow-2xl shadow-black/25 transition hover:-translate-y-0.5 hover:border-lime-300/25 ${
                isCancelled ? "opacity-60" : ""
            }`}
        >
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
                </div>
            </div>

            {accommodation.notes ? (
                <p className="mt-4 whitespace-pre-line text-sm font-semibold leading-6 text-slate-300">
                    {accommodation.notes}
                </p>
            ) : null}

            {accommodation.cost ? (
                <p className="mt-4 inline-flex rounded-full border border-lime-300/30 bg-lime-300/15 px-3 py-1 text-sm font-black text-lime-100">
                    {formatCurrency(
                        Number(accommodation.cost),
                        accommodation.currency || "CAD"
                    )}
                </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
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
    currentUserTripMemberId = null,
}: AccommodationManagerProps) {
    const [modalMode, setModalMode] = useState<ModalMode | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<TripAccommodation | null>(null);
    const [isPending, startTransition] = useTransition();
    const sortedAccommodations = useMemo(
        () =>
            [...accommodations].sort((a, b) => {
                const dateSort = a.check_in_date.localeCompare(b.check_in_date);
                if (dateSort !== 0) return dateSort;
                return (a.created_at || "").localeCompare(b.created_at || "");
            }),
        [accommodations]
    );

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
                            Add hotels, rentals, hostels, or places you’re staying so
                            they’re easy to find during your trip.
                        </p>
                    </div>
                ) : (
                    <div className="mt-8 grid gap-4 xl:grid-cols-2">
                        {sortedAccommodations.map((accommodation) => (
                            <AccommodationCard
                                key={accommodation.id}
                                accommodation={accommodation}
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
