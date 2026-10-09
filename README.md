# PaPrint

A mobile printing-booking prototype built with React Native + Expo, Express, Node.js, and MongoDB. The UI follows the supplied medium-fidelity wireframe: blue accents, Home / Orders / Shops / Profile tabs, nearby shops, and an active-order card.

## Implemented MVP

1. **Choose a shop:** search sample Naga shops, filter open shops, and view per-page prices. Closed shops cannot receive bookings.
2. **Upload files:** select up to five PDFs, 15 MB each. The API validates the PDF and extracts its real page count. Uploads are private and accessible through an authorized order only.
3. **Print options:** A4 / Letter / Legal, black & white / color, single / double-sided, 1–100 copies, and optional instructions.
4. **Finalize the order:** review a server-calculated price, confirm the booking, retain the order in MongoDB, and track its status and pickup code. Retrying the same confirmation cannot create duplicate orders.
5. **Pickup notification:** staff mark an order ready; a durable notification appears in the customer's inbox. Device notifications and Expo push registration are implemented, with setup requirements below.

Payment is **pay at pickup**. Prices, ratings, distances, wait estimates, and shops are sample data, not verified live partner information. Pricing is per printed page, with a 25% multiplier for Legal paper. Double-sided changes the printing instructions, not the per-page rate. Every uploaded PDF prints in full with the same settings; page ranges and Word/image uploads are outside this first version.

## Start the local demo

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

The phone and computer must be on the same Wi-Fi. Copy `mobile/.env.example` to `mobile/.env` and change `EXPO_PUBLIC_API_URL` to your computer's IPv4 address, for example `http://192.168.1.10:4000`. Restart Expo after changing the file. If the connection fails, the app provides a server-address field. Keep the existing address when retrying; changing it creates a new guest session. Permit Node.js access on your private network if Windows asks. `localhost` on a phone points to the phone, not your computer.

For browser previews on a different hostname, set `CORS_ORIGIN` in `server/.env` to the exact frontend origin. Native requests do not use browser CORS.

## Try the whole flow

1. Choose **ParaPrint Naga** on Home.
2. Upload `samples/sample-print.pdf` (a harmless two-page test document).
3. Choose printing settings, review the total, and confirm.
4. Open **Profile → Printing shop access**, select the same shop, and enter demo PIN **2468**.
5. Open the order and select **Start printing**, then **Mark ready & notify customer**.
6. Use **Back → Back to customer app** and open the bell. The pickup alert contains the shop and pickup code. The order updates in Orders and Home.
7. Staff can finish the workflow with **Confirm collected**. The customer then sees it under Completed.

The shop workspace can also run on a second device or browser session. Staff see only orders belonging to their selected shop. Tap a document in order details to download/share the PDF for printing. PaPrint does not directly control a printer.

## Use your own MongoDB

For a local MongoDB installation or MongoDB Atlas, copy `server/.env.example` to `server/.env`, set `MONGODB_URI`, a private `SHOP_PIN`, and a randomly generated `JWT_SECRET` with at least 32 characters. Then run:

```powershell
npm run server
```

Use either `demo` or `server`, not both. The demo uses its own database and an automatically generated persistent secret; the regular server uses your `.env` database and secret. Both seed sample shops into an empty database.

## Phone notifications

- **In-app inbox:** works immediately on mobile and web. Ready timestamps persist in MongoDB, and the app refreshes while active every six seconds and on resume.
- **Local phone alerts:** select **Profile → Enable notifications**. While the app is open, it can show a device alert when it detects a ready order. Browser previews use the inbox instead.
- **Background push:** requires an Expo development/preview build and your Expo project credentials. Expo Go does not support remote push on Android. Sign in to your Expo account, initialize an EAS project in `mobile/`, and add its project ID to `expo.extra.eas.projectId` in `app.json`. Configure Android FCM / iOS push credentials, build with `eas build --profile development --platform android`, install the build, and enable notifications. `eas.json` and `expo-dev-client` are included. The API registers the token and sends an Expo push when staff mark the order ready.

Push acceptance by Expo is tracked, but this prototype has no receipt-processing worker or automatic delivery retry. Network failures leave the durable in-app notification available. Physical-device/background notification delivery must be verified after your credentials are configured.

## Project layout

```text
mobile/App.tsx          Customer flow, order tracking, inbox, shop workspace
mobile/src/api.ts      Sessions, API calls, PDF upload/download
mobile/src/styles.ts   Wireframe-inspired styling
mobile/src/types.ts    Shared frontend data shapes
server/src/app.js      Protected API and file handling
server/src/models.js   MongoDB schemas and sample shops
server/src/domain.js   Pricing and validated booking options
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

Guest customer credentials are stored on the device and renewed on startup. Clearing app/browser storage loses that customer's access; there is no account recovery or cross-device customer login yet. Shop access uses one server-configured PIN for demonstration, rather than individual staff accounts. Before public use, replace it with merchant accounts and add customer login/recovery, upload retention, hosted private file storage, HTTPS, verified shop data, and push delivery monitoring. Uploads currently remain on the server even if removed from an unconfirmed booking.

The installed Expo toolchain still reports transitive dependency advisories after compatible updates. Do not use `npm audit fix --force`: the suggested automatic fix downgrades Expo incompatibly. Review upstream fixes and revalidate before deploying publicly.
