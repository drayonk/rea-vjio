# SecondLine: a virtual second phone number app

SecondLine gives users a real second phone number for calls and texts, so they
never have to share their personal number. Typical uses are online selling,
dating, travel, business lines, and sign-ups.

| Feature                                                          | Status |
| ---------------------------------------------------------------- | ------ |
| Email account sign-up / sign-in                                  | ✅     |
| Browse and pick numbers by country, area code, and digits        | ✅     |
| Multiple numbers per account, with labels (Work, Selling…)       | ✅     |
| Two-way SMS with conversation threads and unread counts          | ✅     |
| Outgoing calls showing the virtual number as caller ID           | ✅     |
| Incoming calls forwarded to the user's real phone                | ✅     |
| Voicemail with in-app playback                                   | ✅     |
| Do Not Disturb (everything to voicemail, notifications muted)    | ✅     |
| Push notifications for new texts and voicemails                  | ✅     |
| Release a number                                                 | ✅     |
| Turn calls off per number (texts-only number)                    | ✅     |
| Identity protection: real number never exposed, call screening   | ✅     |
| Subscriptions (Premium / Pro) with free trial and paywall        | ✅     |
| In-app account deletion (App Store / Google Play requirement)    | ✅     |
| Clickable web demo with simulated data and a skippable paywall   | ✅     |

## Architecture

```
┌──────────────────────┐   HTTPS/JSON   ┌─────────────────────────┐   REST    ┌──────────┐
│  mobile/ (Expo, RN)  │ ─────────────▶ │ backend/ (Node, Express)│ ────────▶ │  Twilio  │
│  iOS + Android app   │ ◀── push ───── │  SQLite, auth, routing  │ ◀──────── │ (carrier)│
└──────────┬───────────┘   (Expo push)  └────────────▲────────────┘  webhooks └──────────┘
           │ store purchase                          │ entitlements (REST + webhook)
           ▼                                         │
   App Store / Google Play ─────────────────▶   RevenueCat
```

- **The carrier does the telephony.** Real phone numbers, SMS delivery, and PSTN
  calls come from a carrier API. Twilio is implemented in
  `backend/src/telephony/twilio.ts` against its REST API, with no SDK.
  A `MockProvider` lets you develop and test with no account and no cost.
  Other carriers (Telnyx, Vonage, Plivo) can be added by implementing the
  `TelephonyProvider` interface.
- **Calls use a bridge, not VoIP.** For an outgoing call, the backend rings
  the user's own phone, then connects them to the destination with the virtual
  number as caller ID. This works on any phone and needs no microphone or VoIP
  permissions. In-app VoIP calling, using the Twilio Voice SDK with CallKit and
  ConnectionService, is a possible later upgrade.
- **Webhooks are authenticated.** Every carrier callback is checked against the
  `X-Twilio-Signature` HMAC. Inbound SMS is de-duplicated by `MessageSid`, so
  carrier retries never create duplicate messages.
- **Users only see their own data.** Every API route resolves numbers through
  `ownedNumber(userId, numberId)`.
- **The user's identity stays hidden.** See "Privacy and identity" below.

## Privacy and identity

| Where identity could leak            | How SecondLine prevents it |
| ------------------------------------ | -------------------------- |
| Caller ID on outgoing calls and texts | Always the virtual number. The user's real phone is only rung by our carrier, never dialed out from. |
| Forwarded incoming calls             | The forwarded leg plays a private "press 1 to answer" prompt. If the user's **personal voicemail** picks up instead, nobody presses 1, so the caller gets SecondLine's generic voicemail and never hears a greeting that might include the user's name or real number. |
| Outgoing bridge calls                | Same check. The destination is dialed only after the user presses 1, so their own voicemail can never be connected to the other person. |
| Voicemail greeting                   | Generic, with no name or number. |
| Texts-only numbers                   | Calls can be turned off per number. Then the real phone isn't needed at all, and incoming calls are declined with a busy signal without being answered (the carrier doesn't bill declined calls). Declined calls still appear in the call log. |
| Data held by SecondLine              | Only an email and password are needed to sign up. The real phone is optional and only used for calls. |

Not covered: carriers require outgoing calls to carry a valid caller ID, so
"hide my number" (withheld caller ID) isn't offered. The virtual number is
always shown. Caller-ID *name* (CNAM) is unset on new numbers by default, so
displays show the number or its city, never the user's name.

## Subscriptions

| Plan    | Numbers | Texts / 30 days | Call minutes / 30 days |
| ------- | ------- | --------------- | ---------------------- |
| Free    | 0       | 0               | 0                      |
| Premium | 1       | 1,000           | 300                    |
| Pro     | 3       | 3,000           | 1,000                  |

The limits are defined in one place, `backend/src/plans.ts`. The paywall
reads them from the API, so changing a number there updates the app too.

**How it works**

