# PaPrint interface

The original [PaPrint wireframes](https://www.figma.com/design/Em6FqXJhr0zs7YrR7uX3vd) supply the brand and navigation foundation. The local print-studio redesign uses warm paper surfaces, green ink, sample studio photography, and receipt-like order summaries.

## Design

- Use paper `#F8F7F1` for the canvas, ivory `#FFFEFA` for forms and cards, and deep green `#184936` for primary actions. Vermilion `#CA4426` marks small accents. Statuses include a text label.
- DM Sans Bold sets the headings. Manrope sets controls and body text. Both font families ship with the app.
- Customer screens use a single column up to 480 px wide with a persistent bottom tab bar on customer routes. Checkout shows Files, Options, and Review above each step.
- Sign-in and signup use a split layout from 860 px. The owner workspace switches from horizontal navigation to a sidebar at 960 px. Admin registration lists and detail panels sit side by side on wide screens.
- Show the full original PaPrint logo during loading and authentication, and the icon inside the app.

## Studio artwork

The built-in image generator produced four local JPEGs. Each shop image is labeled as a sample. The gallery uses the same samples for every shop until actual partner images are available.

| Asset | Art direction |
| --- | --- |
| [printer.jpg](../mobile/assets/studio/printer.jpg) | Editorial product still life of a petroleum-green desktop printer with an ivory top, a vermilion control, and a geometric print on a pistachio tabletop. |
| [storefront.jpg](../mobile/assets/studio/storefront.jpg) | A street-level Philippine copy shop with a green-painted frame, a faded print shop sign, a potted plant, and an orange stool in morning light. |
| [counter.jpg](../mobile/assets/studio/counter.jpg) | A neighborhood pickup counter with warm paper, a leafy plant, an orange stool, and natural window light. |
| [print-room.jpg](../mobile/assets/studio/print-room.jpg) | An off-white copier and reams of paper on a plywood desk beside green window trim. |

## Implemented screens

Customers start or resume a booking from Print. A ready order puts the pickup code within reach. Shops handles discovery and bookmarks, while Orders handles active orders, receipts and history. Profile holds personal details, printing preferences, appearance and help.

Light and dark themes share their typography and layout. Appearance follows the device by default, with a manual choice saved on the device. Owners can reach Appearance through their account preferences, and admins can open it from the dashboard header.

Checkout has three steps. Upload lets customers preview their PDFs, Options sets pages and copies, and Review confirms the shop and cash due. Switching shops with an unfinished upload asks whether to move it and recalculates the quote. The next action stays beside its total on phone screens and joins the scrollable content when vertical space is tight.

Owners start in one searchable order queue. Shop profile holds business and operating details. Each order shows the next available fulfillment action through printing, pickup payment and collection. Owners can switch to the customer app and back from Profile. Administrators review registrations and location changes in separate queues, with a detail screen on phones and a split view on desktop.

Exact Figma SVGs are bundled in mobile/assets/figma; no temporary remote Figma asset URL is used at runtime. Controls reuse shared design components and tokens. The later logo concept supplies the folded-paper printer mark. Tabs switch immediately; buttons, true upload progress, splash dots, and the Printing state use restrained motion and respect reduced-motion preferences.

## Deliberate functional limits

Checkout offers cash on pickup only, with no online payment choice or QR screen. The assigned owner confirms receipt before collection. Old GCash links redirect to order review; the API continues to reject GCash bookings.

Uploads remain validated PDFs with accurate page counts: 3 MB in the hosted/local UI preview, 15 MB with the standalone demo API. The wireframe's DOCX/JPG/PNG and 25 MB text is replaced with the real supported limits. Finishing currently supports No binding.

Administrators review submitted partners in a responsive approval dashboard; owners cannot self-approve. Rejected registrations show a reason and can be corrected/resubmitted. Approved owners control operating hours, contact, rates and open/closed status; approved identity documents remain locked. Password recovery/email verification, public legal terms, and document retention/account deletion workflows remain future work. No social login is included.

## Verification

Backend integration tests cover account persistence, privacy, scoped owner access, registration gating, payment-before-collection, real page-range pricing, GCash rejection, private GridFS downloads, pickup notifications, and idempotent bookings. Frontend typecheck, lint, and web/Android exports are required. Browser QA checks phone and desktop layouts and the customer/owner order flow. Physical-device motion, hardware keyboard behavior, and background push delivery still require device testing.

Frontend session, quote, upload-retry, and booking-state regression checks run with `npm run test:frontend`. See [customer flow QA](CUSTOMER_FLOW_QA.md) for the manual acceptance checklist and [shop discovery](SHOP_DISCOVERY.md) for sorting and location behavior.
