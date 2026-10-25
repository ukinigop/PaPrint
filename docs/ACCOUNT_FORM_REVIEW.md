# Account form feedback — 26 October 2026

Implemented locally; not committed, pushed or deployed.

- Removed the login promotional card and workspace-routing explanation.
- Signup requires Confirm password and blocks empty or mismatched confirmation. Password and confirmation have separate visibility controls. Confirmation is never stored or sent to the API.
- Read-only checklist indicators update as the password changes. They reflect the existing server policy: at least 10 characters and no more than 128. No uppercase, number or symbol requirement was introduced.
- Signup and account profile phone input accepts digits only, preserves a leading zero and caps at 11 digits. Submitting incomplete numbers is rejected. The API rejects any supplied phone that is not exactly 11 digits; omission remains supported for older API clients and existing accounts. Existing records are not rewritten.
- Correcting form input clears old submission errors, while password-match feedback updates immediately.

Validation: 33 frontend tests and 29 backend integration tests passed, along with TypeScript, lint and web export. Backend tests use isolated temporary MongoDB. Browser checks covered simplified login, both signup roles, password checklist changes in both directions, mismatched confirmation, corrected feedback, independent visibility controls, numeric phone input/capping and incomplete phone rejection. No real account or production database was modified. Existing login and account access continue to pass integration coverage.

The earlier direct-print changes remain separate pending local changes.
