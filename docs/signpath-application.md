# SignPath Foundation Application Notes

Use this as the checklist when applying for free open-source code signing.

## Project Summary

MiraPet is an MIT-licensed Windows desktop pet runtime and local pet package builder. Users can import `.petpkg` packages containing transparent spritesheet animations. The paid business model is custom pet production, not selling a closed-source runtime.

## Public Repository Requirements

- Repository is public.
- Source code is under the MIT License.
- Build instructions are in `README.md`.
- CI runs lint, frontend build, package tests, order-gate tests, and Rust runtime tests.
- Private customer data is excluded through `.gitignore`.

## Build Commands

```powershell
npm ci
npm run lint
npm run build
npm run preflight -- --skip-release
npm run release
```

## Signing Goal

Sign the Windows NSIS installer:

```text
release/MiraPet_0.1.0_x64-setup.exe
```

## Public/Private Boundary

Public:

- runtime source
- pet package builder
- original starter sample asset
- docs and tests

Private:

- customer reference images
- generated customer frames
- paid `.petpkg` deliveries
- customer order records
- support bundles

## Links To Provide

- Public repository URL: https://github.com/1715446253k-lgtm/desktop-pet
- Release URL: https://github.com/1715446253k-lgtm/desktop-pet/releases/tag/v0.1.0
- Project website: optional.
