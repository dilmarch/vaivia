# Weather notifications: Phase 3 operations

Phase 3 delivers each qualifying weather event through one canonical
`notifications` row. The database creates independent email and Web Push outbox
records only for channels the user has explicitly enabled. The existing
notification queue cron processes both channels; the weather-monitor request
does not wait for either provider.

## Required environment variables

Set these separately in each intended Vercel environment. Never expose the
private VAPID key or Resend key to browser code.

```dotenv
NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_SUBJECT=mailto:support@vaivia.app
RESEND_API_KEY=
RESEND_FROM_EMAIL=VAIVIA <notifications@updates.vaivia.app>
RESEND_REPLY_TO_EMAIL=
NEXT_PUBLIC_APP_URL=https://vaivia.app
CRON_SECRET=
WEATHER_CRON_SECRET=
```

The old VAPID variable names remain runtime fallbacks for a safe deployment
migration, but the names above are canonical. Keep one VAPID key pair stable;
rotating it invalidates existing browser subscriptions.

Generate a VAPID pair locally:

```bash
npx web-push generate-vapid-keys --json
```

Copy only the public value to `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`; the
private value belongs in `WEB_PUSH_VAPID_PRIVATE_KEY`.

## Resend setup

1. Verify the sending domain shown in `RESEND_FROM_EMAIL` in Resend and publish
   the DNS records Resend supplies.
2. Create a sending-only API key and store it as `RESEND_API_KEY` in Vercel.
3. Keep `NEXT_PUBLIC_APP_URL` canonical so Review plans and notification-settings
   links use `https://vaivia.app`.
4. Send a weather test to an internal account before enabling production users.
5. Inspect delivered mail for SPF/DKIM alignment, the Review plans deep link,
   Google attribution, and the local-authority safety statement.

Email requests use a stable notification idempotency key. Resend retains its
idempotency result for a limited provider window; the database sent state and
unique notification outbox record provide the durable application guard.

## iPhone and iPad instructions

Web Push requires iOS/iPadOS 16.4 or later and a Home Screen web app. In Safari,
open VAIVIA, use Share > Add to Home Screen, launch VAIVIA from the new icon,
then choose Enable push in Communication settings. The permission request is
made only after that button tap. No Apple Developer Program membership or
native APNs integration is required for standards-based Web Push.

## Delivery and retries

- The weather monitor creates the in-app source notification and returns.
- Database triggers independently enqueue opted-in email and push delivery.
- The existing five-minute notification cron claims bounded queue batches.
- Email and each push device retry with exponential backoff, capped at five
  attempts. A failing provider/channel does not stop the other channel.
- Push delivery state is per subscription. Devices that already succeeded are
  never resent when another device retries.
- HTTP 404/410 Web Push responses permanently revoke only the invalid device.
- Delivery tables store provider identifiers, hashed destination identifiers,
  sanitized error codes, timestamps, and idempotency keys. They do not expose
  endpoints, encryption keys, recipient addresses, or provider responses to
  browser roles.

## Manual browser verification

Test with a dedicated opted-in user and one synthetic qualifying alert:

1. Desktop Chrome: enable push from settings, confirm a subscription is
   listed, enable Weather > Push, and verify the notification opens Review plans.
2. Desktop Safari (macOS Ventura/Safari 16.1 or later): allow notifications
   after clicking Enable push, close or background VAIVIA, then verify the alert
   focuses the existing tab and opens the owned Review plans URL.
3. Android Chrome: repeat from the installed PWA and verify foreground,
   background, and lock-screen behavior.
4. iPhone/iPad: verify the in-browser Home Screen instruction, install the PWA,
   enable from a direct tap, then test focus/open behavior.
5. Denied permission: confirm settings explain that browser permission is
   blocked and email/in-app still work.
6. Unsupported browser: confirm VAIVIA stays usable and weather push cannot be
   selected.
7. Multiple devices: enable two, revoke one in settings, and confirm only the
   remaining subscription receives the next alert.
8. Failure isolation: temporarily use an invalid Resend credential in a preview
   environment and confirm push still sends; then restore it. Do the inverse by
   revoking a test push endpoint and confirm email still sends.
9. Confirm the lock-screen push contains no hotel name, private itinerary item,
   precise address, or detailed alert body.

## Deferred native work

This phase deliberately does not add a native iOS/Android application, native
APNs/FCM tokens, Apple entitlements, or a native notification-service extension.
The channel contract is provider-neutral so a future native adapter can consume
the same canonical notification without changing weather qualification or
creating a second notification record.
