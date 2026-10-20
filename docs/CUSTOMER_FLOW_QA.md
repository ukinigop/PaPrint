# Customer flow reliability

Checkout supports cash on pickup only. Existing GCash records remain readable for compatibility, but GCash is not offered and cannot create a new booking.

## State and feedback

- Account changes and session expiry clear the draft, order lists, workspace, notices, and notification tracking. Account-owned screens remount. Old requests, delayed uploads, and retained context callbacks cannot update another session.
- Credential writes are serialized; a late logout cannot erase a newer login. Expired responses from old sessions cannot log out the current account.
- A confirmed booking clears only its own draft. Failures and uncertain responses retain the draft and request key for safe retries. Another order starts with a new key. Price changes require another confirmation.
- Web checkout metadata survives refresh within the same tab: acknowledged uploaded PDFs, their order, settings, notes, shop and request key. It is scoped by account and API address, cleared on logout/account change and completed booking, and discarded when the tab session ends. File contents, credentials and unfinished upload selections are not cached. Browser storage restrictions fall back to in-memory checkout; native restart recovery is separate.
- Quote failures appear in the print options; invalid ranges appear near the range field. Review is unavailable until a current estimate succeeds. Older responses cannot replace newer settings. Notes do not trigger unnecessary price requests.
- Refresh errors are separate from action errors. Polling cannot dismiss an action failure. Refresh failures retain the last loaded lists and offer an explicit retry.
- Partial uploads retain acknowledged files and list the remaining filenames. Retry uploads only the failed and unattempted files. An invalid PDF can be replaced through Choose files. Continue remains unavailable until that batch is resolved.
- Shop lists no longer claim calculated distances or offer Nearest. Empty partner lists, empty searches, and no open shops have distinct messages.
- Long filenames have accessible labels and a two-line display. Buttons can wrap, removal controls have 44px targets, multiline fields have more space, and forms avoid the iOS keyboard.

## Owner forms and UI controls

- Registration has separate details, documents, and review steps. Forward navigation saves details; review requires three registration PDFs. Submission checks that the reviewed version is still current.
- Clean operating forms receive refreshed settings. Unsaved edits survive refreshes; conflicting remote edits block saving until the owner explicitly loads the latest settings. Saves use an atomic version check. Optional version fields preserve older API clients.
- Account role selection appears during signup only. Web notification settings explain mobile alerts without an inactive enable button.
- Collected orders hide pickup instructions and codes. Profile panels scroll into view when opened.

## Automated checks

Run `npm run test:frontend`, `npm test`, `npm run typecheck`, `npm --prefix mobile run lint`, and `npm run build`.

Frontend tests use Node's test runner with the existing TypeScript compiler. Only native platform/storage modules are mocked; tests exercise the actual frontend API, session guards, quote controller, upload queue, and booking helpers. These are logic tests, not rendered-screen or physical-device tests. Backend tests use temporary isolated MongoDB databases; see PILOT_SETUP.md for Windows sandbox restrictions.

## Manual acceptance

At 390px and 1280px, verify:

1. Sign in as a customer, choose an approved open shop, upload PDFs, and set print options. Check long filenames, invalid ranges, quote loading and retry.
2. Review the cash total, place the booking, and confirm its details remain visible after refreshing orders. Returning to checkout must not submit the completed draft. Start another booking and confirm it is distinct.
3. As the owner, start printing, mark Done, confirm cash received, and collect. Collection before payment must fail. Verify customer History.
4. Cancel an unpaid Preparing order; reject another with a reason. Check both histories, dismiss confirmation panels, and simulate a stale order stage.
5. Fail the second file in a multi-file upload; retry and confirm the first is not duplicated. Repeat while navigating away or ending the session.
6. Delay requests, sign out, sign into another account, and ensure no prior filenames, orders, errors, or notices appear. Repeat after session expiry.
7. Verify no-shop, closed-shop, and no-search-result states, offline messages, keyboard visibility, narrow owner/admin layouts, and unchanged controls at desktop width.
8. Complete registration using both step tabs and Continue buttons. Confirm edits persist and review requires three PDFs. In two owner sessions, change operating settings while the other has unsaved edits; confirm explicit reload is required and older values cannot overwrite newer settings.
9. Verify role choices appear only on signup, web alerts show information only, collected orders hide pickup instructions, and expanded profile panels scroll into view.

If browser access is blocked, leave these visual checks explicitly unverified. Never substitute production data or describe logic tests as manual UI verification.

## Local verification — 21 October 2026

21 frontend regression tests pass, including checkout reload, account/API isolation, malformed cache recovery and original request-key preservation. TypeScript, lint and web export pass. The final release check reran all 27 backend integration tests successfully, covering atomic action races, authorization, pricing and approval. That suite used isolated temporary MongoDB databases outside the restricted Windows sandbox. No demo or production data was used.

Browser access was available during this follow-up. The actual app was exercised at 390×844 and 1280×900 using disposable local customer, owner and administrator accounts. The following were verified through the interface:

| Check                                                                                     | Result                                                                             |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Customer cancellation, optional reason and Keep order dismissal                           | Passed; outcome, timestamp and historical total shown; no payment due              |
| Owner rejection and required reason; customer History and owner rejection filter          | Passed; reason visible in both roles                                               |
| Stale cancellation and stale rejection when printing starts                               | Passed; latest stage loads with an explanatory message                             |
| Signup role selection and accessible checkbox/radio states                                | Passed; checked state now exposed on web                                           |
| Registration validation, three PDF uploads and private admin document download            | Passed                                                                             |
| Admin rejection → owner edits, removes/replaces PDF → resubmission → approval             | Passed; reason remains until resubmission; approval leaves shop closed             |
| Approved identity fields remain locked; owner explicitly opens shop                       | Passed                                                                             |
| Two owner sessions with unsaved settings and newer remote values                          | Passed; local edits preserved, save blocked, explicit reload works                 |
| New customer upload → cross-PDF range → quote → booking → printing → payment → collection | Passed; cash-only checkout and customer History verified                           |
| Close shop after review, reopen with changed price                                        | Passed; closed booking rejected; updated price requires confirmation again         |
| Close shop after booking, then fulfill existing order                                     | Passed; payment required before collection                                         |
| Change rates after collection                                                             | Passed; historical six-peso total unchanged                                        |
| Long filenames, invalid range, empty search, profile expansion and web alert information  | Passed on relevant narrow layouts; desktop order/sidebar layout inspected          |
| Simulated second-upload interruption                                                      | Passed; first upload retained, retry produced two ordered files without duplicates |
| Simulated connection loss, quote/refresh retry and reconnection                           | Passed; last-loaded data and draft retained; review disabled until quote recovers  |
| Refresh during checkout                                                                   | Initially lost the draft; fixed and manually retested successfully                 |
| Real session revocation followed by another account login                                 | Passed; explicit expiry message, then correct owner workspace                      |
| Collected owner/customer screens                                                          | Passed; pickup code and fulfillment actions hidden after collection                |

Screenshots are saved locally as `tmp/ui-qa-desktop-collected.jpg` and `tmp/ui-qa-phone-collected.jpg`. Network failures were simulated through a disposable local proxy, which was stopped afterward. The normal preview remains on port 8087 with its original connection setting.

This was browser verification, not physical-device testing. Native keyboard behavior, physical printing, phone push delivery, and an exhaustive device/screen-reader matrix remain unverified. Automated tests cover true concurrent action races; browser stale-stage fixtures exercise conflict feedback. The local preview serves the rebuilt web export. See [release readiness](RELEASE_READINESS.md) for publishing status and the rollback procedure.
