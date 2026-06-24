# Commercial Delivery Playbook

## Order Intake

Collect these before production:

- Customer display name for the pet.
- One to five reference images.
- Desired style: photo-like, sticker, plush, pixel, anime, clay, or flat vector.
- Required states beyond the default seven, if any.
- Delivery platform: Windows for v1.
- Whether the customer wants installation help.

Do not accept:

- Copyrighted characters without permission.
- Low-resolution references where the character identity cannot be read.
- Requests that require text, logos, speech bubbles, or background scenes inside frames.

## Production Checklist

1. Create an order workspace:

```powershell
npm run order:new -- --order ORDER-001 --customer "Customer Name" --pet-id customer_pet --display-name "Customer Pet"
```

2. Put customer reference images into `orders/<order>/reference-images/`.
3. Create frames in `orders/<order>/source-pet/` by following `orders/<order>/PRODUCTION.md`.
4. Generate transparent PNG frames using `docs/chatgpt-frame-prompt.md`.
5. Place frames into the required state folders.
6. Run:

```powershell
npm run petpack -- validate orders/<order>/source-pet
npm run petpack -- build orders/<order>/source-pet --out dist/<pet-id>.petpkg
npm run petpack -- check-package dist/<pet-id>.petpkg
```

7. Review `<pet-id>.package/contact-sheet.png`.
8. Keep `<pet-id>.package/report.json` with the order record.
9. Import the `.petpkg` into MiraPet and test every state.
10. Set `rightsConfirmed` and `supportScopeConfirmed` to `true` in `orders/<order>/order.json` only after the customer confirms asset rights and support boundaries.
11. Check the completed items in `orders/<order>/PRODUCTION.md`.
12. Run the standalone order gate before delivery:

```powershell
npm run order:verify -- --order-file orders/<order>/order.json
```

## Manual Source Folder

For one-off experiments, you can still create a source folder from `docs/pet.config.example.json`.

```powershell
npm run petpack -- validate <source-pet>
npm run petpack -- build <source-pet> --out dist/<pet-id>.petpkg
npm run petpack -- check-package dist/<pet-id>.petpkg
```

Review `<pet-id>.package/contact-sheet.png`, keep `<pet-id>.package/report.json`, and import the `.petpkg` into MiraPet before delivery.

## Acceptance Criteria

The pet can be delivered only when:

- Identity is consistent across all states.
- Every frame has transparent alpha.
- Frame edges remain transparent; `petpack` must not report opaque backgrounds or cropped edge pixels.
- No state contains text, background scenery, detached symbols, or shadows.
- Dragging switches between left and right running states.
- Double-click triggers an interaction state.
- Sleep and idle are visually distinct.
- The `.petpkg` imports without errors.
- MiraPet can restart and keep the selected pet.

## Runtime Import Limits

MiraPet rejects packages that exceed these runtime limits:

- `.petpkg` file size over 50 MB.
- Extracted archive size over 80 MB.
- More than 16 archive entries.
- Sprite file over 40 MB.
- Missing required states or states outside the supported row/frame/fps bounds.

## Customer Delivery

Send:

- the generated customer delivery folder from:

```powershell
npm run customer:delivery -- --customer "Customer Name" --petpkg dist/<pet-id>.petpkg --order ORDER-001
```

For Chinese customer names or notes, prefer UTF-8 order files:

```powershell
npm run customer:delivery -- --order-file orders/example-order.json
```

It contains the installer, `.petpkg`, bilingual `INSTALL.txt`, and `customer-manifest.json`.
It also writes a sibling `.zip` archive and `.zip.sha256` checksum for customer handoff.
`INSTALL.txt` must include install/import steps, tray reset instructions, support bundle instructions, manual update notes, and uninstall/data-retention notes.
When `--order-file` is used, `customer:delivery` enforces the order production gate. It requires rights confirmation, support-scope confirmation, production evidence, and checked production items before creating a customer delivery.
You can run the same gate earlier with `npm run order:verify -- --order-file orders/<order>/order.json`.

Verify both the folder and the archive before sending:

```powershell
npm run verify:customer -- deliveries/<delivery-folder>
npm run verify:customer -- deliveries/<delivery-folder>.zip
npm run handoff:new -- --delivery deliveries/<delivery-folder>.zip
```

Customer install note:

```text
Install MiraPet, open it from the Start Menu, click Import, and select the .petpkg file.
Use the tray icon to show, hide, or quit the pet.
```

The installer includes a default starter pet. The customer can use the app immediately, then import their custom `.petpkg`.

For demo or internal manual deliveries only, `--skip-order-gate` can bypass the order production gate. Do not use it for paid customer deliveries.

## Update Policy

MiraPet v0.1.x uses manual updates only:

- Build and verify a new release.
- Create a new customer delivery zip with the updated installer and the customer's `.petpkg`.
- Tell the customer to quit MiraPet, run the new installer, then reopen the app.
- Keep the delivered `.petpkg` as the backup source of truth.
- Run clean-machine acceptance again before sending paid runtime updates.

## Support Workflow

Ask the customer to:

1. Open the control panel.
2. Click `Support`.
3. Click `Data`.
4. Send the newest `logs/mirapet-support-*.zip`.

Support bundles intentionally exclude customer sprite images and source reference images. They include app version, config, app data path, diagnostics, and pet manifest summaries.

## Release Checklist

Before public sale:

- Replace default Tauri icons and product metadata.
- Sync product metadata with `npm run brand:sync`.
- Run commercial readiness checks with `npm run preflight`.
- Build the release handoff folder with `npm run release`.
- Verify the release handoff folder with `npm run verify:release`.
- Code-sign the Windows installer.
- Verify signing with `npm run verify:signing`.
- Create and complete a clean-machine report with `npm run acceptance:new`.
- Test install, uninstall, startup launch, and tray behavior on a clean Windows account.
- Generate the commercial readiness report with `npm run readiness`.
- Require `npm run readiness -- --strict` to pass before public sale.
- Keep one known-good `.petpkg` as a smoke-test asset.
- Version each customer delivery by app version and pet package id.

## Release Folder

`npm run release` writes:

```text
release/
  MiraPet_0.1.0_x64-setup.exe
  starter.petpkg
  starter-contact-sheet.png
  starter-report.json
  release-manifest.json
```

Treat `release-manifest.json` as the delivery record for that build. It records byte sizes and SHA-256 checksums for every file that should be sent.

Use `docs/branding.md`, `docs/windows-acceptance.md`, `docs/legal-and-signing.md`, and `docs/customer-operations.md` before public sale.

## Optional Signing

`npm run release` signs the installer only when `SIGNTOOL_PATH` is set.

Supported environment variables:

```powershell
$env:SIGNTOOL_PATH="C:\Path\To\signtool.exe"
$env:CERT_THUMBPRINT="<certificate thumbprint>"
```

or:

```powershell
$env:SIGNTOOL_PATH="C:\Path\To\signtool.exe"
$env:PFX_PATH="C:\Path\To\certificate.pfx"
$env:PFX_PASSWORD="<password>"
```

Optional:

```powershell
$env:TIMESTAMP_URL="http://timestamp.digicert.com"
```

