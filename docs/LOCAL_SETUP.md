# Try the updated PaPrint locally

Install Git and Node.js 22 LTS first. These steps use PowerShell on Windows.

## 1. Get the new branch

If you do not have the project yet:

```powershell
git clone --branch codex/figma-ui-update https://github.com/ukinigop/PaPrint.git
cd PaPrint
```

If you already have it, open a terminal in your PaPrint folder:

```powershell
git fetch origin
git switch codex/figma-ui-update
git pull --ff-only
```

Save or commit your own changes first if Git says they would be overwritten.

## 2. Install the dependencies

From the PaPrint folder:

```powershell
npm ci
npm ci --prefix server
npm ci --prefix mobile
```

## 3. Start the local API and database

```powershell
npm run demo
```

Keep this terminal open. The first run downloads a local MongoDB binary and can take a few minutes. This uses a separate local database; no MongoDB Atlas login, shared production password, or server .env file is needed. Data persists in server/uploads/demo-db. Stop with Ctrl+C when finished.

## 4. Open the app in your browser

Open a second terminal in the same PaPrint folder:

```powershell
$env:EXPO_PUBLIC_API_URL = "http://localhost:4000"
npm --prefix mobile run web -- --port 8081
```

Open [PaPrint locally](http://localhost:8081). The API must stay running in the first terminal.

If port 8081 is already used, stop your earlier Expo server. Alternatively, use another port and restart the API with CORS_ORIGIN set to that exact browser address. Do not use the previous localhost:8083 preview link unless you started an Expo server there yourself.

## 5. Try both sides

**Customer:** choose Create an account, select Customer, and enter a name, email, phone number, and password of at least 10 characters. Accounts from the live app or another groupmate's computer do not exist in your local database.

Choose ParaPrint Naga, upload samples/sample-print.pdf, set print options, review, and choose pay on pickup. Your order appears in Orders.

**Shop owner:** log out, then log in with the seeded local demo account:

| Field    | Local demo value   |
| -------- | ------------------ |
| Email    | owner@paprint.test |
| Password | PaPrintDemo123!    |
| Shop     | ParaPrint Naga     |

This account is created only by npm run demo in its isolated local database. The hosted API never creates it. Keep these sample credentials confined to local testing.

Open the workspace order to start printing, mark Done, confirm the sample pickup payment, and mark collected. Log back into your customer account to see the updates. No real money is processed.

To test business onboarding separately, create another Shop owner account. Fill in business details and upload three sample PDFs, then submit for review. Use the admin approval dashboard to reject/correct/resubmit or approve the partner, then open the approved shop under Shop profile. Follow [pilot setup](PILOT_SETUP.md) to promote a separate reviewer account. The seeded demo owner remains available for quick fulfillment checks.

## Optional: try a phone

Keep the API running. Connect the phone and computer to the same Wi-Fi and install an Expo Go version compatible with SDK 57, or use an Expo development build.

In the second terminal, replace the example IP with your computer's Wi-Fi IPv4 address from ipconfig:

```powershell
$env:EXPO_PUBLIC_API_URL = "http://192.168.1.10:4000"
npm run mobile
```

Scan the terminal QR code with your phone. Allow Node.js on your private network if Windows asks. If the app still has an old server address, open Connection settings on the login screen and enter the same address. localhost on a phone refers to the phone.

## Current limits

- Valid unlocked PDFs only, up to five per order; 15 MB per PDF in the standalone demo, 3 MB on Vercel.
- Checkout supports cash payment on pickup only. The owner confirms payment before collection.
- Shop approval is manual; the demo owner is already linked to a sample shop.
- Background push needs Expo project credentials. Order updates work in the app without them.
- The demo runs separately on each computer. Groupmates do not share accounts or orders.
