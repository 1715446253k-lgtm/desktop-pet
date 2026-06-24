# Customer Operations Playbook

This document defines the operating rules for selling custom MiraPet pet production while keeping the runtime open source.

## Product Name

Use `MiraPet` as the product name and `米拉桌宠` as the Chinese customer-facing name when needed. Do not create a formal brand system before the sales process proves demand.

## Open-source Runtime Model

- The MiraPet runtime is open source under the MIT License.
- Paid work is custom pet production, QA, packaging, delivery, and support.
- Customer `.petpkg` files, reference images, and generated private frames are not automatically open source.
- Do not commit private customer orders, deliveries, or references to the public repository.

## Order Policy

- Accept one pet, person, or character per order unless the quote explicitly covers multiple pets.
- Require one to five reference images.
- Require written confirmation that the customer owns or has permission to use the submitted references.
- Reject copyrighted characters, public figures, brand mascots, logos, readable text, and background-scene requests unless written rights are provided.
- Record style, avoidances, customer notes, source references, generated frames, contact sheet, and QA report inside the order folder.

## Production Evidence

Keep these files for every paid delivery:

- `orders/<order>/order.json`
- `orders/<order>/PRODUCTION.md`
- customer reference images
- final `dist/<pet-id>.petpkg`
- `dist/<pet-id>.package/contact-sheet.png`
- `dist/<pet-id>.package/report.json`
- customer delivery zip
- customer delivery `.zip.sha256`

## Delivery Rules

- Deliver only the verified customer zip produced by `npm run customer:delivery`.
- For paid orders, use `--order-file` and do not bypass the order production gate.
- Set `rightsConfirmed` and `supportScopeConfirmed` to `true` only after the customer confirms both points in writing.
- Run `npm run verify:customer` against both the delivery folder and the zip before sending.
- Generate the internal seller handoff with `npm run handoff:new -- --delivery deliveries/<delivery-folder>.zip`.
- Do not send loose installer files through chat without the matching `.petpkg`, `INSTALL.txt`, and checksum.
- Use the latest release installer that matches `release/release-manifest.json`.

## Manual Update Policy

Version `0.1.x` uses manual updates only.

- Send customers a new delivery zip when the runtime changes.
- Tell customers to quit MiraPet before running the new installer.
- Imported pet packages should remain in the app data directory, but the delivered `.petpkg` remains the backup source of truth.
- Run clean-machine acceptance again before sending any paid runtime update.

## Support Scope

Included support:

- installation problems
- `.petpkg` import failures
- startup and tray behavior
- reset position issues
- diagnostics and support bundle review

Not included unless separately quoted:

- unlimited redesign
- changing the reference character after production starts
- fixing customer Windows corruption, antivirus policy, or enterprise device management restrictions
- support for assets the customer does not have rights to use

## Data Retention

- Keep production evidence for at least 90 days after delivery.
- Do not share source references, generated frames, or customer sprites with other customers.
- Support bundles intentionally exclude sprite/image bytes.
- If a customer requests deletion, remove order source references, generated frames, and delivery archives after confirming the request in writing.

## Refund And Rework Boundary

- Offer one correction round for objective production defects: wrong import package, transparent-background artifacts, cropped frames, or mismatched agreed style.
- Treat subjective style changes after approval as paid rework.
- Treat Windows SmartScreen warnings as a signing/trust issue, not a pet production defect; public sale should wait until the installer is signed.

## Release Gate

Before public sale, require:

```powershell
npm run release
npm run verify:release
npm run verify:signing
npm run readiness -- --strict
```

`npm run readiness -- --strict` must pass. If it fails because the installer is unsigned or Windows acceptance is incomplete, do not sell the runtime as production-ready.
