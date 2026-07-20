import { NextResponse } from "next/server";
import { ITINERARY_COVER_BUCKET } from "@/lib/itineraryCovers";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
    params: Promise<{
        tripId: string;
        itemId: string;
    }>;
};

function coverError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
    const { tripId, itemId } = await context.params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return coverError("Unauthorized", 401);

    const { data: item, error } = await supabase
        .from("itinerary_items")
        .select("id,trip_id,cover_image_source,cover_image_storage_path")
        .eq("id", itemId)
        .eq("trip_id", tripId)
        .maybeSingle();

    if (error) {
        console.error("Could not load itinerary cover:", {
            message: error.message,
            code: error.code,
            tripId,
            itemId,
        });
        return coverError("Could not load cover", 500);
    }

    if (
        !item ||
        item.cover_image_source !== "upload" ||
        !item.cover_image_storage_path
    ) {
        return coverError("No uploaded cover", 404);
    }

    const pathParts = item.cover_image_storage_path.split("/");
    if (
        pathParts.length !== 4 ||
        pathParts[1] !== tripId ||
        pathParts[2] !== "itinerary" ||
        !pathParts[0] ||
        !pathParts[3]
    ) {
        return coverError("Invalid cover path", 403);
    }

    let serviceSupabase: ReturnType<typeof createServiceRoleClient>;
    try {
        serviceSupabase = createServiceRoleClient();
    } catch (serviceError) {
        console.error("Itinerary cover service client is not configured:", serviceError);
        return coverError("Cover service is not configured", 500);
    }

    const { data, error: signedUrlError } = await serviceSupabase.storage
        .from(ITINERARY_COVER_BUCKET)
        .createSignedUrl(item.cover_image_storage_path, 10 * 60);

    if (signedUrlError || !data?.signedUrl) {
        console.error("Could not sign itinerary cover URL:", {
            message: signedUrlError?.message,
            tripId,
            itemId,
        });
        return coverError("Could not sign cover", 500);
    }

    return NextResponse.json(
        { signedUrl: data.signedUrl },
        { headers: { "Cache-Control": "private, no-store" } }
    );
}
