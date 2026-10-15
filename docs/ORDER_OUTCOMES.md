# Cancellation and shop rejection

Customers can cancel their own **unpaid Preparing** orders. Approved owners can reject an unpaid Preparing order assigned to their shop, including while the shop is closed for new bookings. Printing, Done/Ready for pickup, Collected, and paid orders cannot be cancelled or rejected.

## Customer and owner actions

- Customers open an order and choose **Cancel order**. The inline panel accepts an optional reason (up to 500 characters), **Keep order**, or **Confirm cancellation**.
- Owners open a Preparing order and choose **Reject order**. A reason of 1–500 characters is required before **Confirm rejection** becomes available. **Keep order** dismisses the panel without modifying the booking.
- Cancelled and Rejected orders show an outcome timestamp and reason, **No payment due**, and the original quoted total. They have no production animation, pickup instructions, payment confirmation, or collection actions.
- Customer **History** includes Collected, Cancelled and Rejected orders. Active orders and the home current-order card include only Preparing, Printing and Done. Owners have separate Cancelled/Rejected filters, and production counts exclude these orders.
- If another person starts printing first, the request returns a conflict. The app refreshes the order and explains that the stage changed. After printing begins, customers contact the shop for help.

## API

| Route                                   | Access                                                                   | Request                                   |
| --------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------- |
| `POST /api/orders/:id/cancel`           | Customer credential owning the order                                     | `{ "reason": "optional reason" }` or `{}` |
| `POST /api/workspace/orders/:id/reject` | Approved owner of the assigned shop                                      | `{ "reason": "required reason" }`         |
| `POST /api/orders/:id/reject`           | Approved shop PIN session, only when legacy access is explicitly enabled | `{ "reason": "required reason" }`         |

Each endpoint returns the updated order. Reasons are trimmed before validation. Invalid bodies return 400, unauthorized roles 403, and missing/unowned orders 404. Disabled legacy tokens return 401. Unauthenticated requests return 401.

The order adds an optional `outcome` object with `actorId`, `actorRole` (`customer`, `owner`, or `shop`), `at`, and `reason`. The terminal status (`Cancelled` or `Rejected`) identifies the outcome. Existing records need no migration; historical records without an explicit payment status continue to count as unpaid for these actions.

An atomic update matches the order's owner/shop, Preparing status, and unpaid payment state. Competing termination or printing actions cannot both succeed. An identical retry (same actor, action, and trimmed reason) returns the original result without changing its timestamp; changed reasons or competing actions return 409. The production status endpoint cannot be used to cancel, reject, or reopen a terminal order.

The original booking request key still identifies the existing booking, including a cancelled/rejected one. Retrying checkout does not silently create another order. Files, settings, prices and authorized download access are preserved. Staff must not print ended orders.

## Boundaries and local verification

This feature applies to cash-on-pickup bookings. There are no cancellation fees, refunds, new push alerts, automatic rebooking, file deletion, or post-print cancellation requests. Both parties receive the outcome through existing active-app polling/resume updates. GCash remains outside this batch.

Run `npm test`, `npm run typecheck`, `npm --prefix mobile run lint`, and `npm --prefix mobile run build:web`. Integration tests use isolated MongoDB databases, never the demo database. See [pilot setup](PILOT_SETUP.md) for Windows sandbox restrictions and local admin/owner setup.

Manual acceptance:

1. Open a Preparing customer order, dismiss cancellation with Keep order, then confirm cancellation with a reason. Check History, payment history, retained downloads and the owner Cancelled filter.
2. Open another Preparing order as its owner, verify an empty rejection reason disables confirmation, dismiss once, then reject with a reason. Check the customer outcome and owner Rejected filter.
3. Have another staff session start printing while either confirmation is open. The losing action must show a conflict, refresh to Printing, and remove the now-ineligible action.
4. Check narrow and desktop layouts, active counts, and that Collected bookings remain in History. Verify terminal orders cannot accept payment or restart printing through either API path.
