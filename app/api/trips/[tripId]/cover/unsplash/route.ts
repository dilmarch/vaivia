import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
    cleanupReplacedTripCover,
    getUnsplashCoverPayload,
} from "@/lib/tripCovers";

type RouteContext = {
    params: Promise<{ tripId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
    const { tripId } = await context.params;
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
        photoId?: string;
    } | null;
    const photoId = String(body?.photoId || "").trim();
    if (!photoId) {
        return NextResponse.json({ error: "Choose a photo." }, { status: 400 });
    }

    const { data: trip, error: tripError } = await supabase
        .from("trips")
        .select("id,cover_image_source,cover_image_storage_path")
        .eq("id", tripId)
        .maybeSingle();

    if (tripError || !trip) {
        return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }

    const nextPayload = await getUnsplashCoverPayload(photoId);
    const { error } = await supabase
        .from("trips")
        .update(nextPayload)
        .eq("id", tripId);

    if (error) {
        return NextResponse.json(
            { error: "Could not save cover photo." },
            { status: 500 }
        );
    }

    await cleanupReplacedTripCover({
        supabase,
        userId: user.id,
        oldCover: trip,
        nextPayload,
    });

    return NextResponse.json(nextPayload);
}
