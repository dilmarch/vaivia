"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, MapPin, Trash2, Utensils, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import AnimatedModal from "@/components/AnimatedModal";
import FoodReactionBar from "@/components/FoodReactionBar";
import {
    FoodCardPresentation,
    FoodPresentation,
} from "@/components/food/FoodPresentation";
import { GooglePlaceCoverPhoto } from "@/components/GooglePlaceCoverPhoto";
import MoveTripItemButton from "@/components/MoveTripItemButton";
import PlaceAutocompleteInput from "@/components/places/PlaceAutocompleteInput";
import TripNotepadComposer from "@/components/TripNotepadComposer";
import type { NotepadLocation } from "@/lib/notepadEntries";
import {
    FOOD_MEAL_OPTIONS,
    type FoodItemType,
    type FoodMealCategory,
    type TripFoodItem,
} from "@/lib/tripFood";
import type { MoveTargetTrip } from "@/lib/tripMove";

type FoodPageClientProps = {
    tripId: string;
    tripRouteSegment?: string;
    initialTab: FoodItemType;
    items: TripFoodItem[];
    createFoodAction: (formData: FormData) => Promise<void>;
    updateFoodAction: (formData: FormData) => Promise<void>;
    deleteFoodAction: (formData: FormData) => Promise<void>;
    moveItemAction: (formData: FormData) => Promise<void>;
    moveTargetTrips: MoveTargetTrip[];
    toggleReactionAction: (formData: FormData) => Promise<void>;
    toggleTriedAction: (formData: FormData) => Promise<void>;
    tripNotes?: string | null;
    tripLocations?: NotepadLocation[];
    saveTripNotesAction?: (formData: FormData) => Promise<void>;
    createFoodFromNotepadAction?: (formData: FormData) => Promise<void>;
};

type ModalStep = "choose" | FoodItemType;

function getTabHref(tripRouteSegment: string, tab: FoodItemType) {
    return `/trips/${tripRouteSegment}/food?tab=${tab === "place" ? "places" : "foods"}`;
}

