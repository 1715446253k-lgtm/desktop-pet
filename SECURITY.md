# Security Policy

## Supported Versions

Only the latest public release is supported for security fixes.

## Reporting a Vulnerability

Please report security issues privately to the maintainer before opening a public issue.

Include:

- affected version
- operating system
- reproduction steps
- impact
- whether a malicious `.petpkg` is involved

## Package Safety Scope

MiraPet validates `.petpkg` archives before import:

- archive path traversal is rejected
- package size and extracted size are limited
- required animation states are validated
- spritesheet dimensions are bounded
- unsupported manifest shapes are rejected

Do not bypass package validation for customer deliveries.
