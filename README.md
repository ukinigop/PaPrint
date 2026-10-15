# PaPrint

For hosted deployment, follow [the Vercel setup guide](docs/VERCEL_DEPLOYMENT.md). The repository root is configured to deploy the web app and API together, using MongoDB Atlas/GridFS for private PDF storage. Hosted uploads support 3 MB per PDF; local demo uploads support 15 MB.

A mobile printing-booking app built with React Native + Expo Router, Express, Node.js, and MongoDB. The UI follows the PaPrint Figma wireframes: muted teal, soft gray neumorphic surfaces, Manrope typography, Home / Shops / Orders / Profile, and a responsive shop-owner workspace.

## Implemented MVP

1. **Choose a shop:** search sample Naga shops, filter open shops, and view per-page prices. Closed shops cannot receive bookings.
2. **Upload files:** select up to five PDFs, 15 MB each. The API validates the PDF and extracts its real page count. Uploads are private and accessible through an authorized order only.
3. **Print options:** A4 / Letter / Legal, black & white / color, single / double-sided, 1–100 copies, and optional instructions.
4. **Finalize the order:** review a server-calculated price, confirm the booking, retain the order in MongoDB, and track its status and pickup code. Retrying the same confirmation cannot create duplicate orders.
5. **Pickup notification:** staff mark an order ready; a durable notification appears in the customer's inbox. Device notifications and Expo push registration are implemented, with setup requirements below.

Payment is **pay at pickup**. The GCash QR screen is a clearly labeled placeholder; no payment is processed or marked paid through it. Prices, ratings, distances, wait estimates, and seeded shops are sample data. Pricing is per printed page, with a 25% multiplier for Legal paper. Double-sided changes the instructions, not the per-page rate. Page ranges such as 1-3, 5 are supported across files in upload order. DOCX/image uploads and binding services are not supported yet.

Customers can cancel unpaid Preparing orders; approved shop owners can reject them with a reason. Both outcomes appear in order history with no payment due. Once printing starts, neither action is available. See [cancellation and rejection](docs/ORDER_OUTCOMES.md) for behavior, API routes and verification.

## Start the local demo

Groupmates can follow [the branch checkout and local testing guide](docs/LOCAL_SETUP.md). No Atlas account or production environment file is required.

Use a supported Node.js LTS version (Node 22 or later). From this project folder:

```powershell
npm install --prefix server
npm install --prefix mobile
npm run demo
```

Keep that terminal open. The demo starts a real local MongoDB process automatically; its first run downloads the MongoDB binary. Documents and the database persist under `server/uploads/`, which is ignored by Git. Stop with Ctrl+C so MongoDB shuts down cleanly. Only one demo server should run at a time.

In a second terminal:

```powershell
npm run mobile
```

Use Expo Go compatible with this project's SDK 57 for basic testing, or an Expo development build. Scan the displayed QR code. A browser preview is also available:

```powershell
npm --prefix mobile run web
```

Open `http://localhost:8081` on your computer.

### Connecting a physical phone

The phone and computer must be on the same Wi-Fi. Copy `mobile/.env.example` to `mobile/.env` and change `EXPO_PUBLIC_API_URL` to your computer's IPv4 address, for example `http://192.168.1.10:4000`. Restart Expo after changing the file. If the connection fails, the app provides a server-address field. Keep the existing address when retrying; changing it signs you out of the current server. Permit Node.js access on your private network if Windows asks. `localhost` on a phone points to the phone, not your computer.

For browser previews on a different hostname, set `CORS_ORIGIN` in `server/.env` to the exact frontend origin. Native requests do not use browser CORS.

## Try the whole flow

1. Create an email account or sign in.
2. Choose **ParaPrint Naga** on Home and upload `samples/sample-print.pdf`.
3. Choose printing settings, review the total, and confirm.
4. Open the order to see its current stage and pickup code.
5. In Profile, update your name, default paper size, and reduced-motion preference; save and reload to verify persistence.
6. Sign out, sign in again, and verify that your account still owns the order.

