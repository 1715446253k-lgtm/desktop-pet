# MiraPet Demo Order Production

Order: DEMO-001
Customer: 示例客户
Pet: Starter Pet
Style: demo

## Inputs

- [x] Customer has provided one to five usable reference images.
- [x] Customer owns or has permission to use the character/person/pet reference.
- [x] Reference images are stored in `reference-images/`.
- [x] Style and avoidances are recorded in `order.json`.
- [x] Support scope, update policy, and rework boundary have been sent to the customer.

## Frame Generation

- [x] Use `docs/chatgpt-frame-prompt.md` to generate transparent PNG frames.
- [x] Put frames in every required state folder under `source-pet/`.
- [x] File names are continuous: `000.png`, `001.png`, ...
- [x] No frame contains text, background scenery, detached symbols, or cast shadows.
- [x] Every frame has transparent padding on all four edges.
- [x] Identity is consistent across every state.

## Acceptance

- [x] Review `release/starter-contact-sheet.png`.
- [x] Keep `release/starter-report.json` with the order record.
- [x] Customer asset rights confirmation is retained with the order record.
- [x] Import `release/starter.petpkg` into MiraPet.
- [x] Test drag movement, double-click interaction, sleep, play, jump, and idle.
