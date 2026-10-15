# Email accounts, profile, and motion

## Implemented

- Email sign-up and sign-in with customer/shop-owner account choice, name, mobile number, email, and password. Google and Apple sign-in are intentionally excluded.
- Passwords use a random salt and Node scrypt. Password hashes are never returned to the app.
- Account sessions last 30 days, are stored in MongoDB, and are revoked individually on sign-out. Expired/revoked account credentials cannot be renewed through the legacy guest endpoint.
- Native account tokens use Expo SecureStore; web account tokens use browser storage. HTTPS is required for a hosted app. Existing guest bookings aren't automatically attached to a new account.
- Profile includes personal details, saved shops, payment/order history, default paper size, reduced motion, phone alerts, help/privacy information, and sign-out.
- Owners have a separate responsive workspace with registration, private document upload, review submission, scoped order/download access, production stages, pickup payment confirmation, and collection. Ownership is checked against the database; customers cannot elevate their account type through profile settings.
- Soft raised cards, inset fields, and short press feedback follow the Figma teal/gray palette and bundled Manrope typography. See UI_DESIGN.md for source and tokens.
- Upload progress reports actual completed file counts. Printing animation runs only when the shop marks an order Printing; it does not simulate page percentages or completion times.
- Account preferences and the system's reduced-motion setting disable decorative movement. Tab changes remain immediate.

## API

| Route                   | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| `POST /api/auth/signup` | Create account and session                                |
| `POST /api/auth/login`  | Verify email/password and create session                  |
| `GET /api/auth/me`      | Restore current account                                   |
| `PATCH /api/auth/me`    | Save name, phone, savedShops, defaultPaper, reducedMotion |
| `POST /api/auth/logout` | Revoke current session                                    |
| `DELETE /api/device`    | Remove the account's registered pickup push token         |

The existing `MONGODB_URI` and `JWT_SECRET` environment settings are sufficient. No OAuth credentials are needed. New collections are `users` and `accountsessions`; Mongoose creates the indexes, including email uniqueness and session expiration.

## Validation

Backend coverage includes duplicate-email handling, password hashing, invalid credentials, profile validation/persistence, order isolation across accounts, restore on another login, selective session revocation, and preventing account-to-guest renewal bypass. The existing booking, PDF authorization, and notification tests are retained.

Browser checks use a separate local MongoDB database under `server/uploads/ui-preview`, never production Atlas. The preview at localhost:8083 proxies that API on localhost:4001. Test accounts here are local preview accounts. These helpers are ignored under `tmp`; normal development still uses the project's server scripts.

The web build, TypeScript, and lint must pass before publishing. Test the press response, printing animation, interruption, reduced motion, and keyboard behavior on a physical iPhone/Android release build before a native release; browser checks do not verify native animation performance.

## Deliberately deferred

Google/Apple sign-in, email ownership verification, password recovery, account deletion, platform approval dashboard, and real GCash payment integration remain deferred. This remains an MVP account system. There is no fake reset-password button or simulated social login. Owners cannot approve their own shop; approval remains a trusted database operation.

Sign-out clears the local credential even if the server is unreachable. Only successful online sign-out confirms server session revocation. Guest orders remain accessible only through their original guest credential; no automatic email-based linking or merging is performed.
