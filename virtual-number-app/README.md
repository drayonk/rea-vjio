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
| Paywall / subscriptions / credits                                | ⏳ not yet decided |

## Architecture

```
┌──────────────────────┐   HTTPS/JSON   ┌─────────────────────────┐   REST    ┌──────────┐
│  mobile/ (Expo, RN)  │ ─────────────▶ │ backend/ (Node, Express)│ ────────▶ │  Twilio  │
│  iOS + Android app   │ ◀── push ───── │  SQLite, auth, routing  │ ◀──────── │ (carrier)│
└──────────────────────┘   (Expo push)  └─────────────────────────┘  webhooks └──────────┘
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
- **The real phone stays private.** It is used only to forward calls and to
  connect bridge calls. Callers never see it.

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
   and `TWILIO_AUTH_TOKEN`.
3. Set `PUBLIC_BASE_URL` to the backend's public HTTPS URL. Twilio sends
   webhooks there, and signature checks need the exact URL. In development, use
   a tunnel such as `ngrok http 4000`.
4. **Compliance (required before real traffic):**
   - **US SMS:** messages from local (10DLC) numbers must be registered with
     A2P 10DLC (brand + campaign) or carriers will filter them. Toll-free
     numbers need toll-free verification.
   - **UK, EU, AU, and others:** many countries require a regulatory bundle
     (end-user identity and address) before a number can be bought. Purchases
     fail with a carrier error until it is approved.
   - Publish terms of service and an acceptable-use policy that prohibit spam,
     harassment, and fraud.
5. Push notifications: in `mobile/`, run `npx eas init` to get a project ID.
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
- Both stores require an in-app **account deletion** option for apps with
  sign-up. It's listed in the roadmap below and must be added before
  submission.

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
- [ ] Add in-app account deletion (a store requirement) and a privacy policy
      URL.

## Roadmap

- Monetization: paywall, subscriptions, or credits (to be decided; see below)
- In-app VoIP calling (Twilio Voice SDK, CallKit, ConnectionService)
- MMS (picture messages)
- Contacts and block list
- Custom voicemail greetings
- Number porting

## Monetization hook

The backend already enforces `MAX_NUMBERS_PER_USER` (default 3). That is where
plan-based entitlements will plug in if a paywall is added.

## Project layout

```
backend/
  src/app.ts               route composition
  src/routes/              auth, me, numbers, messages, calls, webhooks
  src/telephony/           provider interface, Twilio, mock, TwiML builder
  test/api.test.ts         end-to-end API tests (node:test)
mobile/
  app/                     screens (expo-router file-based routes)
  src/api.ts               typed API client
  src/session.tsx          auth state (token in the device keychain)
  src/notifications.ts     push registration
```
