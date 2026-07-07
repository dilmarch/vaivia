"use client";

import { ImagePlus, Link as LinkIcon, X } from "lucide-react";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TripDestinationPickerProps = {
    initialDestination?: string | null;
    initialCoverImageUrl?: string | null;
    tripId?: string | null;
    inputId: string;
    onChange?: () => void;
};

type DestinationOption = {
    label: string;
    coverImageUrl: string;
};

function getFlagEmoji(countryCode: string) {
    if (!/^[A-Z]{2}$/.test(countryCode)) return "";

    return countryCode
        .split("")
        .map((letter) => String.fromCodePoint(letter.charCodeAt(0) + 127397))
        .join("");
}

function getCountryFlag(place: google.maps.places.PlaceResult) {
    const country = place.address_components?.find((component) =>
        component.types.includes("country")
    );

    return country?.short_name ? getFlagEmoji(country.short_name) : "";
}

function prependFlag(label: string, flag: string) {
    if (!flag || label.startsWith(flag)) return label;
    return `${flag} ${label}`;
}

function parseDestinations(destination?: string | null) {
    if (!destination) return [];

    return destination
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((label) => ({ label, coverImageUrl: "" }));
}

function getImageExtension(file: File) {
    const mimeExtension = file.type.split("/")[1];
    const nameExtension = file.name.split(".").pop();
    return (mimeExtension || nameExtension || "jpg")
        .replace("jpeg", "jpg")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase();
}

function isSupportedImageUrl(url: string) {
    if (!url.trim()) return true;
    return /\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i.test(url.trim());
}

