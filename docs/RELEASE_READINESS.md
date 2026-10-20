# PaPrint release readiness — 21 October 2026

## Release scope

Cash payment on pickup; customer session isolation and checkout recovery; safe quote and upload retries; functional owner-registration steps; concurrent operating-setting protection; and clearer completed-order/profile controls. Existing accounts, orders, prices and private storage remain compatible. No database migration or reset is required.

## Verified

- Final backend suite: 27 passing integration tests using isolated temporary MongoDB.
- Frontend suite: 21 passing regression tests.
- TypeScript, lint and web export passed for the reviewed source.
- The exported website and actual hosted API entry point passed a local smoke check against temporary MongoDB: direct links to login, orders, workspace, admin, review and the old GCash route load the SPA; referenced JavaScript is served as an asset; health/config work; hosted uploads are limited to 3 MB; unauthenticated order access and legacy PIN sessions are rejected.
- The normal local browser flow passed registration/rejection/resubmission/approval, opening, upload/booking/fulfillment/payment/collection, cancellation, stale actions, changed prices, settings conflicts, refresh, interrupted uploads and connection/session recovery. Details are in [customer flow QA](CUSTOMER_FLOW_QA.md).
- Changed/new release files and the exported frontend were checked against the cached private MongoDB/JWT values and common credential signatures: no private credentials found. Temporary fixtures, screenshots, backups and environment files are ignored by Git. Mobile and server tests are excluded from Vercel uploads.
- Read-only/unauthorized public production checks passed: `/api/health` 200, `/api/config` reports 3 MB and five PDFs, `/login` 200, protected orders/admin endpoints 401, disabled shared-PIN session endpoint 403. No production accounts, bookings, files or settings were changed by these checks.

## Baseline and rollback

Remote `main` and local starting HEAD matched `c0f6373040b45d6c90ecaf6f4d56815dac90eae0` before this release. GitHub reports its Vercel status as successful: [baseline deployment](https://vercel.com/niku-gaza/paprint/5NUWuTo35RcBJnWhvzcNBSZwQhbw). Confirm in the Vercel dashboard that it owns the production domain before publishing the release.

If the new release fails live smoke checks, use the project's Instant Rollback control to restore the previous production deployment and verify health, login and private downloads again. Rollback changes the deployed build, not MongoDB data; do not reset the database. Vercel keeps the previous build's environment configuration and disables automatic production-domain assignment after rollback; restoring normal deployment requires undoing the rollback/promoting the intended deployment. On Hobby, rollback is limited to the immediately previous deployment. See [Vercel's rollback instructions](https://vercel.com/docs/instant-rollback).

Alternatively, revert the release commit on `main` and deploy the revert through the usual Git integration. Do not force-push or rewrite existing history.

## Before publishing

Authenticated Vercel access is still required to confirm the production branch/project, baseline domain assignment and current environment settings. The available `.env.vercel.local` is a cached file and is not evidence of current dashboard settings.

Confirm a named production database, stable JWT secret, private GridFS storage, legacy access disabled, sample-shop seeding disabled and no hosted frontend override pointing to localhost. Preserve existing database records and the administrator account. Check the existing administrator's role with authorized access; do not create or promote a different real account as a substitute.

The Vercel dashboard opened at login. Automatic approval review rejected starting the GitHub sign-in flow without specific authentication authorization. No alternate authentication path was attempted. Publishing and the post-release checks remain pending that access.

## Live smoke check after publishing

1. Verify the new commit has a Ready production deployment and `paprint.vercel.app` points to it; confirm `/api/health` and direct-page refreshes.
2. Sign in with the designated reviewer account and confirm the approval dashboard. Confirm the customer login has no role selector and checkout offers pickup cash only.
3. Use clearly designated temporary test accounts and a temporary shop to verify registration/approval/opening, one small safe PDF booking, authorized private download, printing, cash confirmation and collection. Avoid sending tests to real partner queues. Remove only records/files created for the smoke check using their captured IDs.
4. Verify customer cancellation and shop rejection on separate unpaid Preparing test orders, plus History and no payment due. Confirm test cleanup.
5. Record the deployed commit, deployment URL, results and any rollback action here.

Physical printing, native keyboard behavior, phone push delivery, password recovery and public-launch operational work remain separate from this release.