- The app buys through **RevenueCat** (`react-native-purchases`), which handles
  both App Store and Google Play billing, receipts, trials, renewals, and
  refunds. The app logs in to RevenueCat with our user id.
- **The backend decides access, not the app.** It reads the user's
  entitlements from RevenueCat's REST API when the app calls
  `POST /api/subscription/refresh` after a purchase, and when RevenueCat sends
  a webhook to `/billing/revenuecat/webhook`. Webhooks only trigger a re-read,
  so duplicate or out-of-order events can't leave a wrong plan stored. If an
  expiry event is ever missed, a stored plan whose end date has passed still
  counts as free.
- **Limits are enforced on the server.** Getting a number, sending texts, and
  placing calls return `402 { code: "upgrade_required" }`, and the app opens
  the paywall with the reason. Usage is metered over a rolling 30 days.
  Forwarded inbound calls count toward minutes, and once over quota they go to
  voicemail.
- **When a subscription lapses:** outgoing texts and calls stop, incoming calls
  go to voicemail, and incoming texts are still saved, so renewing restores
  everything. After `LAPSED_RELEASE_DAYS` (default 7) the numbers are released
  to stop carrier charges. The app shows a "Renew before…" banner. The billing
  grace periods of Apple and Google count as active.
- **Upgrades:** Premium to Pro replaces the subscription instead of stacking
  a second one. On Android the purchase names the old product; on iOS, put
  all products in one subscription group.

**Setting it up**

1. In App Store Connect and Google Play Console, create auto-renewing
   subscriptions named `secondline_<plan>_<period>`, for example
   `secondline_premium_monthly`, `secondline_premium_annual`,
   `secondline_pro_monthly`, and `secondline_pro_annual`. On iOS, put them all
   in **one subscription group**. Add the free trial as an introductory offer
   (iOS) or a free-trial offer on the base plan (Android). The paywall shows a
   trial only to users eligible for it.
2. In RevenueCat, create a project with both apps and import the products.
   Create the entitlements **`premium`** and **`pro`** and attach the matching
   products. Add all packages to the **current offering**.
3. In RevenueCat, go to Integrations > Webhooks, set the URL to
   `https://<backend>/billing/revenuecat/webhook`, and set the authorization
   header to `Bearer <REVENUECAT_WEBHOOK_SECRET>`.
4. In `backend/.env`, set `BILLING_PROVIDER=revenuecat`,
   `REVENUECAT_SECRET_KEY` (the secret v1 key), and
   `REVENUECAT_WEBHOOK_SECRET`.
5. In `mobile/.env`, set `EXPO_PUBLIC_REVENUECAT_IOS_KEY`,
   `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (the public SDK keys), and your
   `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL`, which both stores
   require on subscription paywalls.
6. Purchases need a development or store build (`npx eas build`). In Expo Go,
   RevenueCat runs in a preview mode without real purchases. Test with
   sandbox (iOS) and license-tester (Android) accounts.

With `BILLING_PROVIDER=none` (the default) the paywall is off and every user
gets Pro limits. That's useful for local development.

> Turn the paywall on from your first public release. If you enable it later,
> existing users who never subscribed will hit the paywall for new actions.

**Pricing guidance.** Each number costs roughly $1–$2 a month at the carrier,
plus about $0.008 per SMS segment and $0.01–$0.02 per call minute (US rates;
check your carrier). A Premium user at full quota costs about $15 a month, so
set prices from your expected *average* usage rather than the cap. The
paywall preview used $7.99 monthly or $59.99 yearly for Premium, and $14.99 or
$119.99 for Pro, each with a 3-day trial on the yearly plan. Those are
placeholders: prices are set in the stores, not in code.

## Running locally (no carrier account needed)

Requires Node 22.13+.

```bash
# 1. Backend
cd backend
cp .env.example .env            # TELEPHONY_PROVIDER=mock by default
npm install
npm test                        # end-to-end API tests
export $(grep -v '^#' .env | xargs) && npm run dev

# 2. Mobile app (in another terminal)
cd mobile
cp .env.example .env            # set EXPO_PUBLIC_API_URL to your computer's LAN IP
npm install
npm start                       # scan the QR code with Expo Go, or press i / a
```

With the mock carrier, you can simulate incoming traffic by posting to the
webhooks:

```bash
curl -X POST localhost:4000/webhooks/sms \
  -d From=+14155550123 -d To=<your virtual number> -d Body="Hello!" -d MessageSid=SM1
curl -X POST localhost:4000/webhooks/voice \
  -d From=+14155550123 -d To=<your virtual number> -d CallSid=CA1
