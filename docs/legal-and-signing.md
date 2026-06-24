# Legal And Signing Notes

This is an operational checklist, not legal advice.

## Customer Assets

- Confirm the customer owns or has permission to use the reference images.
- Do not create packages from copyrighted characters, celebrities, brand mascots, or logos unless the customer provides written permission.
- Keep source references and generated frames in the customer order record.
- Keep `contact-sheet.png` and `report.json` as production evidence.

## Package Terms

Recommended customer-facing terms:

- The MiraPet runtime is open source under the MIT License.
- The customer receives a custom pet package for personal desktop use unless a broader license is agreed in writing.
- The customer is responsible for rights to submitted source images.
- The generated pet package may not be resold as a standalone asset unless explicitly licensed.
- Support covers install/import/runtime issues, not unlimited redesign.

## Code Signing

Preferred route for the open-source runtime:

- Publish the runtime source under the MIT License.
- Apply for SignPath Foundation free code signing for open-source projects.
- Keep paid customer assets and private orders outside the public repository.

Before public sale or public release:

- Configure SignPath Foundation, Azure Trusted Signing, or a paid Windows Authenticode code-signing certificate.
- Sign `MiraPet_0.1.0_x64-setup.exe`.
- Timestamp the signature.
- Verify signature after upload/download.
- Record signed installer SHA-256 in `release-manifest.json` or a post-signing manifest.

Self-signed certificates are acceptable only for internal testing. They do not remove the unknown-publisher problem for normal customers.

Suggested verification commands:

```powershell
Get-FileHash .\release\MiraPet_0.1.0_x64-setup.exe -Algorithm SHA256
Get-AuthenticodeSignature .\release\MiraPet_0.1.0_x64-setup.exe
npm run verify:signing
```

During development or before a certificate is available, record the unsigned state with:

```powershell
npm run verify:signing -- --allow-unsigned
```

`npm run release` can sign automatically when these environment variables are set:

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

## Privacy

- Diagnostics intentionally exclude sprite image bytes.
- Diagnostics include app version, app data path, config, and pet manifest summaries.
- Tell customers before asking them to send diagnostics.
- Version `0.1.x` uses manual updates. Customers receive a new installer and should keep their delivered `.petpkg` as the backup pet package.
- App uninstall may leave user data behind for diagnostics or reinstall. Tell customers before asking them to manually delete app data.

