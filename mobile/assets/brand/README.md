# PaPrint approved artwork

Source: team Canva design `DAHYLC2XRfw`, page 11, exported 26 October 2026 using Canva's PDF Print export in RGB. The Canva document was not edited.

- `icon`: original transparent primary mark embedded in the approved page.
- `icon-reversed`: the exact reversed mark, including Canva's rounded teal background and white mark.
- `logo-full`: the original clipped icon and custom letter paths from the approved page. Per the user's correction, the white outline around the lettering is converted to a transparent knockout; the logo contains no visible white pixels. Letter shapes, spacing, icon geometry and teal color are preserved.

SVG sources preserve the source image data, masks, paths, lettering and colors. No substitute font, redrawing, AI reconstruction, stretching or tint is used. PNG copies provide predictable cross-platform display: the full logo is 1155 × 408, the primary icon is 640 × 659, and the reversed icon is 640 × 640. All UI placements preserve aspect ratio.

The installer icon uses the primary mark with white padding. Android adaptive foreground and monochrome files use the same mark with safe transparent padding; Android applies the launcher's monochrome tint. The favicon uses the primary mark. Native app icons need a fresh native build; updating web assets does not replace already installed native icons.

Checked locally: TypeScript, lint, 33 frontend tests and web export. Visual checks covered the login and owner headers at phone width (390 px) and desktop width, and the extracted artwork was compared with page 11. The browser viewport override was reset after testing. This branding update has not been committed or deployed.