To use the shop workspace, create a **Shop owner** account. Save business details, upload 3 registration PDFs, and submit for review. A PaPrint admin reviews the registration in the approval dashboard. Rejected owners can correct details and replace documents before resubmitting. Approved owners open their shop from Shop profile and can update operating hours, contact and rates. See [local pilot setup](docs/PILOT_SETUP.md) for admin promotion, approval and operating controls. Approved owners can view only their own shop's orders and private PDFs, move orders through Preparing → Printing → Done, confirm pickup payment, and mark them collected. The UI maps the existing stored Queued / Ready for pickup statuses to Preparing / Done. PaPrint does not directly control a printer.

See [accounts and motion](docs/ACCOUNTS_AND_MOTION.md) for account behavior, storage, motion, and the deferred features.

## Use your own MongoDB

For a local MongoDB installation or MongoDB Atlas, copy `server/.env.example` to `server/.env`, set `MONGODB_URI`, a randomly generated `JWT_SECRET` with at least 32 characters. Then run:

```powershell
npm run server
```

Use either `demo` or `server`, not both. The demo uses its own database and an automatically generated persistent secret; the regular server uses your `.env` database and secret. Both seed sample shops into an empty database. Shared-PIN access is disabled unless explicitly enabled; see the pilot setup guide.

## Phone notifications

- **In-app status:** works immediately in Orders on mobile and web. Ready timestamps persist in MongoDB, and the app refreshes while active every eight seconds and on resume.
- **Local phone alerts:** select **Profile → Notifications → Enable phone alerts**. While the app is open, it can show a device alert when it detects a ready order. Browser previews use Orders instead.
- **Background push:** requires an Expo development/preview build and your Expo project credentials. Expo Go does not support remote push on Android. Sign in to your Expo account, initialize an EAS project in `mobile/`, and add its project ID to `expo.extra.eas.projectId` in `app.json`. Configure Android FCM / iOS push credentials, build with `eas build --profile development --platform android`, install the build, and enable notifications. `eas.json` and `expo-dev-client` are included. The API registers the token and sends an Expo push when staff mark the order ready.

Push acceptance by Expo is tracked, but this prototype has no receipt-processing worker or automatic delivery retry. Network failures leave the durable in-app notification available. Physical-device/background notification delivery must be verified after your credentials are configured.

## Project layout

```text
mobile/App.tsx          Font loading, providers, and Expo Router stack
mobile/src/app/         URL routes and native navigation entry
mobile/src/screens.tsx  Customer screens and checkout
mobile/src/Workspace.tsx Shop registration and owner order management
mobile/src/state.tsx    Account, order, notification, and draft state
mobile/src/api.ts      Sessions, API calls, PDF upload/download
mobile/src/styles.ts   Wireframe-inspired styling
mobile/src/types.ts    Shared frontend data shapes
server/src/app.js      Protected API and file handling
server/src/models.js   MongoDB schemas and sample shops
server/src/domain.js   Pricing and validated booking options
server/src/workspace.js Owner registration, private downloads, and fulfillment
server/src/index.js    Configured MongoDB server
server/src/demo.js     Self-contained persistent local MongoDB demo
server/test/           MongoDB-backed integration tests
samples/               Safe PDF for trying the order flow
```

## Verification

```powershell
npm test
npm run typecheck
cd mobile
npx expo export --platform web
npx expo export --platform android
```

Integration tests cover session renewal, invalid PDF rejection, extracted page counts, authoritative pricing, closed shops, order persistence, concurrent duplicate submissions, private file access, shop permissions, ordered status changes, and one pickup push per ready transition. Tests use an isolated MongoDB and do not modify the demo database.

## Prototype boundaries

Email accounts support cross-device sign-in against the same API and saved preferences. Legacy guest orders are not automatically linked to new accounts. Email ownership verification, password recovery, account deletion, and real GCash integration remain deferred. Owners access a scoped workspace; the legacy staff API is disabled by default and requires explicit local-demo configuration. Before public use, add upload retention, verified partner data, shared rate limiting, and push delivery monitoring. Uploads remain stored even if removed from an unconfirmed booking.

The installed Expo toolchain still reports transitive dependency advisories after compatible updates. Do not use `npm audit fix --force`: the suggested automatic fix downgrades Expo incompatibly. Review upstream fixes and revalidate before deploying publicly.
