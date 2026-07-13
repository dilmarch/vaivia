import type { SupabaseClient } from "@supabase/supabase-js";

const COVER_BUCKET = "trip-covers";
const MAX_COVER_SIZE = 10 * 1024 * 1024;
const ALLOWED_COVER_TYPES = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
]);
const UNSPLASH_UTM = "utm_source=vaivia&utm_medium=referral";

type TripCoverPayload = {
    cover_image_url?: string | null;
    cover_image_source?: string | null;
    cover_image_storage_path?: string | null;
    cover_image_unsplash_id?: string | null;
    cover_image_photographer_name?: string | null;
    cover_image_photographer_url?: string | null;
};

type ExistingTripCover = {
    cover_image_source?: string | null;
    cover_image_storage_path?: string | null;
};

type SupabaseLike = SupabaseClient<any, "public", any>;

function hasFile(file: FormDataEntryValue | null): file is File {
    return Boolean(
        file &&
            typeof file === "object" &&
            "size" in file &&
            "type" in file &&
            Number(file.size) > 0
    );
}

function appendUnsplashUtm(url?: string | null) {
    if (!url) return null;
    const separator = url.includes("?") ? "&" : "?";
    return url.includes("utm_source=") ? url : `${url}${separator}${UNSPLASH_UTM}`;
}

export function getCoverUploadFromForm(formData: FormData) {
    const file = formData.get("cover_upload_file");
    return hasFile(file) ? file : null;
}

export function getRequestedCoverSource(formData: FormData) {
    const source = String(formData.get("cover_image_source") || "").trim();
    return source === "upload" || source === "unsplash" ? source : "";
}

export function getRequestedUnsplashId(formData: FormData) {
    return String(formData.get("cover_image_unsplash_id") || "")
        .trim()
        .slice(0, 120);
}

export function getCoverRemoveRequested(formData: FormData) {
    return String(formData.get("cover_remove") || "") === "true";
}

export function validateCoverUpload(file: File) {
    const extension = ALLOWED_COVER_TYPES.get(file.type);
    if (!extension) {
        throw new Error("Upload a JPEG, PNG, or WebP image.");
    }

    if (file.size > MAX_COVER_SIZE) {
        throw new Error("Cover photos must be 10 MB or smaller.");
    }

    return extension;
}

export async function uploadPrivateTripCover({
    supabase,
    userId,
    tripId,
    file,
}: {
    supabase: SupabaseLike;
    userId: string;
    tripId: string;
    file: File;
}) {
    const extension = validateCoverUpload(file);
    const storagePath = `${userId}/${tripId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage
        .from(COVER_BUCKET)
        .upload(storagePath, file, {
            contentType: file.type,
            upsert: false,
        });

    if (error) {
        throw new Error(`Could not upload cover photo: ${error.message}`);
    }

    return storagePath;
}

export async function deleteOwnedTripCoverObject({
    supabase,
    userId,
    storagePath,
}: {
    supabase: SupabaseLike;
    userId: string;
    storagePath?: string | null;
}) {
    if (!storagePath || !storagePath.startsWith(`${userId}/`)) return;
    const { error } = await supabase.storage.from(COVER_BUCKET).remove([storagePath]);
    if (error) {
        console.warn("Could not delete old private trip cover:", {
            message: error.message,
            storagePath,
        });
    }
}

export async function getUnsplashCoverPayload(photoId: string): Promise<TripCoverPayload> {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey) throw new Error("Unsplash is not configured.");

    const safePhotoId = photoId.trim();
    if (!safePhotoId) throw new Error("Choose an Unsplash photo.");

    const response = await fetch(`https://api.unsplash.com/photos/${safePhotoId}`, {
        headers: {
            Authorization: `Client-ID ${accessKey}`,
            "Accept-Version": "v1",
        },
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error("Could not load that Unsplash photo.");
    }

    const photo = (await response.json()) as {
        id?: string;
        urls?: { regular?: string | null };
        links?: { download_location?: string | null };
        user?: { name?: string | null; links?: { html?: string | null } };
    };

    const downloadLocation = photo.links?.download_location;
    if (downloadLocation) {
        await fetch(downloadLocation, {
            headers: {
                Authorization: `Client-ID ${accessKey}`,
                "Accept-Version": "v1",
            },
            cache: "no-store",
        }).catch((error) => {
            console.warn("Could not track Unsplash download:", error);
        });
    }

    if (!photo.id || !photo.urls?.regular) {
        throw new Error("Unsplash returned an incomplete photo.");
    }

    return {
        cover_image_url: photo.urls.regular,
        cover_image_source: "unsplash",
        cover_image_storage_path: null,
        cover_image_unsplash_id: photo.id,
        cover_image_photographer_name: photo.user?.name || null,
        cover_image_photographer_url: appendUnsplashUtm(photo.user?.links?.html),
    };
}

export async function buildTripCoverPayloadFromForm({
    supabase,
    userId,
    tripId,
    formData,
}: {
    supabase: SupabaseLike;
    userId: string;
    tripId: string;
    formData: FormData;
}): Promise<{ payload: TripCoverPayload; uploadedStoragePath?: string | null }> {
    if (getCoverRemoveRequested(formData)) {
        return {
            payload: {
                cover_image_url: null,
                cover_image_source: null,
                cover_image_storage_path: null,
                cover_image_unsplash_id: null,
                cover_image_photographer_name: null,
                cover_image_photographer_url: null,
            },
        };
    }

    const uploadFile = getCoverUploadFromForm(formData);
    if (uploadFile) {
        const storagePath = await uploadPrivateTripCover({
            supabase,
            userId,
            tripId,
            file: uploadFile,
        });

        return {
            uploadedStoragePath: storagePath,
            payload: {
                cover_image_url: null,
                cover_image_source: "upload",
                cover_image_storage_path: storagePath,
                cover_image_unsplash_id: null,
                cover_image_photographer_name: null,
                cover_image_photographer_url: null,
            },
        };
    }

    if (getRequestedCoverSource(formData) === "unsplash") {
        return {
            payload: await getUnsplashCoverPayload(getRequestedUnsplashId(formData)),
        };
    }

    return { payload: {} };
}

export async function cleanupReplacedTripCover({
    supabase,
    userId,
    oldCover,
    nextPayload,
}: {
    supabase: SupabaseLike;
    userId: string;
    oldCover?: ExistingTripCover | null;
    nextPayload: TripCoverPayload;
}) {
    const oldPath = oldCover?.cover_image_storage_path;
    if (oldCover?.cover_image_source !== "upload" || !oldPath) return;
    if (nextPayload.cover_image_storage_path === oldPath) return;
    if (
        "cover_image_source" in nextPayload ||
        "cover_image_storage_path" in nextPayload
    ) {
        await deleteOwnedTripCoverObject({ supabase, userId, storagePath: oldPath });
    }
}
