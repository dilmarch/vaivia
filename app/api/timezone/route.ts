import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const body = await request.json();

        const lat = body.lat ?? body.latitude;
        const lng = body.lng ?? body.longitude;

        if (lat == null || lng == null) {
            return NextResponse.json(
                { error: "Missing lat/lng" },
                { status: 400 }
            );
        }

        const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;

        if (!apiKey) {
            return NextResponse.json(
                { error: "Missing GOOGLE_MAPS_SERVER_API_KEY" },
                { status: 500 }
            );
        }

        const timestamp = Math.floor(Date.now() / 1000);

        const url =
            `https://maps.googleapis.com/maps/api/timezone/json` +
            `?location=${lat},${lng}` +
            `&timestamp=${timestamp}` +
            `&key=${apiKey}`;

        const googleResponse = await fetch(url);
        const data = await googleResponse.json();

        if (data.status !== "OK") {
            return NextResponse.json(
                {
                    error: "Google Time Zone API error",
                    status: data.status,
                    message: data.errorMessage ?? null,
                    raw: data,
                },
                { status: 500 }
            );
        }

        return NextResponse.json({
            timeZoneId: data.timeZoneId,
            timeZoneName: data.timeZoneName,
            rawOffset: data.rawOffset,
            dstOffset: data.dstOffset,
        });
    } catch (error) {
        console.error("Timezone API route error:", error);

        return NextResponse.json(
            { error: "Failed to detect timezone" },
            { status: 500 }
        );
    }
}