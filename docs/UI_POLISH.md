# Subtle interface polish

Reviewed locally on 22 October 2026 for the requested main-branch release. Live deployment must be verified separately from the checks below.

- Customer shop and order cards acknowledge presses with 120 ms opacity/scale transitions (0.985 scale). Navigation commits normally; no delays or list entrance sequences are added.
- Profile panels and order cancellation/rejection confirmations fade in over 140 ms. Layout remains immediate; height and scrolling are not animated. Typing, saving and polling do not restart the entrance animation.
- Profile chevrons rotate over 140 ms to reflect expanded state. Rapid toggles retarget the transition.
- Profile and owner save confirmations use a compact success notice with an alert announcement.
- Shop availability and customer order badges use explicit positive, neutral and negative tones while retaining their text labels.

All new motion uses the existing Reanimated dependency. System reduced-motion and the account's Reduce motion preference disable the fades, rotation transitions and press scaling. Tab navigation stays instant. No new dependencies, haptics, looping effects or printing/payment changes are included.

Validation: 26 frontend tests, TypeScript, lint, formatting and web export passed. Local browser checks covered Profile expansion/collapse, rapid toggles, inline save feedback, unchanged account preference saving, reduced-motion computed styles, card navigation and cancellation confirmation typing/dismissal. The test account's Reduce motion setting was restored after verification. No production data was changed.

Still to verify on a release build on a physical phone: press response, rapid interruption and scrolling on the slowest supported Android device. Browser checks cannot establish native frame rate or device feel.