export default function TripDestinationPicker({
    initialDestination,
    initialCoverImageUrl,
    tripId,
    inputId,
    onChange,
}: TripDestinationPickerProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [customCoverImageUrl, setCustomCoverImageUrl] = useState(
        initialCoverImageUrl || ""
    );
    const [coverUrlError, setCoverUrlError] = useState("");
    const [uploadError, setUploadError] = useState("");
    const [isUploadingCover, setIsUploadingCover] = useState(false);
    const [destinations, setDestinations] = useState<DestinationOption[]>(() => {
        const parsedDestinations = parseDestinations(initialDestination);

        if (parsedDestinations[0] && initialCoverImageUrl) {
            parsedDestinations[0] = {
                ...parsedDestinations[0],
                coverImageUrl: initialCoverImageUrl,
            };
        }

        return parsedDestinations;
    });
    const destinationValue = useMemo(
        () => destinations.map((destination) => destination.label).join(", "),
        [destinations]
    );
    const automaticCoverImageUrl =
        destinations.length > 0
            ? destinations.find((destination) => destination.coverImageUrl)?.coverImageUrl ||
              ""
            : "";
    const coverImageUrl = customCoverImageUrl || automaticCoverImageUrl;

    useEffect(() => {
        const parsedDestinations = parseDestinations(initialDestination);

        if (parsedDestinations[0] && initialCoverImageUrl) {
            parsedDestinations[0] = {
                ...parsedDestinations[0],
                coverImageUrl: initialCoverImageUrl,
            };
        }

        setDestinations(parsedDestinations);
        setCustomCoverImageUrl(initialCoverImageUrl || "");
    }, [initialCoverImageUrl, initialDestination]);

    useEffect(() => {
        if (!isGoogleReady) return;
        if (!inputRef.current) return;
        if (!window.google?.maps?.places?.Autocomplete) return;

        const autocomplete = new window.google.maps.places.Autocomplete(
            inputRef.current,
            {
                fields: [
                    "address_components",
                    "name",
                    "formatted_address",
                    "photos",
                    "types",
                ],
                types: ["(regions)"],
            }
        );

        const listener = autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            const placeTypes = place.types || [];
            const isValidRegion = placeTypes.some((type) =>
                [
                    "locality",
                    "administrative_area_level_1",
                    "administrative_area_level_2",
                    "country",
                ].includes(type)
            );

            if (!isValidRegion) {
                inputRef.current!.value = "";
                return;
            }

            const label = prependFlag(
                place.name || place.formatted_address || "",
                getCountryFlag(place)
            );
            if (!label) return;

            const coverPhotoUrl =
                place.photos?.[0]?.getUrl({
                    maxWidth: 1200,
                    maxHeight: 675,
                }) || "";

            setDestinations((currentDestinations) => {
                if (
                    currentDestinations.some(
                        (destination) =>
                            destination.label.toLowerCase() === label.toLowerCase()
                    )
                ) {
                    return currentDestinations;
                }

                return [
                    ...currentDestinations,
                    {
                        label,
                        coverImageUrl: coverPhotoUrl,
                    },
                ];
            });

            inputRef.current!.value = "";
            onChange?.();
        });

        return () => {
            listener.remove();
        };
    }, [isGoogleReady, onChange]);

    function removeDestination(label: string) {
        setDestinations((currentDestinations) =>
            currentDestinations.filter((destination) => destination.label !== label)
        );
        onChange?.();
    }

    function updateCoverImageUrl(value: string) {
        setCustomCoverImageUrl(value);
        setCoverUrlError(
            isSupportedImageUrl(value)
                ? ""
                : "Use a direct image URL ending in .jpg, .jpeg, .png, .webp, .gif, .avif, or .svg."
        );
        onChange?.();
    }

    async function handleCoverUpload(file: File | null) {
        setUploadError("");
        if (!file) return;

        if (!tripId) {
            setUploadError("Save the trip first, then upload a custom cover photo.");
            return;
        }

        if (!file.type.startsWith("image/")) {
            setUploadError("Please choose an image file.");
            return;
        }

        setIsUploadingCover(true);

        try {
            const supabase = createClient();
            const extension = getImageExtension(file);
            const path = `${tripId}/cover.${extension}`;
            const { error } = await supabase.storage
                .from("trip-covers")
                .upload(path, file, {
                    cacheControl: "3600",
                    contentType: file.type || undefined,
                    upsert: true,
                });

            if (error) {
                console.error("Error uploading trip cover photo:", {
                    message: error.message,
                    bucket: "trip-covers",
                    path,
                    fileType: file.type,
                    fileSize: file.size,
                });
                setUploadError(
                    "Could not upload the photo. Make sure the trip-covers storage bucket exists and allows uploads."
                );
                return;
            }

            const { data } = supabase.storage.from("trip-covers").getPublicUrl(path);
            updateCoverImageUrl(data.publicUrl || "");
        } finally {
            setIsUploadingCover(false);
        }
    }

    return (
        <div>
            <Script
                src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
                strategy="afterInteractive"
                onLoad={() => setIsGoogleReady(true)}
                onReady={() => setIsGoogleReady(true)}
            />

            <input type="hidden" name="destination" value={destinationValue} />
            <input
                type="hidden"
                name="cover_image_url"
                value={coverImageUrl}
            />

            <label
                htmlFor={inputId}
                className="block text-sm font-medium text-slate-700"
            >
                Destination
            </label>
            <input
                id={inputId}
                ref={inputRef}
                type="text"
                autoComplete="off"
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore="true"
                placeholder="Search city, province/state, or country..."
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
            />

            {destinations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                    {destinations.map((destination) => (
                        <span
                            key={destination.label}
                            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700"
                        >
                            {destination.label}
                            <button
                                type="button"
                                onClick={() => removeDestination(destination.label)}
                                className="text-slate-500 transition hover:text-slate-900"
                                aria-label={`Remove ${destination.label}`}
                            >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                    Cover photo
                </div>
                <label
                    htmlFor={`${inputId}-cover-url`}
                    className="mt-3 block text-xs font-bold uppercase tracking-wide text-slate-500"
                >
                    Image link
                </label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                        <LinkIcon
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                            aria-hidden="true"
                        />
                        <input
                            id={`${inputId}-cover-url`}
                            type="url"
                            value={customCoverImageUrl}
                            onChange={(event) =>
                                updateCoverImageUrl(event.target.value)
                            }
                            placeholder="https://example.com/photo.jpg"
                            autoComplete="off"
                            data-form-type="other"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-4 text-slate-900"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingCover}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                        {isUploadingCover ? "Uploading..." : "Upload photo"}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(event) =>
                            void handleCoverUpload(event.target.files?.[0] || null)
                        }
                    />
                </div>
                {coverUrlError ? (
                    <p className="mt-2 text-xs font-medium text-red-700">
                        {coverUrlError}
                    </p>
                ) : null}
                {uploadError ? (
                    <p className="mt-2 text-xs font-medium text-red-700">
                        {uploadError}
                    </p>
                ) : null}
                <p className="mt-2 text-xs text-slate-500">
                    Paste a direct image URL or upload a photo to use as this trip&apos;s cover.
                </p>
            </div>
        </div>
    );
}
