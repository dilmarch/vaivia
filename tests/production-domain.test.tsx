import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@react-email/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenericNotificationEmail } from "@/emails/notifications/GenericNotificationEmail";
import {
    getBrowserAbsoluteAppUrl,
    getBrowserAppOrigin,
    getMigrationCompatibleAppOrigins,
    isProductionAppOrigin,
    PRODUCTION_APP_ORIGINS,
} from "@/lib/appOrigins";
import {
    getAbsoluteAppUrl,
    getAppUrl,
    getTrustedRequestOrigin,
    isAllowedServerAppOrigin,
} from "@/lib/appUrl";
import { isSameOriginRequest } from "@/lib/browserExtension/auth";
import { getEmailSenderConfig } from "@/lib/email/resend";
import { getEventCheckoutRedirectUrls } from "@/lib/events/urls";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("canonical application URL", () => {
    it("uses the configured canonical production URL", () => {
        expect(
            getAppUrl({ NEXT_PUBLIC_APP_URL: "https://vaivia.app" })
        ).toBe("https://vaivia.app");
        expect(
            getAbsoluteAppUrl("/settings", {
                NEXT_PUBLIC_APP_URL: "https://vaivia.app",
            })
        ).toBe("https://vaivia.app/settings");
    });

    it("preserves Vercel preview deployment origins", () => {
        const environment = {
            NEXT_PUBLIC_APP_URL: "https://vaivia.app",
            VERCEL_ENV: "preview",
            VERCEL_URL: "vaivia-git-domain-migration-team.vercel.app",
        };

        expect(getAppUrl(environment)).toBe(
            "https://vaivia-git-domain-migration-team.vercel.app"
        );
        expect(
            isAllowedServerAppOrigin(
                "https://vaivia-git-domain-migration-team.vercel.app",
                environment
            )
        ).toBe(true);
        expect(
            isAllowedServerAppOrigin(
                "https://unrelated-project.vercel.app",
                environment
            )
        ).toBe(false);
    });

    it("falls back to localhost outside a configured deployment", () => {
        expect(getAppUrl({})).toBe("http://localhost:3000");
        expect(isAllowedServerAppOrigin("http://localhost:3000", {})).toBe(true);
        expect(isAllowedServerAppOrigin("http://127.0.0.1:3000", {})).toBe(true);
        expect(
            isAllowedServerAppOrigin("http://localhost:3000", {
                NEXT_PUBLIC_APP_URL: "https://vaivia.app",
                VERCEL_ENV: "production",
            })
        ).toBe(false);
    });
});

describe("trusted application origins", () => {
    it("temporarily permits both production origins", () => {
        expect(PRODUCTION_APP_ORIGINS).toEqual([
            "https://vaivia.app",
            "https://app.thetravellinglinguist.com",
        ]);
        for (const origin of PRODUCTION_APP_ORIGINS) {
            expect(isProductionAppOrigin(origin)).toBe(true);
            expect(isAllowedServerAppOrigin(origin, {})).toBe(true);
        }
        expect(
            getMigrationCompatibleAppOrigins("https://vaivia.app")
        ).toEqual(PRODUCTION_APP_ORIGINS);
        expect(
            getMigrationCompatibleAppOrigins(
                "https://vaivia-feature-team.vercel.app"
            )
        ).toEqual(["https://vaivia-feature-team.vercel.app"]);
    });

    it("does not trust an arbitrary request host for absolute URLs", () => {
        expect(
            getTrustedRequestOrigin("https://attacker.example", {
                NEXT_PUBLIC_APP_URL: "https://vaivia.app",
            })
        ).toBe("https://vaivia.app");
    });

    it("enforces the trusted origin policy on same-origin extension requests", () => {
        expect(
            isSameOriginRequest(
                new Request("https://vaivia.app/api/extension/authorize", {
                    headers: { origin: "https://vaivia.app" },
                })
            )
        ).toBe(true);
        expect(
            isSameOriginRequest(
                new Request(
                    "https://app.thetravellinglinguist.com/api/extension/authorize",
                    {
                        headers: {
                            origin: "https://app.thetravellinglinguist.com",
                        },
                    }
                )
            )
        ).toBe(true);
        expect(
            isSameOriginRequest(
                new Request("https://attacker.example/api/extension/authorize", {
                    headers: { origin: "https://attacker.example" },
                })
            )
        ).toBe(false);
    });
});

