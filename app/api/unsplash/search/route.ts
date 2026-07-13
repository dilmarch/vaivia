import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type UnsplashPhoto = {
    id: string;
    width: number;
    height: number;
    color?: string | null;
    blur_hash?: string | null;
    alt_description?: string | null;
    urls?: {
        small?: string | null;
        regular?: string | null;
        full?: string | null;
    };
    links?: {
        download_location?: string | null;
    };
    user?: {
        name?: string | null;
        links?: {
            html?: string | null;
        };
    };
};

function normalizePage(value: string | null) {
    const page = Number(value || "1");
    return Number.isInteger(page) && page > 0 ? Math.min(page, 20) : 1;
}

export async function GET(request: Request) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey) {
        return NextResponse.json(
            { error: "Unsplash is not configured." },
            { status: 503 }
        );
    }

    const url = new URL(request.url);
    const query = (url.searchParams.get("query") || "").trim().slice(0, 80);
    const page = normalizePage(url.searchParams.get("page"));

    if (query.length < 2) {
        return NextResponse.json(
            { error: "Search for a destination or travel theme." },
            { status: 400 }
        );
    }

    const unsplashUrl = new URL("https://api.unsplash.com/search/photos");
    unsplashUrl.searchParams.set("query", query);
    unsplashUrl.searchParams.set("page", String(page));
    unsplashUrl.searchParams.set("per_page", "24");
    unsplashUrl.searchParams.set("orientation", "landscape");

    const response = await fetch(unsplashUrl, {
        headers: {
            Authorization: `Client-ID ${accessKey}`,
            "Accept-Version": "v1",
        },
        cache: "no-store",
    });

    if (!response.ok) {
        return NextResponse.json(
            { error: "Could not search Unsplash." },
            { status: response.status }
        );
    }

    const payload = (await response.json()) as {
        total?: number;
        total_pages?: number;
        results?: UnsplashPhoto[];
    };

    return NextResponse.json({
        total: payload.total || 0,
        totalPages: payload.total_pages || 0,
        page,
        results: (payload.results || []).map((photo) => ({
            id: photo.id,
            width: photo.width,
            height: photo.height,
            colour: photo.color || null,
            blurHash: photo.blur_hash || null,
            altDescription: photo.alt_description || null,
            urls: {
                small: photo.urls?.small || null,
                regular: photo.urls?.regular || null,
                full: photo.urls?.full || null,
            },
            links: {
                downloadLocation: photo.links?.download_location || null,
            },
            user: {
                name: photo.user?.name || null,
                html: photo.user?.links?.html || null,
            },
        })),
    });
}