```

## Going live with Twilio

1. Create a Twilio account and upgrade it from trial, since trial accounts can
   only reach verified numbers.
2. In `backend/.env`, set `TELEPHONY_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`,
   and `TWILIO_AUTH_TOKEN` (Twilio Console > Account info).
3. Set `PUBLIC_BASE_URL` to the backend's public HTTPS URL. Twilio sends
   webhooks there, and signature checks need the exact URL. In development, use
   a tunnel such as `ngrok http 4000`.
4. Start the server, then check the connection:

   ```bash
   cd backend
   npm run twilio:check          # verifies credentials, account type, public URL, number webhooks
   npm run twilio:check -- --fix # repoints SecondLine's numbers at PUBLIC_BASE_URL
   ```

   Run it again whenever `PUBLIC_BASE_URL` changes, for example a new ngrok
   address. Numbers in the Twilio account that SecondLine doesn't own are
   listed but never changed.
5. **Compliance (required before real traffic):**
   - **US SMS:** messages from local (10DLC) numbers must be registered with
     A2P 10DLC (brand + campaign) or carriers will filter them. Toll-free
     numbers need toll-free verification.
   - **UK, EU, AU, and others:** many countries require a regulatory bundle
     (end-user identity and address) before a number can be bought. Purchases
     fail with a carrier error until it is approved.
   - Publish terms of service and an acceptable-use policy that prohibit spam,
     harassment, and fraud.
6. Push notifications: in `mobile/`, run `npx eas init` to get a project ID.
   The app registers its Expo push token automatically after sign-in. Push
   only works on physical devices.

## Shipping to the stores

```bash
cd mobile
npx eas build --platform android   # or ios
npx eas submit
```

- Change `bundleIdentifier` / `package` in `mobile/app.json` from
  `com.example.secondline` to your own.
- The app does **not** request SMS, call-log, or contacts permissions.
  Google Play restricts those permissions heavily, and the server-side design
  doesn't need them.
- Account deletion, which both stores require, is in Settings > Delete
  account. It asks for the password, releases the user's numbers at the
  carrier, deletes all of their texts, calls and settings, and erases their
  RevenueCat customer record. A store subscription can only be cancelled by
  the user, so the screen tells paying users to cancel it first and links to
  their store's subscription page. Give the stores the deletion steps when
  they ask.

## Production checklist

- [ ] Run behind HTTPS (a reverse proxy or a platform such as Fly, Render, or
      Railway) and keep the SQLite file on a persistent volume. Move to
      Postgres when you need more than one server instance.
- [ ] Generate a strong `AUTH_SECRET` (`openssl rand -base64 48`).
- [ ] Add rate limits on auth, SMS sending, and calls, for example
      `express-rate-limit`, to prevent abuse and runaway carrier bills.
- [ ] Verify the user's real phone with an OTP (e.g. Twilio Verify) before it
      can receive forwarded or bridged calls.
- [ ] Set carrier spend alerts and usage triggers in the Twilio console.
- [ ] Publish a privacy policy URL (both stores require one).

## Web demo

`mobile/` can build a clickable web demo of the real app that needs no
backend, carrier, or store:

```bash
cd mobile
npm run build:demo     # writes dist-demo/page.html and its files
```

Setting `EXPO_PUBLIC_DEMO=1` makes Metro swap in `mobile/demo/`:

- an in-browser fake API with the same routes, plan limits and error codes as
  the backend (it reads limits from `backend/src/plan-limits.ts`)
- a fake store with instant purchases and a "Skip paywall (demo)" link
- in-page dialogs

New numbers get a welcome text and a missed call, and a bot answers your
texts. Data stays in the browser. Normal builds don't include any of this.
`scripts/package-demo.mjs` makes the output work under any URL path, so it can
be hosted as a static page.

## Roadmap

- Win-back offers and paywall A/B tests (RevenueCat Experiments)
- In-app VoIP calling (Twilio Voice SDK, CallKit, ConnectionService)
- MMS (picture messages)
- Contacts and block list
- Custom voicemail greetings
- Number porting

## Project layout

```
backend/
  src/app.ts               route composition
  src/routes/              auth, me, numbers, messages, calls, webhooks
  src/telephony/           provider interface, Twilio, mock, TwiML builder
  src/plans.ts             plan limits and usage metering
  src/subscription.ts      entitlement checks, plan sync, lapsed-number release
  src/billing/             RevenueCat entitlement lookup + webhook auth
  src/account.ts           account deletion
  src/telephony/twilio-setup.ts  connection check behind `npm run twilio:check`
  test/                    end-to-end API, subscription, account and Twilio tests (node:test)
mobile/
  app/                     screens (expo-router file-based routes)
  src/api.ts               typed API client
  src/session.tsx          auth state (token in the device keychain)
  src/billing.ts           RevenueCat purchases, trials, restore
  src/subscription.tsx     plan state and paywall routing
  app/paywall.tsx          paywall screen
  src/notifications.ts     push registration
  app/delete-account.tsx   account deletion screen
  demo/                    web demo replacements (fake API, store, dialogs)
```
