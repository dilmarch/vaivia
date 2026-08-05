import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/appUrl";

export default function robots(): MetadataRoute.Robots {
    const appUrl = getAppUrl();

    return {
        rules: {
            userAgent: "*",
            allow: ["/", "/events", "/events/"],
            disallow: [
                "/api/",
                "/auth/",
                "/extension/",
                "/imports/",
                "/my-events/",
                "/notifications/",
                "/organizer/",
                "/settings/",
                "/trips/",
            ],
        },
        sitemap: `${appUrl}/sitemap.xml`,
        host: appUrl,
    };
}
