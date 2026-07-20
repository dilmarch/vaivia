import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/supabase";

export const ITINERARY_COVER_BUCKET = "trip-covers";

const MAX_COVER_SIZE = 10 * 1024 * 1024;
const ALLOWED_COVER_TYPES = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
]);

type ItineraryCoverPayload = {
    cover_image_url?: string | null;
    cover_image_source?: string | null;
    cover_image_storage_path?: string | null;
};

export type ExistingItineraryCover = {
    cover_image_source?: string | null;
    cover_image_storage_path?: string | null;
};

type ItineraryCoverClient = Pick<SupabaseClient<Database>, "storage">;

function hasFile(file: FormDataEntryValue | null): file is File {
    return Boolean(
        file &&
            typeof file === "object" &&
            "size" in file &&
            "type" in file &&
            Number(file.size) > 0
    );
}

function getExternalCoverUrl(formData: FormData) {
    const value = String(formData.get("cover_image_url") || "").trim();
    if (!value) return "";

    try {
        const parsedUrl = new URL(value);
        return parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:"
            ? value.slice(0, 4000)
            : "";
    } catch {
        return "";
    }
}

export function getItineraryCoverUpload(formData: FormData) {
    const file = formData.get("cover_upload_file");
    return hasFile(file) ? file : null;
}

export function isItineraryCoverRemovalRequested(formData: FormData) {
    return String(formData.get("cover_remove") || "") === "true";
}

export function validateItineraryCoverUpload(file: File) {
    const extension = ALLOWED_COVER_TYPES.get(file.type);
    if (!extension) {
        throw new Error("Upload a JPEG, PNG, or WebP image.");
    }

    if (file.size > MAX_COVER_SIZE) {
        throw new Error("Cover photos must be 10 MB or smaller.");
    }

    return extension;
}

export async function buildItineraryCoverPayloadFromForm({
    supabase,
    userId,
    tripId,
    formData,
}: {
    supabase: ItineraryCoverClient;
    userId: string;
    tripId: string;
    formData: FormData;
}): Promise<{
    payload: ItineraryCoverPayload;
    uploadedStoragePath?: string | null;
}> {
    if (isItineraryCoverRemovalRequested(formData)) {
        return {
            payload: {
                cover_image_url: null,
                cover_image_source: null,
                cover_image_storage_path: null,
            },
        };
    }

    const uploadFile = getItineraryCoverUpload(formData);
    if (uploadFile) {
        const extension = validateItineraryCoverUpload(uploadFile);
        const storagePath = `${userId}/${tripId}/itinerary/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage
            .from(ITINERARY_COVER_BUCKET)
            .upload(storagePath, uploadFile, {
                contentType: uploadFile.type,
                upsert: false,
            });

        if (error) {
            throw new Error(`Could not upload cover photo: ${error.message}`);
        }

        return {
            uploadedStoragePath: storagePath,
            payload: {
                cover_image_url: null,
                cover_image_source: "upload",
                cover_image_storage_path: storagePath,
            },
        };
    }

    const externalCoverUrl = getExternalCoverUrl(formData);
    if (externalCoverUrl) {
        return {
            payload: {
                cover_image_url: externalCoverUrl,
                cover_image_source: "external",
                cover_image_storage_path: null,
            },
        };
    }

    return { payload: {} };
}

export async function deleteItineraryCoverObject({
    supabase,
    storagePath,
}: {
    supabase: ItineraryCoverClient;
    storagePath?: string | null;
}) {
    if (!storagePath) return;

    const { error } = await supabase.storage
        .from(ITINERARY_COVER_BUCKET)
        .remove([storagePath]);

    if (error) {
        console.warn("Could not delete itinerary cover:", {
            message: error.message,
            storagePath,
        });
    }
}

export async function cleanupReplacedItineraryCover({
    supabase,
    oldCover,
    nextPayload,
}: {
    supabase: ItineraryCoverClient;
    oldCover?: ExistingItineraryCover | null;
    nextPayload: ItineraryCoverPayload;
}) {
    const oldPath = oldCover?.cover_image_storage_path;
    if (oldCover?.cover_image_source !== "upload" || !oldPath) return;
    if (nextPayload.cover_image_storage_path === oldPath) return;
    if (
        "cover_image_source" in nextPayload ||
        "cover_image_storage_path" in nextPayload
    ) {
        await deleteItineraryCoverObject({ supabase, storagePath: oldPath });
    }
}
