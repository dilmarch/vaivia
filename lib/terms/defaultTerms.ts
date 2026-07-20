export const DEFAULT_TERMS_TITLE = "VAIVIA Terms and Privacy Notice";

export const DEFAULT_TERMS_CONTENT = `# VAIVIA Terms and Privacy Notice

Last updated: July 2026

These starter terms explain how VAIVIA works, what information the app may process, and the choices available to you. They are provided as a practical product baseline and should be reviewed with qualified legal counsel before being treated as legal advice.

## Using VAIVIA

VAIVIA helps you plan trips, organize itineraries, save passport-style travel records, manage friends and trip mates, track budgets, and receive account notifications. You agree to use VAIVIA lawfully, respectfully, and only for information you are allowed to provide.

## Your account

You are responsible for keeping your login credentials secure and for activity that happens through your account. If you use single sign-on, the identity provider may also process authentication information under its own terms.

## Information VAIVIA stores

Depending on the features you use, VAIVIA may store account details, profile information, trips, destinations, itinerary items, transportation plans, stays, budgets, expenses, passport stamp records, bucket list items, friend connections, feature suggestions, notification settings, theme preferences, and consent choices.

## Privacy rights

People in Canada, the United States, the United Kingdom, the European Economic Area, Switzerland, Australia, and New Zealand may have privacy rights depending on where they live and which laws apply. These rights may include access, correction, deletion, portability, objection, restriction, withdrawal of consent, and the right to complain to a regulator. VAIVIA will provide reasonable ways to exercise applicable rights, including in-app export controls and support channels for requests that cannot be completed automatically.

## Access and portability exports

Settings → Privacy & Data lets you request a downloadable copy of personal information associated with your VAIVIA account. Automated exports generally include structured JSON and CSV files for account profile details, preferences, trips, itinerary and planning records, transportation, stays, ideas, food, budgets, expenses, passport stamps, bucket list items, friend relationships and invitations, notification preferences and history, consent records, activity records maintained by VAIVIA, and eligible uploaded files you own.

VAIVIA may withhold, redact, or summarize third-party data, another person's private profile details, legally privileged material, fraud or security information, secrets, session tokens, password hashes, push subscription encryption secrets, and information that applicable law allows or requires VAIVIA not to disclose. Export archives are generated server-side, stored privately, and made available through short-lived authenticated links. They are normally available for 7 days before expiring.

For broader formal privacy requests, VAIVIA may need to verify your identity using account-based reauthentication or other reasonable steps. VAIVIA does not ask for unnecessary government identification for routine in-app exports. Contact VAIVIA for accessibility needs or alternative export formats.

## Legal bases and consent

VAIVIA may process information to provide the app, secure accounts, remember preferences, support shared trips, send requested notifications, comply with law, and improve the service. Marketing emails are optional and can be turned on or off from Communications settings.

## Sharing and visibility

Trip information may be visible to trip mates you invite or accept. Friends can see profile information that VAIVIA makes available in friend profile views. VAIVIA does not intentionally reveal private account controls to other users.

## Location and third-party services

Some location entry fields may use Google Places or similar validation tools. External travel services, airline links, maps, or websites may have separate terms and privacy notices.

## Notifications

VAIVIA may send in-app, email, browser, or push notifications based on your settings and the notification types available in the app. Some account or safety messages may still be shown when needed to operate the service.

## Data retention

VAIVIA keeps information while your account is active or as needed for the service, security, legal obligations, disputes, backups, and legitimate business records. You may request export or deletion where available and legally required. Export and deletion are separate requests; downloading your information does not delete your account.

## User content

You keep ownership of your content. You give VAIVIA permission to host, process, display, and transmit it as needed to provide the app and shared trip features.

## Changes to these terms

VAIVIA may make minor updates that do not require acceptance, or major updates that require you to accept the current terms before continuing to use interactive account features.

## Contact

For privacy, account, unsubscribe, or data requests, contact the VAIVIA operator through the support or feedback channels available in the app.`;

export function renderTermsMarkdown(content: string) {
    return content
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block, index) => {
            if (block.startsWith("# ")) {
                return {
                    key: `h1-${index}`,
                    type: "h1" as const,
                    text: block.replace(/^#\s+/, ""),
                };
            }

            if (block.startsWith("## ")) {
                return {
                    key: `h2-${index}`,
                    type: "h2" as const,
                    text: block.replace(/^##\s+/, ""),
                };
            }

            return {
                key: `p-${index}`,
                type: "p" as const,
                text: block,
            };
        });
}
