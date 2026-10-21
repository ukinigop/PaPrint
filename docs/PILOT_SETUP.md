# Local pilot: admins, partner approval and operating controls

This guide covers partner approval and operating controls. Deployment follows the repository's configured Git/Vercel workflow.

See [printing from the owner workspace](OWNER_PRINTING.md) for the web Print file control, page ranges, printer settings and manual verification.

## Create an administrator

1. Run the API and web app using `docs/LOCAL_SETUP.md`.
2. Create a separate **Customer** account for the reviewer, then sign out.
3. Promote that existing account against the database you explicitly choose:

```powershell
npm --prefix server run admin:promote -- --email "reviewer@example.com" --mongo-uri "mongodb://127.0.0.1:27017/paprint"
```

For `npm run demo`, use the **Local demo database for admin promotion** URI printed by the running demo instead. Its port changes when restarted; its saved data remains in the demo database. Keep the demo running while executing the promotion command. Do not substitute an Atlas/production URI when testing locally.

Promotion revokes that account's existing sessions. Sign in again to open **Partner approvals**. Public signup and profile updates cannot grant admin access. Owner accounts, including accounts linked to a shop, cannot be promoted; create a separate customer account. There is no default admin password or automatically created administrator.

## Review a partner

An owner saves business details, uploads three valid registration PDFs, and submits the registration. The admin dashboard lists submitted partners and provides private document downloads.

- **Approve partner** records the decision and keeps the shop closed. The owner must open it under **Shop profile → Operating settings**.
- **Reject for correction** requires a reason. The owner sees it in registration, can correct details and remove/replace documents, and can resubmit. The reason stays visible until resubmission; review history is retained.
- Decisions record reviewer, time, and submission version. Duplicate or stale decisions return a conflict; refresh before reviewing again.
- Approved identity details and registration documents are locked. Owners can change hours, contact number, per-page rates, and open/closed status.
- Closing prevents new quotes/bookings, while existing orders can still be downloaded, printed, paid and collected.

The admin dashboard uses normal account login and checks the current database role on every protected admin request. Customers, owners, guest sessions and PIN sessions cannot use admin routes. Private storage locations are never returned.

## Booking and payment behavior

PDFs are saved and shown in the customer's selected order. Page ranges count continuously across that order: with two two-page PDFs, `2-3` means the last page of the first PDF and the first page of the second. Staff still apply settings when printing; PaPrint does not control a printer.

The app sends its reviewed total as `expectedAmount`. If the server calculates a different price, it returns HTTP 409 with `code: PRICE_CHANGED`, `amount`, and `pages`. The app shows the new total and requires another confirmation. Retried successful bookings keep the original order and total. Historical orders are not repriced or reordered. Older API clients can omit `expectedAmount` and retain their existing behavior.

Payment remains cash on pickup. Both owner and optional PIN workflows require Ready for pickup → payment confirmation → Collected. GCash is not offered in checkout; customers pay in cash at the shop when collecting their prints.

Unpaid Preparing orders can now be cancelled by their customer or rejected by their approved shop with a reason. These terminal outcomes show no payment due and remain in History. See [order outcomes](ORDER_OUTCOMES.md) for confirmation screens, endpoint details and race handling.

## Optional legacy-PIN testing

Shared-PIN access is **disabled by default**, including previously issued PIN tokens. For an explicit local legacy test only, set these before starting the API:

```powershell
$env:ENABLE_LEGACY_SHOP_ACCESS = "true"
$env:SHOP_PIN = "your-local-test-pin"
npm run demo
```

Legacy sessions require an approved shop. `POST /api/orders/:id/payment` confirms a ready order's pickup payment for the PIN session's own shop. Owner accounts use their existing workspace payment endpoint. Remove the setting and restart to disable all PIN sessions again. Normal owner login needs no shared PIN.

## Added API routes

| Method and route                                 | Access and purpose                                           |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `GET /api/admin/shops?status=submitted`          | Admin list; also accepts approved/rejected                   |
| `GET /api/admin/shops/:id`                       | Admin registration details and review history                |
| `GET /api/admin/shops/:id/documents/:documentId` | Admin-only private registration PDF                          |
| `POST /api/admin/shops/:id/decision`             | Admin; decision approved/rejected, reason, submissionVersion |
| `PATCH /api/workspace/operations`                | Approved owner; hours, contact, monoRate, colorRate, open    |
| `DELETE /api/workspace/documents/:documentId`    | Own draft/rejected registration only                         |
| `POST /api/orders/:id/payment`                   | Enabled legacy session; ready pickup payment for own shop    |

## Verification

Approval-dashboard check (22 October 2026): Submitted, Approved and Rejected tabs switch correctly. The selected status is retained in the page URL when opening a registration and refreshing. Switching tabs clears the previous registration selection. Verified with disposable local registrations; TypeScript, lint and web export pass.

Run `npm test`, `npm run typecheck`, `npm --prefix mobile run lint`, and `npm --prefix mobile run build:web`.

Tests create an isolated temporary MongoDB and never use the demo database. On a restricted Windows runner, WiredTiger can fail with `MoveFileExW: Access is denied` in the sandbox's temporary directory; loopback may also fail with `EACCES`. Run the tests in a normal local terminal with filesystem/loopback access instead of changing database permissions or deleting demo data.

Manual acceptance: register a partner, reject it with a reason, replace a document, resubmit, approve, open the shop, book, start printing, mark done, confirm payment and collect. Verify a changed checkout price requires confirmation again and closing a shop still permits existing-order fulfillment. Physical printing and phone push delivery require separate device checks.