function normalizeUrl(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function getPlaceComponent(
    place: google.maps.places.PlaceResult,
    type: string,
    nameType: "long_name" | "short_name" = "long_name"
) {
    return (
        place.address_components?.find((component) =>
            component.types.includes(type)
        )?.[nameType] || ""
    );
}

function getFoodLocationLabel(place: google.maps.places.PlaceResult) {
    const city =
        getPlaceComponent(place, "locality") ||
        getPlaceComponent(place, "postal_town") ||
        getPlaceComponent(place, "administrative_area_level_2");
    const region = getPlaceComponent(place, "administrative_area_level_1");
    const country = getPlaceComponent(place, "country");

    return [city || region || place.name, city ? region : "", country]
        .filter(Boolean)
        .join(", ");
}

function serializeOpeningHours(place: google.maps.places.PlaceResult) {
    const openingHours = place.opening_hours;

    if (!openingHours) return "";

    let isOpen: boolean | null = null;
    if (typeof openingHours.isOpen === "function") {
        try {
            isOpen = openingHours.isOpen() ?? null;
        } catch {
            isOpen = null;
        }
    }

    return JSON.stringify({
        open_now: isOpen,
        utc_offset_minutes: place.utc_offset_minutes ?? null,
        weekday_text: openingHours.weekday_text || [],
        periods: openingHours.periods || [],
    });
}

function FoodMealSelector({
    values,
    onChange,
    allowedValues,
}: {
    values: FoodMealCategory[];
    onChange: (values: FoodMealCategory[]) => void;
    allowedValues?: FoodMealCategory[];
}) {
    const options = allowedValues
        ? FOOD_MEAL_OPTIONS.filter((option) => allowedValues.includes(option.value))
        : FOOD_MEAL_OPTIONS;

    function toggleMeal(value: FoodMealCategory) {
        if (value === "any") {
            onChange(["any"]);
            return;
        }

        const nextValues = values.includes(value)
            ? values.filter((meal) => meal !== value)
            : [...values.filter((meal) => meal !== "any"), value];

        onChange(nextValues.length > 0 ? nextValues : ["any"]);
    }

    return (
        <div>
            <p className="text-sm font-black text-white">Good for</p>
            <div className="mt-2 flex flex-wrap gap-2">
                {options.map((option) => {
                    const isSelected = values.includes(option.value);

                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => toggleMeal(option.value)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] transition ${
                                isSelected
                                    ? "border-lime-300 bg-lime-300 text-slate-950"
                                    : "border-white/10 bg-white/[0.06] text-slate-200 hover:border-lime-300/40 hover:bg-white/[0.1]"
                            }`}
                        >
                            {option.label}
                        </button>
                    );
                })}
            </div>
            {values.map((meal) => (
                <input key={meal} type="hidden" name="meal_categories" value={meal} />
            ))}
        </div>
    );
}

function FoodAddModal({
    tripId,
    initialStep,
    createFoodAction,
    onClose,
}: {
    tripId: string;
    initialStep: ModalStep;
    createFoodAction: (formData: FormData) => Promise<void>;
    onClose: () => void;
}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [step, setStep] = useState<ModalStep>(initialStep);
    const [mealCategories, setMealCategories] = useState<FoodMealCategory[]>(["any"]);
    const [placeSearchValue, setPlaceSearchValue] = useState("");
    const [placeName, setPlaceName] = useState("");
    const [googlePlaceId, setGooglePlaceId] = useState("");
    const [formattedAddress, setFormattedAddress] = useState("");
    const [locationLat, setLocationLat] = useState("");
    const [locationLng, setLocationLng] = useState("");
    const [primaryPlaceType, setPrimaryPlaceType] = useState("");
    const [placeTypes, setPlaceTypes] = useState<string[]>([]);
    const [businessStatus, setBusinessStatus] = useState("");
    const [regularOpeningHours, setRegularOpeningHours] = useState("");
    const [websiteUrl, setWebsiteUrl] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");
    const returnTo = useMemo(() => {
        const query = searchParams.toString();
        return `${pathname || ""}${query ? `?${query}` : ""}`;
    }, [pathname, searchParams]);
    const [googleMapsUrl, setGoogleMapsUrl] = useState("");
    const [facebookUrl, setFacebookUrl] = useState("");
    const [instagramUrl, setInstagramUrl] = useState("");
    const [foodLocationSearchValue, setFoodLocationSearchValue] = useState("");
    const [foodRegion, setFoodRegion] = useState("");
    const [foodGooglePlaceId, setFoodGooglePlaceId] = useState("");
    const [foodFormattedAddress, setFoodFormattedAddress] = useState("");
    const [foodLocationLat, setFoodLocationLat] = useState("");
    const [foodLocationLng, setFoodLocationLng] = useState("");
    const [foodPrimaryPlaceType, setFoodPrimaryPlaceType] = useState("");
    const [foodPlaceTypes, setFoodPlaceTypes] = useState<string[]>([]);
    const [foodGoogleMapsUrl, setFoodGoogleMapsUrl] = useState("");

    function resetPlace() {
        setPlaceName("");
        setGooglePlaceId("");
        setFormattedAddress("");
        setLocationLat("");
        setLocationLng("");
        setPrimaryPlaceType("");
        setPlaceTypes([]);
        setBusinessStatus("");
        setRegularOpeningHours("");
        setWebsiteUrl("");
        setPhoneNumber("");
        setGoogleMapsUrl("");
    }

    function handlePlaceSelect(place: google.maps.places.PlaceResult) {
        const name = place.name || place.formatted_address || "";
        setPlaceSearchValue(name);
        setPlaceName(name);
        setGooglePlaceId(place.place_id || "");
        setFormattedAddress(place.formatted_address || "");
        setLocationLat(
            place.geometry?.location?.lat
                ? String(place.geometry.location.lat())
                : ""
        );
        setLocationLng(
            place.geometry?.location?.lng
                ? String(place.geometry.location.lng())
                : ""
        );
        setPrimaryPlaceType(place.types?.[0] || "");
        setPlaceTypes(place.types || []);
        setBusinessStatus(place.business_status || "");
        setRegularOpeningHours(serializeOpeningHours(place));
        setWebsiteUrl(place.website || "");
        setPhoneNumber(
            place.international_phone_number ||
                place.formatted_phone_number ||
                ""
        );
        setGoogleMapsUrl(place.url || "");
    }

    function resetFoodLocation() {
        setFoodRegion("");
        setFoodGooglePlaceId("");
        setFoodFormattedAddress("");
        setFoodLocationLat("");
        setFoodLocationLng("");
        setFoodPrimaryPlaceType("");
        setFoodPlaceTypes([]);
        setFoodGoogleMapsUrl("");
    }

    function handleFoodLocationSelect(place: google.maps.places.PlaceResult) {
        const label = getFoodLocationLabel(place);
        setFoodLocationSearchValue(label);
        setFoodRegion(label);
        setFoodGooglePlaceId(place.place_id || "");
        setFoodFormattedAddress(place.formatted_address || label);
        setFoodLocationLat(
            place.geometry?.location?.lat
                ? String(place.geometry.location.lat())
                : ""
        );
        setFoodLocationLng(
            place.geometry?.location?.lng
                ? String(place.geometry.location.lng())
                : ""
        );
        setFoodPrimaryPlaceType(place.types?.[0] || "");
        setFoodPlaceTypes(place.types || []);
        setFoodGoogleMapsUrl(place.url || "");
    }

    return (
        <AnimatedModal onClose={onClose} panelClassName="max-w-3xl">
            {({ requestClose }) => (
                <div className="max-h-[min(86vh,900px)] overflow-y-auto p-6 text-white">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
                                Eat &amp; Drink
                            </p>
                            <h2 className="mt-2 text-3xl font-black">
                                {step === "choose"
                                    ? "What would you like to add?"
                                    : step === "place"
                                      ? "Save a place to eat"
                                      : "Save a food to try"}
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="rounded-full border border-white/10 bg-white/[0.06] p-2 text-slate-200 transition hover:bg-white/[0.12] hover:text-white"
                            aria-label="Close"
                        >
                            <X className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </div>

                    {step === "choose" ? (
                        <div className="mt-6 grid gap-4 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => setStep("place")}
                                className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 text-left shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-lime-300/40 hover:bg-white/[0.1]"
                            >
                                <MapPin className="h-7 w-7 text-lime-300" />
                                <span className="mt-4 block text-xl font-black">
                                    Place to Eat
                                </span>
                                <span className="mt-2 block text-sm leading-6 text-slate-300">
                                    Save a restaurant, cafe, bar, market, or other
                                    food destination.
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setStep("food")}
                                className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 text-left shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-lime-300/40 hover:bg-white/[0.1]"
                            >
                                <Utensils className="h-7 w-7 text-lime-300" />
                                <span className="mt-4 block text-xl font-black">
                                    Food to Try
                                </span>
                                <span className="mt-2 block text-sm leading-6 text-slate-300">
                                    Save a dish, drink, snack, or local specialty.
                                </span>
                            </button>
                        </div>
                    ) : (
                        <form action={createFoodAction} className="mt-6 space-y-5">
                            <input type="hidden" name="trip_id" value={tripId} />
                            <input type="hidden" name="return_to" value={returnTo} />
                            <input type="hidden" name="item_type" value={step} />
                            <button
                                type="button"
                                onClick={() => setStep("choose")}
                                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-200 transition hover:bg-white/[0.1]"
                            >
                                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                                Back
                            </button>

                            {step === "place" ? (
                                <>
                                    <div>
                                        <label className="text-sm font-black text-white">
                                            Search for a place
                                        </label>
                                        <PlaceAutocompleteInput
                                            value={placeSearchValue}
                                            onInputChange={(value) => {
                                                setPlaceSearchValue(value);
                                                if (googlePlaceId && value !== placeName) {
                                                    resetPlace();
                                                }
                                            }}
                                            onPlaceSelect={handlePlaceSelect}
                                            placeholder="Restaurant, cafe, bar, market..."
                                            required
                                            className="mt-2 w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none"
                                        />
                                        <input type="hidden" name="name" value={placeName} />
                                        <input
                                            type="hidden"
                                            name="google_place_id"
                                            value={googlePlaceId}
                                        />
                                        <input
                                            type="hidden"
                                            name="formatted_address"
                                            value={formattedAddress}
                                        />
                                        <input
                                            type="hidden"
                                            name="location_lat"
                                            value={locationLat}
                                        />
                                        <input
                                            type="hidden"
                                            name="location_lng"
                                            value={locationLng}
                                        />
                                        <input
                                            type="hidden"
                                            name="primary_place_type"
                                            value={primaryPlaceType}
                                        />
                                        {placeTypes.map((type) => (
                                            <input
                                                key={type}
                                                type="hidden"
                                                name="place_types"
                                                value={type}
                                            />
                                        ))}
                                        <input
                                            type="hidden"
                                            name="business_status"
                                            value={businessStatus}
                                        />
                                        <input
                                            type="hidden"
                                            name="regular_opening_hours"
                                            value={regularOpeningHours}
                                        />
                                        <input
                                            type="hidden"
                                            name="phone_number"
                                            value={phoneNumber}
                                        />
                                        <input
                                            type="hidden"
                                            name="google_maps_url"
                                            value={googleMapsUrl}
                                        />
                                    </div>

                                    {googlePlaceId ? (
                                        <div className="rounded-2xl border border-lime-300/25 bg-lime-300/10 p-4">
                                            <p className="font-black text-white">
                                                {placeName}
                                            </p>
                                            <p className="mt-1 text-sm text-slate-300">
                                                {formattedAddress}
                                            </p>
                                            {primaryPlaceType ? (
                                                <p className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-lime-200">
                                                    {primaryPlaceType.replaceAll("_", " ")}
                                                </p>
                                            ) : null}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setPlaceSearchValue("");
                                                    resetPlace();
                                                }}
                                                className="mt-3 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-xs font-black text-white"
                                            >
                                                Clear place
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm font-semibold text-amber-100">
                                            Select a Google Maps result to validate this
                                            place.
                                        </p>
                                    )}

                                    <FoodMealSelector
                                        values={mealCategories}
                                        onChange={setMealCategories}
                                    />

                                    <label className="block text-sm font-black text-white">
                                        Why do you want to go?
                                        <textarea
                                            name="personal_note"
                                            rows={3}
                                            placeholder="Known for the tasting menu - book ahead."
                                            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                                        />
                                    </label>

                                    <div className="grid gap-3 sm:grid-cols-3">
                                        <label className="block text-xs font-black uppercase tracking-[0.14em] text-slate-300">
                                            Website override
                                            <input
                                                name="website_url"
                                                defaultValue={websiteUrl}
                                                onBlur={(event) => {
                                                    event.currentTarget.value = normalizeUrl(
                                                        event.currentTarget.value
                                                    );
                                                }}
                                                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none"
                                            />
                                        </label>
                                        <label className="block text-xs font-black uppercase tracking-[0.14em] text-slate-300">
                                            Facebook URL
                                            <input
                                                name="facebook_url"
                                                value={facebookUrl}
                                                onChange={(event) =>
                                                    setFacebookUrl(event.target.value)
                                                }
                                                onBlur={(event) =>
                                                    setFacebookUrl(
                                                        normalizeUrl(event.currentTarget.value)
                                                    )
                                                }
                                                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none"
                                            />
                                        </label>
                                        <label className="block text-xs font-black uppercase tracking-[0.14em] text-slate-300">
                                            Instagram URL
                                            <input
                                                name="instagram_url"
                                                value={instagramUrl}
                                                onChange={(event) =>
                                                    setInstagramUrl(event.target.value)
                                                }
                                                onBlur={(event) =>
                                                    setInstagramUrl(
                                                        normalizeUrl(event.currentTarget.value)
                                                    )
                                                }
                                                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none"
                                            />
                                        </label>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <label className="block text-sm font-black text-white">
                                        Food or drink
                                        <input
                                            name="name"
                                            required
                                            placeholder="Beef noodle soup"
                                            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                                        />
                                    </label>
                                    <label className="block text-sm font-black text-white">
                                        Description
                                        <textarea
                                            name="description"
                                            rows={3}
                                            placeholder="A Taiwanese noodle soup with slow-braised beef and aromatic broth."
                                            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                                        />
                                    </label>
                                    <div>
                                        <label className="block text-sm font-black text-white">
                                        Where should you try it?
                                        </label>
                                        <PlaceAutocompleteInput
                                            value={foodLocationSearchValue}
                                            onInputChange={(value) => {
                                                setFoodLocationSearchValue(value);
                                                if (
                                                    foodGooglePlaceId &&
                                                    value !== foodRegion
                                                ) {
                                                    resetFoodLocation();
                                                }
                                            }}
                                            onPlaceSelect={handleFoodLocationSelect}
                                            placeholder="City, region, country, or address..."
                                            required
                                            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                                        />
                                        <input type="hidden" name="region" value={foodRegion} />
                                        <input
                                            type="hidden"
                                            name="google_place_id"
                                            value={foodGooglePlaceId}
                                        />
                                        <input
                                            type="hidden"
                                            name="formatted_address"
                                            value={foodFormattedAddress}
                                        />
                                        <input
                                            type="hidden"
                                            name="location_lat"
                                            value={foodLocationLat}
                                        />
                                        <input
                                            type="hidden"
                                            name="location_lng"
                                            value={foodLocationLng}
                                        />
                                        <input
                                            type="hidden"
                                            name="primary_place_type"
                                            value={foodPrimaryPlaceType}
                                        />
                                        {foodPlaceTypes.map((type) => (
                                            <input
                                                key={type}
                                                type="hidden"
                                                name="place_types"
                                                value={type}
                                            />
                                        ))}
                                        <input
                                            type="hidden"
                                            name="google_maps_url"
                                            value={foodGoogleMapsUrl}
                                        />
                                        {foodGooglePlaceId ? (
                                            <p className="mt-2 rounded-2xl border border-lime-300/25 bg-lime-300/10 px-3 py-2 text-xs font-semibold text-lime-100">
                                                Validated: {foodRegion}
                                            </p>
                                        ) : (
                                            <p className="mt-2 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-100">
                                                Select a Google Maps result so VAIVIA knows where this is available.
                                            </p>
                                        )}
                                    </div>
                                    <label className="block text-sm font-black text-white">
                                        Personal note
                                        <textarea
                                            name="personal_note"
                                            rows={2}
                                            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                                        />
                                    </label>
                                    <FoodMealSelector
                                        values={mealCategories}
                                        onChange={setMealCategories}
                                        allowedValues={[
                                            "any",
                                            "breakfast",
                                            "brunch",
                                            "lunch",
                                            "dinner",
                                            "snack",
                                            "dessert",
                                            "drinks",
                                            "late_night",
                                        ]}
                                    />
                                </>
                            )}

                            <button
                                type="submit"
                                className="w-full rounded-full bg-lime-300 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:bg-lime-200"
                            >
                                {step === "place" ? "Save Place" : "Save Food"}
                            </button>
                        </form>
                    )}
                </div>
            )}
        </AnimatedModal>
    );
}

function FoodEditModal({
    item,
    tripId,
    updateFoodAction,
    deleteFoodAction,
    moveItemAction,
    moveTargetTrips,
    onClose,
}: {
    item: TripFoodItem;
    tripId: string;
    updateFoodAction: (formData: FormData) => Promise<void>;
    deleteFoodAction: (formData: FormData) => Promise<void>;
    moveItemAction: (formData: FormData) => Promise<void>;
    moveTargetTrips: MoveTargetTrip[];
    onClose: () => void;
}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [mealCategories, setMealCategories] = useState<FoodMealCategory[]>(
        item.meal_categories.length > 0 ? item.meal_categories : ["any"]
    );
    const returnTo = useMemo(() => {
        const query = searchParams.toString();
        return `${pathname || ""}${query ? `?${query}` : ""}`;
    }, [pathname, searchParams]);
    const [foodLocationSearchValue, setFoodLocationSearchValue] = useState(
        item.region || item.formatted_address || ""
    );
    const [foodRegion, setFoodRegion] = useState(item.region || "");
    const [foodGooglePlaceId, setFoodGooglePlaceId] = useState(
        item.google_place_id || ""
    );
    const [foodFormattedAddress, setFoodFormattedAddress] = useState(
        item.formatted_address || ""
    );
    const [foodLocationLat, setFoodLocationLat] = useState(
        item.location_lat == null ? "" : String(item.location_lat)
    );
    const [foodLocationLng, setFoodLocationLng] = useState(
        item.location_lng == null ? "" : String(item.location_lng)
    );
    const [foodPrimaryPlaceType, setFoodPrimaryPlaceType] = useState(
        item.primary_place_type || ""
    );
    const [foodPlaceTypes, setFoodPlaceTypes] = useState<string[]>(
        item.place_types || []
    );
    const [foodGoogleMapsUrl, setFoodGoogleMapsUrl] = useState(
        item.google_maps_url || ""
    );

    function resetFoodLocation() {
        setFoodRegion("");
        setFoodGooglePlaceId("");
        setFoodFormattedAddress("");
        setFoodLocationLat("");
        setFoodLocationLng("");
        setFoodPrimaryPlaceType("");
        setFoodPlaceTypes([]);
        setFoodGoogleMapsUrl("");
    }

    function handleFoodLocationSelect(place: google.maps.places.PlaceResult) {
        const label = getFoodLocationLabel(place);
        setFoodLocationSearchValue(label);
        setFoodRegion(label);
        setFoodGooglePlaceId(place.place_id || "");
        setFoodFormattedAddress(place.formatted_address || label);
        setFoodLocationLat(
            place.geometry?.location?.lat
                ? String(place.geometry.location.lat())
                : ""
        );
        setFoodLocationLng(
            place.geometry?.location?.lng
                ? String(place.geometry.location.lng())
                : ""
        );
        setFoodPrimaryPlaceType(place.types?.[0] || "");
        setFoodPlaceTypes(place.types || []);
        setFoodGoogleMapsUrl(place.url || "");
    }

    return (
        <AnimatedModal onClose={onClose} panelClassName="max-w-3xl">
            {({ requestClose }) => (
                <div className="max-h-[min(86vh,900px)] overflow-y-auto p-6 text-white">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
                                {item.item_type === "place" ? "Place to Eat" : "Food to Try"}
                            </p>
                            <h2 className="mt-2 text-3xl font-black">Edit food item</h2>
                        </div>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="rounded-full border border-white/10 bg-white/[0.06] p-2 text-slate-200 transition hover:bg-white/[0.12] hover:text-white"
                            aria-label="Close"
                        >
                            <X className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </div>

                    <form action={updateFoodAction} className="mt-6 space-y-5">
                        <input type="hidden" name="trip_id" value={tripId} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <input type="hidden" name="food_item_id" value={item.id} />
                        <input type="hidden" name="item_type" value={item.item_type} />
                        <input type="hidden" name="business_status" value={item.business_status || ""} />
                        <input
                            type="hidden"
                            name="regular_opening_hours"
                            value={
                                item.regular_opening_hours
                                    ? JSON.stringify(item.regular_opening_hours)
                                    : ""
                            }
                        />

                        <label className="block text-sm font-black text-white">
                            Name
                            <input
                                name="name"
                                required
                                defaultValue={item.name}
                                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                            />
                        </label>

                        {item.item_type === "place" ? (
                            <>
                                <label className="block text-sm font-black text-white">
                                    Address
                                    {item.place_source === "google_place_assistant"
                                        ? " (optional)"
                                        : ""}
                                    <input
                                        name="formatted_address"
                                        required={
                                            item.place_source !== "google_place_assistant"
                                        }
                                        defaultValue={item.formatted_address || ""}
                                        className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                                    />
                                </label>
                                {item.place_source === "google_place_assistant" ? (
                                    <p className="-mt-3 text-xs leading-5 text-slate-400">
                                        VAIVIA keeps your label and Place ID. Live Google details
                                        remain transient.
                                    </p>
                                ) : null}
                                <input
                                    type="hidden"
                                    name="google_place_id"
                                    value={item.google_place_id || ""}
                                />
                                <input
                                    type="hidden"
                                    name="location_lat"
                                    value={item.location_lat ?? ""}
                                />
                                <input
                                    type="hidden"
                                    name="location_lng"
                                    value={item.location_lng ?? ""}
                                />
                                <input
                                    type="hidden"
                                    name="primary_place_type"
                                    value={item.primary_place_type || ""}
                                />
                                {item.place_types.map((type) => (
                                    <input
                                        key={type}
                                        type="hidden"
                                        name="place_types"
                                        value={type}
                                    />
                                ))}
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <label className="block text-xs font-black uppercase tracking-[0.14em] text-slate-300">
                                        Website
                                        <input
                                            name="website_url"
                                            defaultValue={item.website_url || ""}
                                            onBlur={(event) => {
                                                event.currentTarget.value = normalizeUrl(event.currentTarget.value);
                                            }}
                                            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none"
                                        />
                                    </label>
                                    <label className="block text-xs font-black uppercase tracking-[0.14em] text-slate-300">
                                        Phone
                                        <input
                                            name="phone_number"
                                            defaultValue={item.phone_number || ""}
                                            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none"
                                        />
                                    </label>
                                    <label className="block text-xs font-black uppercase tracking-[0.14em] text-slate-300">
                                        Google Maps URL
                                        <input
                                            name="google_maps_url"
                                            defaultValue={item.google_maps_url || ""}
                                            onBlur={(event) => {
                                                event.currentTarget.value = normalizeUrl(event.currentTarget.value);
                                            }}
                                            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none"
                                        />
                                    </label>
                                </div>
                            </>
                        ) : (
                            <>
                                <label className="block text-sm font-black text-white">
                                    Description
                                    <textarea
                                        name="description"
                                        rows={3}
                                        defaultValue={item.description || ""}
                                        className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                                    />
                                </label>
                                <div>
                                    <label className="block text-sm font-black text-white">
                                    Where should you try it?
                                    </label>
                                    <PlaceAutocompleteInput
                                        value={foodLocationSearchValue}
                                        onInputChange={(value) => {
                                            setFoodLocationSearchValue(value);
                                            if (foodGooglePlaceId && value !== foodRegion) {
                                                resetFoodLocation();
                                            }
                                        }}
                                        onPlaceSelect={handleFoodLocationSelect}
                                        placeholder="City, region, country, or address..."
                                        required
                                        className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                                    />
                                    <input type="hidden" name="region" value={foodRegion} />
                                    <input
                                        type="hidden"
                                        name="google_place_id"
                                        value={foodGooglePlaceId}
                                    />
                                    <input
                                        type="hidden"
                                        name="formatted_address"
                                        value={foodFormattedAddress}
                                    />
                                    <input
                                        type="hidden"
                                        name="location_lat"
                                        value={foodLocationLat}
                                    />
                                    <input
                                        type="hidden"
                                        name="location_lng"
                                        value={foodLocationLng}
                                    />
                                    <input
                                        type="hidden"
                                        name="primary_place_type"
                                        value={foodPrimaryPlaceType}
                                    />
                                    {foodPlaceTypes.map((type) => (
                                        <input
                                            key={type}
                                            type="hidden"
                                            name="place_types"
                                            value={type}
                                        />
                                    ))}
                                    <input
                                        type="hidden"
                                        name="google_maps_url"
                                        value={foodGoogleMapsUrl}
                                    />
                                    {foodGooglePlaceId ? (
                                        <p className="mt-2 rounded-2xl border border-lime-300/25 bg-lime-300/10 px-3 py-2 text-xs font-semibold text-lime-100">
                                            Validated: {foodRegion}
                                        </p>
                                    ) : (
                                        <p className="mt-2 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-100">
                                            Select a Google Maps result so VAIVIA knows where this is available.
                                        </p>
                                    )}
                                </div>
                            </>
                        )}

                        <label className="block text-sm font-black text-white">
                            Personal note
                            <textarea
                                name="personal_note"
                                rows={3}
                                defaultValue={item.personal_note || ""}
                                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                            />
                        </label>

                        <FoodMealSelector
                            values={mealCategories}
                            onChange={setMealCategories}
                            allowedValues={
                                item.item_type === "food"
                                    ? [
                                          "any",
                                          "breakfast",
                                          "brunch",
                                          "lunch",
                                          "dinner",
                                          "snack",
                                          "dessert",
                                          "drinks",
                                          "late_night",
                                      ]
                                    : undefined
                            }
                        />

                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block text-xs font-black uppercase tracking-[0.14em] text-slate-300">
                                Facebook URL
                                <input
                                    name="facebook_url"
                                    defaultValue={item.facebook_url || ""}
                                    onBlur={(event) => {
                                        event.currentTarget.value = normalizeUrl(event.currentTarget.value);
                                    }}
                                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none"
                                />
                            </label>
                            <label className="block text-xs font-black uppercase tracking-[0.14em] text-slate-300">
                                Instagram URL
                                <input
                                    name="instagram_url"
                                    defaultValue={item.instagram_url || ""}
                                    onBlur={(event) => {
                                        event.currentTarget.value = normalizeUrl(event.currentTarget.value);
                                    }}
                                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none"
                                />
                            </label>
                        </div>

                        <div className="vaivia-modal-footer sticky bottom-0 -mx-6 mt-6 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap gap-2">
                                <MoveTripItemButton
                                    itemType="food"
                                    itemId={item.id}
                                    currentTripId={tripId}
                                    targetTrips={moveTargetTrips}
                                    moveAction={moveItemAction}
                                    itemLabel={item.name}
                                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14]"
                                />
                                <button
                                    type="submit"
                                    className="vaivia-modal-button-primary uppercase tracking-[0.16em]"
                                >
                                    Save changes
                                </button>
                            </div>
                            <button
                                type="submit"
                                form={`delete-food-${item.id}`}
                                className="vaivia-modal-button-danger text-xs uppercase tracking-[0.14em]"
                            >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                Delete
                            </button>
                        </div>
                    </form>

                    <form id={`delete-food-${item.id}`} action={deleteFoodAction}>
                        <input type="hidden" name="trip_id" value={tripId} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <input type="hidden" name="food_item_id" value={item.id} />
                    </form>
                </div>
            )}
        </AnimatedModal>
    );
}

function FoodCard({
    item,
    tripId,
    updateFoodAction,
    deleteFoodAction,
    moveItemAction,
    moveTargetTrips,
    toggleReactionAction,
    toggleTriedAction,
}: {
    item: TripFoodItem;
    tripId: string;
    updateFoodAction: (formData: FormData) => Promise<void>;
    deleteFoodAction: (formData: FormData) => Promise<void>;
    moveItemAction: (formData: FormData) => Promise<void>;
    moveTargetTrips: MoveTargetTrip[];
    toggleReactionAction: (formData: FormData) => Promise<void>;
    toggleTriedAction: (formData: FormData) => Promise<void>;
}) {
    const [isEditing, setIsEditing] = useState(false);

    return (
        <>
            {isEditing ? (
                <FoodEditModal
                    item={item}
                    tripId={tripId}
                    updateFoodAction={updateFoodAction}
                    deleteFoodAction={deleteFoodAction}
                    moveItemAction={moveItemAction}
                    moveTargetTrips={moveTargetTrips}
                    onClose={() => setIsEditing(false)}
                />
            ) : null}
            <FoodCardPresentation
                item={item}
                cover={
                    item.item_type === "place" && item.google_place_id ? (
                        <GooglePlaceCoverPhoto
                            placeId={item.google_place_id}
                            fallbackSourceUrl={item.google_maps_url}
                            alt={`${item.name} from Google Maps`}
                        />
                    ) : undefined
                }
                onEdit={() => setIsEditing(true)}
                renderTriedAction={(action) => (
                    <form action={toggleTriedAction}>
                        <input type="hidden" name="trip_id" value={tripId} />
                        <input type="hidden" name="food_item_id" value={item.id} />
                        <input
                            type="hidden"
                            name="tried"
                            value={item.current_user_tried ? "false" : "true"}
                        />
                        {action}
                    </form>
                )}
                reactionBar={
                    <FoodReactionBar
                        tripId={tripId}
                        foodItemId={item.id}
                        summaries={item.reaction_summaries}
                        currentUserReaction={item.current_user_reaction}
                        toggleReactionAction={toggleReactionAction}
                    />
                }
            />
        </>
    );
}

export default function FoodPageClient({
    tripId,
    tripRouteSegment,
    initialTab,
    items,
    createFoodAction,
    updateFoodAction,
    deleteFoodAction,
    moveItemAction,
    moveTargetTrips,
    toggleReactionAction,
    toggleTriedAction,
    tripNotes = "",
    tripLocations = [],
    saveTripNotesAction,
    createFoodFromNotepadAction,
}: FoodPageClientProps) {
    const routeSegment = tripRouteSegment || tripId;
    const searchParams = useSearchParams();
    const [modalStep, setModalStep] = useState<ModalStep | null>(null);

    useEffect(() => {
        if (searchParams.get("addFood") === "1") {
            setModalStep(initialTab);
        }
    }, [initialTab, searchParams]);

    return (
        <>
            {modalStep ? (
                <FoodAddModal
                    tripId={tripId}
                    initialStep={modalStep}
                    createFoodAction={createFoodAction}
                    onClose={() => setModalStep(null)}
                />
            ) : null}
            <FoodPresentation
                activeTab={initialTab}
                items={items}
                beforeContent={
                    <TripNotepadComposer
                        tripId={tripId}
                        title="Eat & Drink notepad"
                        description="Keep food notes together, or make one place or food card for every non-empty line."
                        placeholder="Seafood market\nPastéis de nata\nRooftop bar"
                        existingNote={tripNotes}
                        locations={tripLocations}
                        saveNoteAction={saveTripNotesAction}
                        createCardsAction={createFoodFromNotepadAction}
                        cardKind="food"
                    />
                }
                renderAddAction={(label, action) => (
                    <div
                        className="contents"
                        onClick={() =>
                            setModalStep(label === "Add a Food" ? "food" : initialTab)
                        }
                    >
                        {action}
                    </div>
                )}
                renderTab={(tab, label, className) => (
                    <Link
                        href={getTabHref(routeSegment, tab)}
                        className={className}
                    >
                        {label}
                    </Link>
                )}
                renderCard={(item) => (
                    <FoodCard
                        key={item.id}
                        item={item}
                        tripId={tripId}
                        updateFoodAction={updateFoodAction}
                        deleteFoodAction={deleteFoodAction}
                        moveItemAction={moveItemAction}
                        moveTargetTrips={moveTargetTrips}
                        toggleReactionAction={toggleReactionAction}
                        toggleTriedAction={toggleTriedAction}
                    />
                )}
            />
        </>
    );
}
