# Branding Checklist

Brand values are centralized in `brand.config.json`.

Run after editing brand metadata:

```powershell
npm run brand:sync
npm run preflight
```

This updates:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src/brand.ts`

## Required Before Public Sale

- Replace placeholder product name if needed.
- Replace `src-tauri/icons/*` with final app icons.
- Replace `src-tauri/EULA.txt` with reviewed legal terms.
- Confirm `identifier` uses a domain you control.
- Run `npm run release`.
- Verify `release/release-manifest.json`.

## Current Defaults

- Product: `MiraPet`
- Studio: `MiraPet Studio`
- Identifier: `com.mirapet.studio`
- Version: `0.1.0`

MiraPet is the selected v1 product name. Replace only if the product direction changes.

