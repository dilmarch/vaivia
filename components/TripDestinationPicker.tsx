"use client";

import { ImagePlus, Search, UploadCloud, X } from "lucide-react";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";

type TripDestinationPickerProps = {
    initialDestination?: string | null;
    initialCoverImageUrl?: string | null;
    initialCoverImageSource?: string | null;
    initialCoverImageStoragePath?: string | null;
    initialCoverImageUnsplashId?: string | null;
    tripId?: string | null;
    inputId: string;
    onChange?: () => void;
    onDestinationsChange?: (
        destinations: Array<{ label: string; placeId?: string | null }>
    ) => void;
};

type DestinationOption = {
    label: string;
    coverImageUrl: string;
    placeId?: string | null;
};

type UnsplashResult = {
    id: string;
    altDescription?: string | null;
    urls: {
        small?: string | null;
        regular?: string | null;
    };
    user: {
        name?: string | null;
        html?: string | null;
    };
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

function stripFlag(destination: string) {
    return destination.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, "");
}

function isSupportedUpload(file: File) {
    return ["image/jpeg", "image/png", "image/webp"].includes(file.type);
}

export default function TripDestinationPicker({
    initialDestination,
    initialCoverImageUrl,
    initialCoverImageSource,
    initialCoverImageStoragePath,
    initialCoverImageUnsplashId,
    inputId,
    onChange,
    onDestinationsChange,
}: TripDestinationPickerProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [coverMode, setCoverMode] = useState<"upload" | "unsplash">("upload");
    const [selectedCoverSource, setSelectedCoverSource] = useState(
        initialCoverImageSource || (initialCoverImageUrl ? "external" : "")
    );
    const [selectedUnsplashId, setSelectedUnsplashId] = useState(
        initialCoverImageUnsplashId || ""
    );
    const [coverPreviewUrl, setCoverPreviewUrl] = useState(initialCoverImageUrl || "");
    const [coverRemoveRequested, setCoverRemoveRequested] = useState(false);
    const [uploadError, setUploadError] = useState("");
    const [unsplashQuery, setUnsplashQuery] = useState("");
    const [unsplashPage, setUnsplashPage] = useState(1);
    const [unsplashResults, setUnsplashResults] = useState<UnsplashResult[]>([]);
    const [isSearchingUnsplash, setIsSearchingUnsplash] = useState(false);
    const [unsplashError, setUnsplashError] = useState("");
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
    const coverImageUrl = coverPreviewUrl || automaticCoverImageUrl;

    useEffect(() => {
        const parsedDestinations = parseDestinations(initialDestination);

        if (parsedDestinations[0] && initialCoverImageUrl) {
            parsedDestinations[0] = {
                ...parsedDestinations[0],
                coverImageUrl: initialCoverImageUrl,
            };
        }

        setDestinations(parsedDestinations);
        setCoverPreviewUrl(initialCoverImageUrl || "");
        setSelectedCoverSource(
            initialCoverImageSource || (initialCoverImageUrl ? "external" : "")
        );
        setSelectedUnsplashId(initialCoverImageUnsplashId || "");
        setCoverRemoveRequested(false);
    }, [
        initialCoverImageSource,
        initialCoverImageUnsplashId,
        initialCoverImageUrl,
        initialDestination,
    ]);

    useEffect(() => {
        onDestinationsChange?.(
            destinations.map((destination) => ({
                label: destination.label,
                placeId: destination.placeId || null,
            }))
        );
    }, [destinations, onDestinationsChange]);

    useEffect(() => {
        if (unsplashQuery || !destinationValue && !initialDestination) return;
        setUnsplashQuery(
            stripFlag(
                parseDestinations(destinationValue || initialDestination)[0]?.label || ""
            ) ||
                "travel"
        );
    }, [destinationValue, initialDestination, unsplashQuery]);

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
                        placeId: place.place_id || null,
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

    function clearCover() {
        setCoverPreviewUrl("");
        setSelectedCoverSource("");
        setSelectedUnsplashId("");
        setCoverRemoveRequested(true);
        if (fileInputRef.current) fileInputRef.current.value = "";
        onChange?.();
    }

    function handleCoverUpload(file: File | null) {
        setUploadError("");
        if (!file) return;

        if (!isSupportedUpload(file)) {
            setUploadError("Upload a JPEG, PNG, or WebP image.");
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            setUploadError("Cover photos must be 10 MB or smaller.");
            return;
        }

        setCoverPreviewUrl(URL.createObjectURL(file));
        setSelectedCoverSource("upload");
        setSelectedUnsplashId("");
        setCoverRemoveRequested(false);
        onChange?.();
    }

    async function searchUnsplash(page = 1, append = false) {
        const query = unsplashQuery.trim() || "travel";
        setIsSearchingUnsplash(true);
        setUnsplashError("");

        try {
            const response = await fetch(
                `/api/unsplash/search?query=${encodeURIComponent(query)}&page=${page}`,
                { cache: "no-store" }
            );
            const payload = (await response.json()) as {
                error?: string;
                results?: UnsplashResult[];
            };
            if (!response.ok) throw new Error(payload.error || "Search failed.");
            setUnsplashResults((current) =>
                append ? [...current, ...(payload.results || [])] : payload.results || []
            );
            setUnsplashPage(page);
        } catch (error) {
            setUnsplashError(
                error instanceof Error ? error.message : "Could not search Unsplash."
            );
        } finally {
            setIsSearchingUnsplash(false);
        }
    }

    function selectUnsplashPhoto(photo: UnsplashResult) {
        setCoverPreviewUrl(photo.urls.regular || photo.urls.small || "");
        setSelectedCoverSource("unsplash");
        setSelectedUnsplashId(photo.id);
        setCoverRemoveRequested(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        onChange?.();
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
            <input type="hidden" name="cover_image_source" value={selectedCoverSource} />
            <input
                type="hidden"
                name="cover_image_unsplash_id"
                value={selectedUnsplashId}
            />
            <input
                type="hidden"
                name="cover_remove"
                value={coverRemoveRequested ? "true" : "false"}
            />
            <input
                type="hidden"
                name="existing_cover_image_storage_path"
                value={initialCoverImageStoragePath || ""}
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
                {coverImageUrl ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={coverImageUrl}
                            alt=""
                            className="aspect-video w-full object-cover"
                        />
                    </div>
                ) : (
                    <div className="mt-3 flex aspect-video items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm font-semibold text-slate-500">
                        No cover selected
                    </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setCoverMode("upload")}
                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition ${
                            coverMode === "upload"
                                ? "bg-slate-900 text-white"
                                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                    >
                        <UploadCloud className="h-4 w-4" aria-hidden="true" />
                        Upload
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setCoverMode("unsplash");
                            if (unsplashResults.length === 0) void searchUnsplash(1);
                        }}
                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition ${
                            coverMode === "unsplash"
                                ? "bg-slate-900 text-white"
                                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                    >
                        <Search className="h-4 w-4" aria-hidden="true" />
                        Browse Unsplash
                    </button>
                    {coverImageUrl ? (
                        <button
                            type="button"
                            onClick={clearCover}
                            className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-50"
                        >
                            Remove photo
                        </button>
                    ) : null}
                </div>

                {coverMode === "upload" ? (
                    <div className="mt-3">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700"
                        >
                            {coverImageUrl ? "Change photo" : "Upload photo"}
                        </button>
                        <p className="mt-2 text-xs text-slate-500">
                            JPEG, PNG, or WebP. Maximum 10 MB. Uploaded covers are private to you.
                        </p>
                    </div>
                ) : null}

                {coverMode === "unsplash" ? (
                    <div className="mt-3 space-y-3">
                        <div className="flex gap-2">
                            <input
                                value={unsplashQuery}
                                onChange={(event) =>
                                    setUnsplashQuery(event.target.value)
                                }
                                placeholder="Search Berlin, Tokyo, beaches..."
                                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-900"
                            />
                            <button
                                type="button"
                                onClick={() => searchUnsplash(1)}
                                disabled={isSearchingUnsplash}
                                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white transition hover:bg-slate-700 disabled:opacity-50"
                            >
                                Search
                            </button>
                        </div>
                        {unsplashError ? (
                            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                                {unsplashError}
                            </p>
                        ) : null}
                        <div className="grid max-h-80 gap-3 overflow-y-auto sm:grid-cols-2">
                            {isSearchingUnsplash && unsplashResults.length === 0
                                ? Array.from({ length: 4 }).map((_, index) => (
                                      <div
                                          key={index}
                                          className="aspect-video animate-pulse rounded-xl bg-slate-200"
                                      />
                                  ))
                                : unsplashResults.map((photo) => (
                                      <button
                                          key={photo.id}
                                          type="button"
                                          onClick={() => selectUnsplashPhoto(photo)}
                                          className={`overflow-hidden rounded-xl border bg-white text-left transition hover:-translate-y-0.5 ${
                                              selectedUnsplashId === photo.id
                                                  ? "border-lime-400 ring-2 ring-lime-300"
                                                  : "border-slate-200"
                                          }`}
                                      >
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img
                                              src={
                                                  photo.urls.small ||
                                                  photo.urls.regular ||
                                                  ""
                                              }
                                              alt={photo.altDescription || ""}
                                              className="aspect-video w-full object-cover"
                                          />
                                          <span className="block truncate px-3 py-2 text-xs font-semibold text-slate-600">
                                              Photo by {photo.user.name || "Unsplash"}
                                          </span>
                                      </button>
                                  ))}
                        </div>
                        {unsplashResults.length > 0 ? (
                            <button
                                type="button"
                                onClick={() => searchUnsplash(unsplashPage + 1, true)}
                                disabled={isSearchingUnsplash}
                                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                            >
                                Load more
                            </button>
                        ) : null}
                    </div>
                ) : null}

                    <input
                        ref={fileInputRef}
                        name="cover_upload_file"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(event) =>
                            handleCoverUpload(event.target.files?.[0] || null)
                        }
                    />
                {uploadError ? (
                    <p className="mt-2 text-xs font-medium text-red-700">
                        {uploadError}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
