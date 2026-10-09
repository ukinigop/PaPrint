# Deploy PaPrint to Vercel

This repository is configured as one Vercel project: the Expo web export is the frontend, `/api/*` is the Express API, and MongoDB Atlas holds both order data and private PDF files in GridFS. The native iPhone/Android app remains an Expo app and can use the deployed API.

## 1. Prepare MongoDB Atlas

Create an Atlas database, a database user with read/write access only to the PaPrint database, and a connection string naming that database, for example `mongodb+srv://USER:PASSWORD@CLUSTER/paprint`. URL-encode special characters in the password. Configure Atlas Network Access to allow the Vercel runtime's outbound connections using your selected network setup. Atlas must be reachable from both the deployment and the computer used for seeding. Never put the connection string in `EXPO_PUBLIC_*` variables or Git.

## 2. Initialize the shop list

Set `SEED_SAMPLE_SHOPS=true` in Vercel to initialize sample shops automatically when the deployed API first connects. This is included in the private `.env.vercel.local` import file. Existing shops are preserved. You can remove this variable after the first successful deployment.

Alternatively, seed from your computer:

Copy `server/.env.example` to `server/.env` and set `MONGODB_URI` to Atlas. Run from the repository root:

```powershell
npm ci --prefix server
npm --prefix server run seed
```

This seeds sample shops if the database has no shops and creates the unique index used to prevent duplicate bookings. Replace sample shops with real partner data when available. Local demo records are not automatically migrated to Atlas.

## 3. Import the repository in Vercel

Import `ukinigop/PaPrint`. Use the repository root (`.`), **not** `mobile` or `server`. Framework preset: **Other**. Node.js: **22.x**. The committed `vercel.json` supplies:

- Install: `npm ci && npm ci --prefix mobile`
- Build: `npm run build`
- Output: `mobile/dist`
- API entry point: `api/index.js`

Do not override these settings with a Next.js preset.

## 4. Add server environment variables

Set the following in Vercel Project Settings → Environment Variables for the desired deployment environment:

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | Atlas connection string with the database name |
| `JWT_SECRET` | A stable, randomly generated secret of at least 32 characters |
| `SHOP_PIN` | A private shop-access PIN; avoid the local demo PIN |
| `SEED_SAMPLE_SHOPS` | `true` to initialize sample shops on first connection |
| `CORS_ORIGIN` | Optional exact web origin if using a separate frontend domain |

Keep `JWT_SECRET` stable across redeployments so existing guest sessions retain access. Use a separate Atlas database and different credentials for previews if you enable them. No `EXPO_PUBLIC_API_URL` is needed for the hosted website: it automatically uses the same domain for `/api`. No `UPLOAD_DIR`, MongoDB binary, or local demo secret is needed on Vercel.

## 5. Deploy and verify

Deploy from Vercel after the configured changes have been pushed to GitHub. Check:

1. `https://YOUR-DOMAIN/api/health` returns `{"ok":true}`. The handler validates the environment and connects to Atlas before serving it.
2. The home screen shows seeded shops without asking for a local computer address.
3. Upload `samples/sample-print.pdf`, choose options, and confirm an order.
4. Open Profile → shop access with the private hosted PIN. Start printing and mark ready.
5. Return to the customer inbox and verify the pickup notification. Reload and verify the order and PDF still exist.
6. Check Vercel function logs if you get a 503; it indicates missing configuration or an unreachable database.

## Connect the phone app to the hosted API

Set `EXPO_PUBLIC_API_URL=https://YOUR-DOMAIN` in `mobile/.env`, restart Expo, and reload the phone app. If you previously saved a local server address, use the connection screen to change it to the hosted URL. A rebuilt standalone app must include this value at build time. This makes the backend accessible without keeping your computer's demo server running. Expo Go still needs its development server to load the app; standalone builds use EAS.

## Upload and prototype limits

Vercel has a 4.5 MB function request/response limit. Hosted uploads are restricted to **3 MB per PDF**, sent one at a time with a maximum of five documents per booking. The API reports the limit to the UI; the local demo retains 15 MB. Supporting larger hosted documents will require direct private object-storage uploads and streamed downloads rather than this function upload flow.

The deployment uses guest customer sessions and a shared shop PIN. It is ready for an MVP demonstration, not public customer onboarding. In-memory rate limiting is best-effort per Vercel instance; configure Vercel Firewall rules for shared abuse protection. Background phone push still needs Expo push credentials; the in-app notification flow works without them. Existing upstream Expo dependency advisories remain documented in the main README.

References: [Vercel function limits](https://vercel.com/docs/functions/limitations), [MongoDB GridFS](https://www.mongodb.com/docs/drivers/node/current/crud/gridfs/), [Expo web publishing](https://docs.expo.dev/guides/publishing-websites/).
