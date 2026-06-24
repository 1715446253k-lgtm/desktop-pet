# Open-source Runtime Signing Plan

MiraPet uses an open-source runtime plus paid custom pet production.

## Business Model

- The MiraPet desktop runtime is open source under the MIT License.
- The pet package format and local builder are part of the runtime/tooling.
- Paid work is the custom production service: reference intake, frame generation, QA, packaging, delivery, and support.
- Customer `.petpkg` files and source references are not automatically open source.

## Free Signing Route

Use SignPath Foundation for free Authenticode signing only if the public repository qualifies as an open-source project.

Practical requirements to prepare:

- Use an OSI-approved license such as MIT.
- Keep the runtime source public.
- Do not include proprietary runtime code in the signed build.
- Publish build instructions and release artifacts.
- Document what MiraPet does and how users can build it.
- Keep the project active and maintainable.

Microsoft lists SignPath Foundation as a free code signing option for open-source projects:

- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options

SignPath Foundation project requirements are documented here:

- https://signpath.org/

## Repository Checklist Before Applying

- [ ] Public GitHub repository exists.
- [ ] `LICENSE` is present and matches `package.json`.
- [ ] README explains the open-source runtime and paid custom pet service model.
- [ ] README includes build and release commands.
- [ ] No customer reference images, generated customer frames, or private `.petpkg` files are committed.
- [ ] Release workflow can build the same installer from public source.
- [ ] The project has at least one public release.
- [ ] Contact and maintainer information are present.

## Private Asset Rule

Keep these out of the public repository:

- `orders/`
- `deliveries/`
- `acceptance-reports/` if they include private customer details
- customer reference images
- generated customer frames
- paid customer `.petpkg` files

Sample starter assets can stay public only when they are original demo assets that you are comfortable licensing with the runtime.

## If SignPath Is Not Approved

Use a paid signing option:

- Azure Trusted Signing / Azure Artifact Signing
- OV code signing certificate
- EV code signing certificate

Do not use self-signed certificates for paid public delivery. They are acceptable only for internal testing.