describe("authentication redirect URLs", () => {
    it("uses the canonical and legacy origins when the app is served there", () => {
        expect(
            getBrowserAbsoluteAppUrl(
                "/auth/callback?next=%2Fsettings",
                "https://vaivia.app"
            )
        ).toBe("https://vaivia.app/auth/callback?next=%2Fsettings");
        expect(
            getBrowserAbsoluteAppUrl(
                "/auth/update-password",
                "https://app.thetravellinglinguist.com"
            )
        ).toBe(
            "https://app.thetravellinglinguist.com/auth/update-password"
        );
    });

    it("preserves localhost and browser-visible Vercel previews", () => {
        expect(getBrowserAppOrigin("http://localhost:3000")).toBe(
            "http://localhost:3000"
        );
        expect(
            getBrowserAppOrigin("https://vaivia-feature-team.vercel.app")
        ).toBe("https://vaivia-feature-team.vercel.app");
    });
});

describe("server-generated links", () => {
    it("uses the canonical URL in email configuration and rendered links", async () => {
        vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://vaivia.app");
        vi.stubEnv(
            "RESEND_FROM_EMAIL",
            "VAIVIA <notifications@updates.vaivia.app>"
        );
        vi.stubEnv("VERCEL_ENV", "production");
        vi.stubEnv("VERCEL_URL", "vaivia-deployment.vercel.app");

        const sender = getEmailSenderConfig();
        const actionUrl = `${sender.appUrl}/notifications`;
        const html = await render(
            <GenericNotificationEmail
                appUrl={sender.appUrl}
                eyebrow="Trip invitation"
                title="You are invited"
                body="Open VAIVIA to review your invitation."
                actionUrl={actionUrl}
                actionLabel="View invitation"
                preview="A VAIVIA invitation is waiting."
            />
        );

        expect(sender.appUrl).toBe("https://vaivia.app");
        expect(html).toContain("https://vaivia.app/notifications");
        expect(html).toContain(
            "https://vaivia.app/settings?section=notifications"
        );
    });

    it("creates canonical Stripe success and cancellation URLs", () => {
        expect(
            getEventCheckoutRedirectUrls({
                orderId: "order-123",
                eventSlug: "summer-pride",
                appUrl: "https://vaivia.app",
            })
        ).toEqual({
            successUrl:
                "https://vaivia.app/events/checkout/success?order=order-123",
            cancelUrl:
                "https://vaivia.app/events/summer-pride?checkout=cancelled",
        });
    });
});

describe("metadata routes and extension configuration", () => {
    it("publishes canonical robots and sitemap URLs", () => {
        vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://vaivia.app");
        vi.stubEnv("VERCEL_ENV", "production");
        vi.stubEnv("VERCEL_URL", "vaivia-deployment.vercel.app");

        expect(robots()).toMatchObject({
            host: "https://vaivia.app",
            sitemap: "https://vaivia.app/sitemap.xml",
        });
        expect(sitemap().map((entry) => entry.url)).toEqual([
            "https://vaivia.app",
            "https://vaivia.app/events",
        ]);

        const rootLayout = readFileSync(
            resolve(process.cwd(), "app/layout.tsx"),
            "utf8"
        );
        expect(rootLayout).toContain("metadataBase: new URL(appUrl)");
        expect(rootLayout).toContain('canonical: "/"');
        expect(rootLayout).toContain("openGraph:");
    });

    it("keeps the manifest same-origin and permits both extension hosts", () => {
        const appManifest = readFileSync(
            resolve(process.cwd(), "app/manifest.ts"),
            "utf8"
        );
        const extensionManifest = JSON.parse(
            readFileSync(
                resolve(process.cwd(), "browser-extension/public/manifest.json"),
                "utf8"
            )
        ) as { host_permissions: string[] };

        expect(appManifest).toContain('start_url: "/"');
        expect(appManifest).toContain('scope: "/"');
        expect(extensionManifest.host_permissions).toEqual(
            expect.arrayContaining([
                "https://vaivia.app/*",
                "https://app.thetravellinglinguist.com/*",
            ])
        );
    });
});
