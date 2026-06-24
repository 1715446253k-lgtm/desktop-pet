# Contributing to MiraPet

MiraPet is an open-source desktop pet runtime and package builder. Paid customer work happens outside the public repository.

## Development Setup

```powershell
npm install
npm run tauri:dev
```

## Checks Before Pull Requests

```powershell
npm run lint
npm run build
npm run preflight -- --skip-release
```

`preflight -- --skip-release` avoids requiring local release artifacts while still running package, order-gate, and Rust tests.

## Private Data Rules

Do not commit:

- customer reference images
- generated customer frames
- paid customer `.petpkg` files
- `orders/` except documented examples
- `deliveries/`
- `release/`
- `acceptance-reports/`

Demo assets must be original assets that can be published under this repository's license.

## Code Style

- Keep TypeScript strict and lint-clean.
- Keep Rust runtime validations covered by tests.
- Keep package formats backward-compatible unless the schema version changes.
- Use English for code comments, identifiers, and documentation intended for contributors.
