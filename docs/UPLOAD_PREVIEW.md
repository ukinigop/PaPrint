# Selected PDF previews

Customers can tap each successfully uploaded PDF on the upload and print-options screens to review that specific document. Web and native builds use an embedded reader with previous/next page and zoom controls. Closing it preserves the draft, file order, and print settings. It shows the original PDF; print options are applied separately at checkout. Native builds still require physical Android/iOS verification.

`GET /api/uploads/:id/preview` requires customer authentication and ownership of the upload, even before a booking exists. Responses are inline PDFs with private/no-store caching. Storage paths and bearer tokens are never included in preview URLs.

Mozilla PDF.js is pinned in the root and standalone server packages. Its compatibility build, worker, fonts, and character maps are served locally under `/api/pdf-preview`; document bytes are passed from the authenticated parent through an origin/source-checked message. No external document-viewing service receives files. Vercel explicitly includes these runtime assets. Closing a preview destroys its renderer. No browser-tab or share-sheet action is shown in the preview.

Native builds embed the reader in the existing WebView dependency. They pass authenticated PDF bytes in acknowledged 48 KiB chunks, without exposing tokens to the reader, opening a browser, writing a downloaded file, or using the share sheet. Navigation is restricted to PaPrint's reader URL. Loading failures/timeouts remain inside the preview; close and reopen to retry. Public reader assets may use the platform cache; document bytes are never loaded through the WebView's HTTP cache.

Local verification: upload two PDFs, preview each, navigate pages and zoom, close, continue to options, and confirm both files remain in the same order. API integration tests cover unauthorized and cross-customer access, staff access, original PDF bytes, local renderer assets, and framing restrictions; frontend tests cover authentication and delayed results after account changes.
