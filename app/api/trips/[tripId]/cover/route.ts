import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const COVER_BUCKET = "trip-covers";

type RouteContext = {
    params: Promise<{ tripId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
    const { tripId } = await context.params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: trip, error } = await supabase
        .from("trips")
        .select("id,cover_image_source,cover_image_storage_path")
        .eq("id", tripId)
        .maybeSingle();

    if (error) {
        console.error("Could not load trip cover:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            tripId,
        });
        return NextResponse.json({ error: "Could not load cover" }, { status: 500 });
    }

    if (
        !trip ||
        trip.cover_image_source !== "upload" ||
        !trip.cover_image_storage_path
    ) {
        return NextResponse.json({ error: "No uploaded cover" }, { status: 404 });
    }

    if (!trip.cover_image_storage_path.startsWith(`${user.id}/`)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error: signedUrlError } = await supabase.storage
        .from(COVER_BUCKET)
        .createSignedUrl(trip.cover_image_storage_path, 10 * 60);

    if (signedUrlError || !data?.signedUrl) {
        console.error("Could not sign trip cover URL:", {
            message: signedUrlError?.message,
            tripId,
        });
        return NextResponse.json({ error: "Could not sign cover" }, { status: 500 });
    }

    return NextResponse.json(
        { signedUrl: data.signedUrl },
        {
            headers: {
                "Cache-Control": "private, no-store",
            },
        }
    );
}
