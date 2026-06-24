# MiraPet Studio

Open-source Windows desktop pet runtime plus a local pet package builder.

The runtime is MIT licensed. The commercial business model is paid custom pet production: reference intake, transparent animation frame generation, QA, `.petpkg` packaging, delivery, and support.

## Product Model

This product uses one universal desktop app and many pet packages.

```text
Customer image
-> ChatGPT transparent animation frames
-> petpack build
-> .petpkg
-> MiraPet import
```

The runtime never depends on Codex. Codex-style pets are only an asset format inspiration.

Commercial workflow details are in `docs/commercial-delivery.md`.
Release acceptance is in `docs/windows-acceptance.md`.
Rights and signing notes are in `docs/legal-and-signing.md`.
Branding instructions are in `docs/branding.md`.
Customer operations are in `docs/customer-operations.md`.
Open-source signing preparation is in `docs/open-source-signing.md`.

## Development

```powershell
npm install
npm run tauri:dev
```

Run public-repository checks:

```powershell
npm run lint
npm run build
npm run preflight -- --skip-release
```

Build Windows installer:

```powershell
npm run icons:generate
npm run tauri:build
```

Build a release handoff folder:

```powershell
npm run brand:sync
npm run preflight
npm run release
```

`npm run preflight` checks product metadata, release files, petpack regression tests, and Rust runtime tests. `npm run release` also runs preflight before and after packaging.

The release folder contains the installer, sample package, contact sheet, QA report, and release manifest. `release-manifest.json` includes file sizes and SHA-256 checksums.
Verify an existing release folder with:

```powershell
npm run verify:release
```

Create a customer handoff folder:

```powershell
npm run order:new -- --order ORDER-001 --customer "Customer Name" --pet-id customer_pet --display-name "Customer Pet"
npm run order:verify -- --order-file orders/example-order.json
npm run customer:delivery -- --customer "Customer Name" --petpkg dist/starter.petpkg --order ORDER-001
npm run customer:delivery -- --order-file orders/example-order.json
npm run verify:customer -- deliveries/2026-06-23-demo-001-示例客户
npm run verify:customer -- deliveries/2026-06-23-demo-001-示例客户.zip
npm run handoff:new -- --delivery deliveries/2026-06-23-demo-001-示例客户.zip
npm run readiness
npm run readiness -- --strict
```

## Create A Sample Package

```powershell
node tools/create-sample-pet.mjs
npm run petpack -- validate sample-pets/starter
npm run petpack -- build sample-pets/starter --out dist/starter.petpkg
npm run petpack -- check-package dist/starter.petpkg
npm run test:petpack
npm run test:rust
```

Then launch MiraPet and import `dist/starter.petpkg`.

`petpack build` also writes:

- `dist/starter.package/contact-sheet.png`
- `dist/starter.package/report.json`

The same starter pet is bundled as the first-run default pet, so a clean install opens with a working pet even before the customer imports a custom package.

Runtime updates are manual for v0.1.x: quit MiraPet, run the newer installer, then keep the delivered `.petpkg` as the backup copy of the custom pet.

## Pet Source Layout

```text
source-pet/
  pet.config.json
  idle/000.png
  run-right/000.png
  run-left/000.png
  jump/000.png
  play/000.png
  sleep/000.png
  interact/000.png
```

Each state folder must contain continuous transparent PNG files named `000.png`, `001.png`, and so on.

## Customer Delivery Flow

1. Customer sends one or more reference images.
2. Generate transparent PNG animation frames with ChatGPT.
3. Place frames into the required source layout.
4. Run `petpack validate`.
5. Run `petpack build`.
6. Send the customer the universal installer and their `.petpkg`.
7. Customer installs MiraPet and imports the package.

## Commercial Quality Gate

Before delivery:

- The role must remain visually consistent across all states.
- PNG frames must have real alpha transparency.
- No text, backgrounds, detached symbols, shadows, or UI marks inside frames.
- Run, jump, sleep, and interact states must be semantically different.
- `petpack validate` must pass.
- `petpack check-package` must pass for the final `.petpkg`.
- The generated `.petpkg` must import successfully in the runtime.
- `contact-sheet.png` and `report.json` must be saved with the customer order record.

