import { NextResponse } from "next/server";

function decodeHtmlEntities(value: string) {
    return value
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function getMetaContent(html: string, property: string) {
    const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
        new RegExp(
            `<meta[^>]+property=["']${escapedProperty}["'][^>]+content=["']([^"']+)["'][^>]*>`,
            "i"
        ),
        new RegExp(
            `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escapedProperty}["'][^>]*>`,
            "i"
        ),
        new RegExp(
            `<meta[^>]+name=["']${escapedProperty}["'][^>]+content=["']([^"']+)["'][^>]*>`,
            "i"
        ),
        new RegExp(
            `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escapedProperty}["'][^>]*>`,
            "i"
        ),
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) return decodeHtmlEntities(match[1]);
    }

    return null;
}

function unwrapNextImageUrl(imageUrl: string, baseUrl: string) {
    const resolvedUrl = new URL(decodeHtmlEntities(imageUrl), baseUrl);

    if (!resolvedUrl.pathname.includes("/_next/image")) {
        return resolvedUrl.toString();
    }

    const nestedImageUrl = resolvedUrl.searchParams.get("url");

    if (!nestedImageUrl) {
        return resolvedUrl.toString();
    }

    return new URL(decodeHtmlEntities(nestedImageUrl), baseUrl).toString();
}

function resolveImageUrl(imageUrl: string, baseUrl: string) {
    try {
        return unwrapNextImageUrl(imageUrl, baseUrl);
    } catch {
        return null;
    }
}

function getLargestSrcsetImage(srcset: string, baseUrl: string) {
    const candidates = decodeHtmlEntities(srcset)
        .split(",")
        .map((candidate) => {
            const [url, width] = candidate.trim().split(/\s+/);
            return {
                url,
                width: Number(width?.replace("w", "")) || 0,
            };
        })
        .filter((candidate) => candidate.url);

    const largestCandidate = candidates.sort((a, b) => b.width - a.width)[0];
    if (!largestCandidate) return null;

    return resolveImageUrl(largestCandidate.url, baseUrl);
}

function getEventbriteHeroImage(html: string, baseUrl: string) {
    const heroImgMatch =
        html.match(/<img[^>]+data-testid=["']hero-img["'][^>]+src=["']([^"']+)["']/i) ||
        html.match(/<img[^>]+src=["']([^"']+)["'][^>]+data-testid=["']hero-img["']/i);

    if (heroImgMatch?.[1]) {
        return resolveImageUrl(heroImgMatch[1], baseUrl);
    }

    const heroSourceMatch =
        html.match(
            /<source[^>]+srcset=["']([^"']+)["'][^>]*data-testid=["']hero-image["']/i
        ) ||
        html.match(
            /<picture[^>]+data-testid=["']hero-image["'][\s\S]*?<source[^>]+srcset=["']([^"']+)["']/i
        ) ||
        html.match(/<source[^>]+srcset=["']([^"']*img\.evbuc\.com[^"']*)["']/i);

    if (heroSourceMatch?.[1]) {
        return getLargestSrcsetImage(heroSourceMatch[1], baseUrl);
    }

    const evbucImageMatch = html.match(
        /["']([^"']*(?:img|cdn)\.evbuc\.com[^"']*)["']/i
    );

    if (evbucImageMatch?.[1]) {
        return resolveImageUrl(evbucImageMatch[1], baseUrl);
    }

    return null;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
        return NextResponse.json({ imageUrl: null });
    }

    try {
        const parsedUrl = new URL(url);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            return NextResponse.json({ imageUrl: null }, { status: 400 });
        }

        const response = await fetch(parsedUrl.toString(), {
            headers: {
                "User-Agent": "VAIVIA link preview bot",
            },
            next: { revalidate: 60 * 60 * 24 },
        });

        if (!response.ok) {
            return NextResponse.json({ imageUrl: null });
        }

        const html = await response.text();
        const image =
            getEventbriteHeroImage(html, parsedUrl.toString()) ||
            getMetaContent(html, "og:image") ||
            getMetaContent(html, "twitter:image") ||
            getMetaContent(html, "twitter:image:src");

        return NextResponse.json({
            imageUrl: image ? resolveImageUrl(image, parsedUrl.toString()) : null,
        });
    } catch {
        return NextResponse.json({ imageUrl: null });
    }
}
