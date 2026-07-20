<a href="https://demo-nextjs-with-supabase.vercel.app/">
  <img alt="Next.js and Supabase Starter Kit - the fastest way to build apps with Next.js and Supabase" src="https://demo-nextjs-with-supabase.vercel.app/opengraph-image.png">
  <h1 align="center">Next.js and Supabase Starter Kit</h1>
</a>

<p align="center">
 The fastest way to build apps with Next.js and Supabase
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#demo"><strong>Demo</strong></a> ·
  <a href="#deploy-to-vercel"><strong>Deploy to Vercel</strong></a> ·
  <a href="#clone-and-run-locally"><strong>Clone and run locally</strong></a> ·
  <a href="#feedback-and-issues"><strong>Feedback and issues</strong></a>
  <a href="#more-supabase-examples"><strong>More Examples</strong></a>
</p>
<br/>

## Features

- Works across the entire [Next.js](https://nextjs.org) stack
  - App Router
  - Pages Router
  - Proxy
  - Client
  - Server
  - It just works!
- supabase-ssr. A package to configure Supabase Auth to use cookies
- Password-based authentication block installed via the [Supabase UI Library](https://supabase.com/ui/docs/nextjs/password-based-auth)
- Styling with [Tailwind CSS](https://tailwindcss.com)
- Components with [shadcn/ui](https://ui.shadcn.com/)
- Optional deployment with [Supabase Vercel Integration and Vercel deploy](#deploy-your-own)
  - Environment variables automatically assigned to Vercel project

## Demo

You can view a fully working demo at [demo-nextjs-with-supabase.vercel.app](https://demo-nextjs-with-supabase.vercel.app/).

## Deploy to Vercel

Vercel deployment will guide you through creating a Supabase account and project.

After installation of the Supabase integration, all relevant environment variables will be assigned to the project so the deployment is fully functioning.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-supabase&project-name=nextjs-with-supabase&repository-name=nextjs-with-supabase&demo-title=nextjs-with-supabase&demo-description=This+starter+configures+Supabase+Auth+to+use+cookies%2C+making+the+user%27s+session+available+throughout+the+entire+Next.js+app+-+Client+Components%2C+Server+Components%2C+Route+Handlers%2C+Server+Actions+and+Middleware.&demo-url=https%3A%2F%2Fdemo-nextjs-with-supabase.vercel.app%2F&external-id=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-supabase&demo-image=https%3A%2F%2Fdemo-nextjs-with-supabase.vercel.app%2Fopengraph-image.png)

The above will also clone the Starter kit to your GitHub, you can clone that locally and develop locally.

If you wish to just develop locally and not deploy to Vercel, [follow the steps below](#clone-and-run-locally).

## Clone and run locally

1. You'll first need a Supabase project which can be made [via the Supabase dashboard](https://database.new)

2. Create a Next.js app using the Supabase Starter template npx command

   ```bash
   npx create-next-app --example with-supabase with-supabase-app
   ```

   ```bash
   yarn create next-app --example with-supabase with-supabase-app
   ```

   ```bash
   pnpm create next-app --example with-supabase with-supabase-app
   ```

3. Use `cd` to change into the app's directory

   ```bash
   cd with-supabase-app
   ```

4. Rename `.env.example` to `.env.local` and update the following:

  ```env
  NEXT_PUBLIC_SUPABASE_URL=[INSERT SUPABASE PROJECT URL]
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=[INSERT SUPABASE PROJECT API PUBLISHABLE OR ANON KEY]
  ```
  > [!NOTE]
  > This example uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, which refers to Supabase's new **publishable** key format.
  > Both legacy **anon** keys and new **publishable** keys can be used with this variable name during the transition period. Supabase's dashboard may show `NEXT_PUBLIC_SUPABASE_ANON_KEY`; its value can be used in this example.
  > See the [full announcement](https://github.com/orgs/supabase/discussions/29260) for more information.

  Both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` can be found in [your Supabase project's API settings](https://supabase.com/dashboard/project/_?showConnect=true)

5. You can now run the Next.js local development server:

   ```bash
   npm run dev
   ```

   The starter kit should now be running on [localhost:3000](http://localhost:3000/).

6. This template comes with the default shadcn/ui style initialized. If you instead want other ui.shadcn styles, delete `components.json` and [re-install shadcn/ui](https://ui.shadcn.com/docs/installation/next)

> Check out [the docs for Local Development](https://supabase.com/docs/guides/getting-started/local-development) to also run Supabase locally.

## VAIVIA transactional email

VAIVIA sends optional transactional notification emails through Resend. Production
and preview secrets should be configured in Vercel Environment Variables. Local
development values may live in `.env.local`, which must remain ignored by Git.

```env
RESEND_API_KEY=
RESEND_FROM_EMAIL=VAIVIA <notifications@updates.thetravellinglinguist.com>
RESEND_REPLY_TO_EMAIL=
NEXT_PUBLIC_APP_URL=https://app.thetravellinglinguist.com
```

Never place the Resend API key in source code, commit it, prefix it with
`NEXT_PUBLIC_`, or share it in prompts. Supabase secrets are not required for
Resend itself, but server-side processors that use service-role Supabase helpers
still require the existing server-only Supabase service role environment variable.

### Inbound travel-email forwarding

Inbound travel confirmations use the same Resend Receiving domain and provider.
Configure `RESEND_WEBHOOK_SECRET` and `EMAIL_IMPORT_DOMAIN` as server-only values
alongside `RESEND_API_KEY`. Resend must send verified `email.received` webhooks to
`/api/email-import/resend`.

New addresses use `<normalized-username>.<12-character-random-suffix>@<domain>`.
Legacy `trips+<48-character-token>@<domain>` addresses remain valid. A username
change creates a new primary address while the old address stays active; rotation
also keeps the previous address active unless the user explicitly confirms its
deactivation. Alias records are never reassigned to another user.

## VAIVIA assistant

The trip assistant uses dedicated server-only credentials. Phase 2A performs
bounded, read-only permanent-place discovery through Google Places API (New).
Phase 2B can answer explicitly current travel questions with Gemini Grounding
and Google Search. It does not scrape arbitrary URLs, calculate routes, make
bookings, or modify trip data.

```env
GEMINI_ASSISTANT_API_KEY=
GEMINI_ASSISTANT_MODEL=
AI_DAILY_MESSAGE_LIMIT=
GOOGLE_PLACES_API_KEY=
```

`GOOGLE_PLACES_API_KEY` must be a dedicated key restricted to the Places API
(New) and to the deployment's server environment. It is never exposed through a
`NEXT_PUBLIC_` variable. There is no separate daily Places allowance in Phase
2A: the existing per-user assistant quota and the hard limit of four external
tool calls (twenty unique candidates) per request bound usage. Search grounding
uses the existing `GEMINI_ASSISTANT_API_KEY` and permits at most one grounded
generation per request. Grounded answers, queries, citations, source metadata,
and Search Suggestions are not persisted; reopened conversations contain a
VAIVIA-authored prompt to refresh current information.

## VAIVIA Travel Companion extension

The Chrome extension source lives in `browser-extension/`. Its app-side routes
use the existing server-only Supabase service-role environment variable to
validate revocable extension sessions and enforce trip membership before any
capture is saved.

Once a production Chrome Web Store ID is assigned, restrict connection
callbacks in Vercel:

```env
VAIVIA_BROWSER_EXTENSION_IDS=your_32_character_chrome_extension_id
```

Multiple IDs, such as development and production packages, may be supplied as
a comma-separated list. Keep this variable server-only.

## Feedback and issues

Please file feedback and issues over on the [Supabase GitHub org](https://github.com/supabase/supabase/issues/new/choose).

## More Supabase examples

- [Next.js Subscription Payments Starter](https://github.com/vercel/nextjs-subscription-payments)
- [Cookie-based Auth and the Next.js 13 App Router (free course)](https://youtube.com/playlist?list=PL5S4mPUpp4OtMhpnp93EFSo42iQ40XjbF)
- [Supabase Auth and the Next.js App Router](https://github.com/supabase/supabase/tree/master/examples/auth/nextjs)
# VAIVIA Events

VAIVIA Events is a separate product area from Trips. Public discovery lives at
`/events`; attendees manage saved events, RSVPs, and tickets at `/my-events`;
authorized staff use `/organizer/events`. Only a super admin can assign the
global `event_organizer` role from Admin → Users.

## Event payments and Stripe webhook

Paid tickets use VAIVIA's standard Stripe account and Stripe Checkout. The
implementation does not use Stripe Connect, transfers, destination charges, or
organizer payouts. Configure these server-only values in the deployment:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL`

Register `POST /api/events/stripe/webhook` in Stripe for
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`,
`charge.refunded`, and `charge.dispute.created`. The route verifies Stripe's
raw-body signature and is idempotent. A Vercel cron calls
`/api/events/orders/release-expired` every ten minutes; it uses `CRON_SECRET` or
the optional `EVENTS_MAINTENANCE_SECRET` override.
The same protected maintenance schedule publishes events whose status is
`scheduled` once their configured publication time is reached.

## Event wallet setup

Apple Wallet needs an Apple Developer membership, a Wallet Pass Type ID, its
Pass Type ID certificate and private key, the Apple Team ID, and the current
Apple WWDR intermediate certificate. Store their base64-encoded contents and
password only in server-side `APPLE_WALLET_*` environment variables listed in
`.env.example`. Never commit certificate files. Until every value is present,
the ticket page deliberately shows “Apple Wallet isn’t configured yet”.

Google Wallet needs an approved Google Wallet issuer account, an Event Ticket
class named `<issuer-id>.vaivia_events`, and a Google Cloud service account with
access to that issuer. Configure `GOOGLE_WALLET_ISSUER_ID`,
`GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_WALLET_PRIVATE_KEY` on the
server. Until approval and credentials are present, the Google Wallet action is
disabled rather than pretending the integration is ready.

## Event email and storage setup

Event invitations, confirmations, cancellations, refunds, and void notices use
the existing Resend configuration and VAIVIA email layout. Event covers are
stored in the private `event-covers` Supabase bucket and delivered through
short-lived signed URLs. Organizer CSV exports are generated per authenticated
request and are never written to public storage.
