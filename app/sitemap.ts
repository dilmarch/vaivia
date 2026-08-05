import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/appUrl";

export default function sitemap(): MetadataRoute.Sitemap {
    const appUrl = getAppUrl();

    return [
        {
            url: appUrl,
            changeFrequency: "weekly",
            priority: 1,
        },
        {
            url: `${appUrl}/events`,
            changeFrequency: "daily",
            priority: 0.8,
        },
    ];
}
