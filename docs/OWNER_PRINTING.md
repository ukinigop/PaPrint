# Printing from the owner workspace

In an approved shop's web workspace, open a Preparing order and choose **Start printing**. Once the server accepts the transition to Printing, **Print file** appears beside each selected document. PaPrint loads the PDF through the existing authenticated owner-only endpoint and embeds a temporary browser preview. No manual file download is required.

Choose **Open print dialog** after the PDF loads, or use the PDF toolbar's print control. **Open PDF viewer** opens the same private PDF in a separate browser viewer when embedded printing is unavailable. Browser PDF support must be enabled. **Download file** remains available as a fallback.

Confirm the printer, paper size, copies, color and sides in the print dialog. Browser printing cannot silently configure those settings. PaPrint displays the order settings beside the preview.

For page ranges spanning multiple PDFs, the preview shows the page numbers in the current original PDF. For example, if two PDFs each contain two pages and the booking selects `2-3`, print page `2` of the first PDF and page `1` of the second. Enter these numbers in each file's print dialog. Files excluded from the booked range have no Print file button. Upload order and original files are preserved.

The print button is available only while the order is Printing. **Mark as Done** hides the file print controls and any open preview, leaving pickup payment and collection as the next actions. Cancelled, Rejected and Collected orders also retain their authorized downloads but have no printing action. Opening the preview, cancelling a print dialog, or closing it leaves the order in Printing and does not confirm that paper was printed. Download remains a secondary fallback throughout.

Each file download has its own loading state and duplicate-click guard. Other downloads and order actions remain available while that file loads. Download errors appear beside the affected file and allow retry; PDF preview loading is also confined to its own preview panel.

## Privacy and cleanup

Owner authorization and shop isolation are enforced by the existing file endpoint. Tokens are sent in an authorization header, never added to viewer URLs. Responses must be PDF data before being embedded. Account changes invalidate in-flight PDF requests. Temporary browser blob URLs are revoked when the preview is closed or unmounted. No public file URL, third-party document viewer or new stored print copy is created.

The application's security policy allows local PDF blobs for frames and PDF objects. External frame sources remain excluded, and existing script and frame-ancestor restrictions remain in place.

## Validation — 22 October 2026

- 26 frontend tests pass, including authenticated print-file fetching, delayed responses after account changes, denial/expiry, invalid response content and continuous page-range mapping.
- 28 backend tests pass, including the PDF preview security policy, file authorization and existing order/payment rules. Tests use temporary isolated MongoDB.
- TypeScript, lint and web export are checked for this change.
- The owner Print file control and settings guidance were exercised in the local browser. Browser automation's security policy blocked opening the blob PDF viewer; native PDF rendering, the actual print dialog and physical output require manual testing in a supported desktop browser. No physical print job was sent.
- The simplified sequence was verified through the local UI: Preparing has Start printing and no file print controls; the successful transition to Printing reveals Print file and Mark as Done; Done hides printing controls and offers pickup payment. Download remains available at each stage.
- Independent loading was verified with a two-file local order and delayed file responses: only the clicked download shows a spinner; the other download and Start printing remain enabled. A simulated failure resets that download and displays an inline error. Loading a print preview leaves both downloads, the other Print file control and Mark as Done enabled. Closing the preview during loading works.
- Reviewed for the requested main-branch update together with the approval-tab, customer Orders and inline Profile-panel fixes. Deployment completion is tracked separately from these local checks.

Manual checks: open a PDF, confirm the preview/print dialog loads, cancel without changing order status, test page ranges across multiple PDFs, close/reopen the preview, and check a real printer's color/duplex/copy settings. Repeat at narrow and desktop widths. Confirm unrelated owners cannot fetch the PDF and terminal orders offer downloads only.
