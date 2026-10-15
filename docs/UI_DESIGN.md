# PaPrint Figma implementation

Source: [PaPrint wireframes](https://www.figma.com/design/Em6FqXJhr0zs7YrR7uX3vd), from the conversation **Create printing app wireframes**, including the later splash screen and logo.

## Design

- Surface/background: #E9EEF2.
- Primary teal: #276A68; selected/tint: #DCEAE7.
- Text: #233E48; supporting text: #637A84; divider: #CCD7DE.
- Raised surfaces: paired 6px shadows, 14px blur, dark #9CADBA5C and light #FFFFFFF2.
- Inset inputs use the same paired shadows. Older Android versions use elevation/border fallbacks.
- Manrope Medium, SemiBold, Bold are bundled locally. Headings 26px, section titles 18px, body 14px, captions/navigation 11–12px.
- 24px mobile gutters, 20px card radius/padding, 16px controls, minimum 44px hit targets.
- Customer width adapts to phones; owner workspace uses a desktop sidebar at 960px and above, with a mobile navigation row below that.

## Implemented screens

Login/signup support customer and shop-owner accounts. A real loading screen appears while fonts/session restore. Home, Shops, shop details, upload, options, review/payment choice, GCash placeholder, Orders, Preparing/Printing/Done/Collected tracking, and Profile follow the Figma hierarchy.

Shop owners have business details, private registration PDF upload, review/submit, status overview, searchable order queue, production details/downloads, payment confirmation, and collection controls. Profile supports personal details, saved shops, notifications, payment/order history, paper preference, reduced motion, help, privacy notice, and sign out. Owners can switch to the customer app and back from Profile.

Exact Figma SVGs are bundled in mobile/assets/figma; no temporary remote Figma asset URL is used at runtime. Controls reuse shared design components and tokens. The later logo concept supplies the folded-paper printer mark. Tabs switch immediately; buttons, true upload progress, splash dots, and the Printing state use restrained motion and respect reduced-motion preferences.

## Deliberate functional limits

GCash is a placeholder, matching the wireframe's placeholder QR. It cannot create a pretend paid order. Pay-on-pickup is functional; the assigned owner confirms receipt before collection.

Uploads remain validated PDFs with accurate page counts: 3 MB in the hosted/local UI preview, 15 MB with the standalone demo API. The wireframe's DOCX/JPG/PNG and 25 MB text is replaced with the real supported limits. Finishing currently supports No binding.

Administrators review submitted partners in a responsive approval dashboard; owners cannot self-approve. Rejected registrations show a reason and can be corrected/resubmitted. Approved owners control operating hours, contact, rates and open/closed status; approved identity documents remain locked. Password recovery/email verification, public legal terms, and document retention/account deletion workflows remain future work. No social login is included.

## Verification

Backend integration tests cover account persistence, privacy, scoped owner access, registration gating, payment-before-collection, real page-range pricing, GCash rejection, private GridFS downloads, pickup notifications, and idempotent bookings. Frontend typecheck, lint, and web/Android exports are required. Browser QA checks phone and desktop layouts and the customer/owner order flow. Physical-device motion, hardware keyboard behavior, and background push delivery still require device testing.
