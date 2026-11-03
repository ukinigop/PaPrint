# Estimated pickup times

Approved owners can set, revise, or remove an estimated pickup date/time on their own Preparing or Printing orders. A closed shop can still update estimates for existing orders. Estimates are optional and do not change production status, payment, prices, or file order.

The owner order details contain the editor. All date/time input and display use Philippine time (Asia/Manila), even if the device uses another timezone. Web uses its local date/time control; Android/iOS use the Expo-compatible native date/time picker. Existing installed native builds need rebuilding to include the new native module; Expo Go includes it.

Customers see the estimate on current/active order cards and in order details through the existing refresh behavior. When the estimate passes, details indicate that the shop is still preparing the job. Customers must wait for **Ready for pickup** before collecting. Ready/collected/cancelled/rejected orders do not show a pending estimate to customers. Setting an estimate does not send a new push alert.

`PATCH /api/workspace/orders/:id/pickup-estimate` accepts `{ estimatedPickupAt: ISO8601 | null, expectedVersion: nonnegative integer }`. The API requires an authenticated, approved owner and checks shop ownership. A new time must be in the future. Atomic stage/version conditions reject stale edits and changes after production ends with 409; refresh and explicitly reload the estimate before editing again. Metadata stores the reviewing owner, last update, and monotonically increasing estimate version, including removals. Legacy PIN sessions cannot use this endpoint. Old orders work without a migration.

Validation covers ownership/approval, closed-shop fulfillment, malformed/past dates, unknown fields, terminal stages, customer visibility, historical totals/files, stale edits and concurrent saves, and conversion at Philippine midnight. Manual native-device picker verification remains required.
