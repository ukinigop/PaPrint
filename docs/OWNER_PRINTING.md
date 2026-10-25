# Printing from the owner workspace

In an approved shop's web workspace, open a Preparing order and choose **Start printing**. Once the server accepts the transition to Printing, **Print file** appears beside each selected document. Pressing it loads the PDF through the existing authenticated owner-only endpoint and requests the browser's print dialog directly. No visible PDF preview or second print button is shown.

The browser's print dialog provides printer selection and print settings. Browser PDF support must be enabled. If the browser blocks PDF printing, an inline error recommends **Download file** as the fallback.

Confirm the printer, paper size, copies, color and sides in the print dialog. Browser printing cannot silently configure those settings. PaPrint keeps the order settings in the workspace.

For page ranges spanning multiple PDFs, each Print file button shows the page numbers in its original PDF. For example, if two PDFs each contain two pages and the booking selects `2-3`, print page `2` of the first PDF and page `1` of the second. Enter these numbers in each file's print dialog. Files excluded from the booked range have no Print file button. Upload order and original files are preserved.

The print button is available only while the order is Printing. **Mark as Done** hides the file print controls, leaving pickup payment and collection as the next actions. Cancelled, Rejected and Collected orders retain their authorized owner downloads but have no printing action. Cancelling or closing a print dialog leaves the order in Printing and does not confirm that paper was printed.

Each file download and print action has its own loading state and duplicate-click guard. Other files and order actions remain available while it loads. Errors appear beside the affected file and allow retry.

## Privacy and cleanup

Owner authorization and shop isolation are enforced by the existing file endpoint. Tokens are sent in an authorization header, never added to URLs. Responses must be PDF data before printing. Account changes invalidate in-flight PDF requests. A hidden, inaccessible browser frame transports the private PDF to the print dialog. Its blob URL is revoked after `afterprint`, on failure, retry or leaving the order, with a five-minute cleanup fallback for browsers that omit `afterprint`. No public file URL, third-party document viewer or new stored print copy is created.

The application's security policy allows local PDF blobs for frames and PDF objects. External frame sources remain excluded, and existing script and frame-ancestor restrictions remain in place.

## Direct-dialog validation — 23 October 2026

- 30 frontend tests pass, including opening only after PDF load, duplicate load events, leaving an order before load, restricted PDF viewers, print/load failures and resource cleanup. The browser transport is exercised with controlled test doubles; this does not prove native dialog support.
- TypeScript, lint and web export are checked for this change.
- The local owner UI was exercised with a delayed file-error response: no preview panel or second print button appears; only Print file loads while Download file and Mark as Done remain available. The file error resets the button and leaves the order in Printing.
- Actual native dialog appearance and physical output still require manual checking in a supported desktop browser. No automated print job was sent.
- This direct-dialog change is local and has not been pushed or deployed.

## Previous preview implementation validation — 22 October 2026

- 26 frontend tests pass, including authenticated print-file fetching, delayed responses after account changes, denial/expiry, invalid response content and continuous page-range mapping.
- 28 backend tests pass, including the PDF preview security policy, file authorization and existing order/payment rules. Tests use temporary isolated MongoDB.
- TypeScript, lint and web export are checked for this change.
- The owner Print file control and settings guidance were exercised in the local browser. Browser automation's security policy blocked opening the blob PDF viewer; native PDF rendering, the actual print dialog and physical output require manual testing in a supported desktop browser. No physical print job was sent.
- The simplified sequence was verified through the local UI: Preparing has Start printing and no file print controls; the successful transition to Printing reveals Print file and Mark as Done; Done hides printing controls and offers pickup payment. Download remains available at each stage.
- Independent loading was verified with a two-file local order and delayed file responses: only the clicked download shows a spinner; the other download and Start printing remain enabled. A simulated failure resets that download and displays an inline error. Loading a print preview leaves both downloads, the other Print file control and Mark as Done enabled. Closing the preview during loading works.
- Reviewed for the requested main-branch update together with the approval-tab, customer Orders and inline Profile-panel fixes. Deployment completion is tracked separately from these local checks.

Manual checks for the current flow: press Print file and confirm the native print dialog opens without an app preview, cancel without changing order status, retry, test page ranges across multiple PDFs, leave the order during loading, and check a real printer's color/duplex/copy settings. Repeat at narrow and desktop widths. Confirm unrelated owners cannot fetch the PDF and terminal orders offer downloads only.
