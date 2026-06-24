#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const requiredStates = [
  "idle",
  "run-right",
  "run-left",
  "jump",
  "play",
  "sleep",
  "interact",
];

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--order") options.order = argv[++index];
    else if (item === "--customer") options.customer = argv[++index];
    else if (item === "--pet-id") options.petId = argv[++index];
    else if (item === "--display-name") options.displayName = argv[++index];
    else if (item === "--style") options.style = argv[++index];
    else if (item === "--notes") options.notes = argv[++index];
    else if (item === "--force") options.force = true;
    else if (item === "--help" || item === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${item}`);
  }
  return options;
}

function printHelp() {
  console.log(`Create a production workspace for one customer pet.

Usage:
  npm run order:new -- --order ORDER-001 --customer "Customer Name" --pet-id customer_pet --display-name "Customer Pet"

Optional:
  --style "sticker"
  --notes "Customer wants a sleepy cat mood."
  --force
`);
}

function safeSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function assertSafePetId(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("--pet-id must use only letters, numbers, hyphen, or underscore.");
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeProductionChecklist(filePath, options) {
  const content = `# MiraPet Order Production

Order: ${options.order}
Customer: ${options.customer}
Pet: ${options.displayName}
Style: ${options.style ?? "not specified"}

## Inputs

- [ ] Customer has provided one to five usable reference images.
- [ ] Customer owns or has permission to use the character/person/pet reference.
- [ ] Reference images are stored in \`reference-images/\`.
- [ ] Style and avoidances are recorded in \`order.json\`.
- [ ] Support scope, update policy, and rework boundary have been sent to the customer.

## Frame Generation

- [ ] Use \`docs/chatgpt-frame-prompt.md\` to generate transparent PNG frames.
- [ ] Put frames in every required state folder under \`source-pet/\`.
- [ ] File names are continuous: \`000.png\`, \`001.png\`, ...
- [ ] No frame contains text, background scenery, detached symbols, or cast shadows.
- [ ] Every frame has transparent padding on all four edges.
- [ ] Identity is consistent across every state.

## Build

\`\`\`powershell
npm run petpack -- validate ${path.relative(root, path.dirname(filePath)).replaceAll("\\", "/")}/source-pet
npm run petpack -- build ${path.relative(root, path.dirname(filePath)).replaceAll("\\", "/")}/source-pet --out dist/${options.petId}.petpkg
npm run petpack -- check-package dist/${options.petId}.petpkg
\`\`\`

## Acceptance

- [ ] Review \`dist/${options.petId}.package/contact-sheet.png\`.
- [ ] Keep \`dist/${options.petId}.package/report.json\` with the order record.
- [ ] Customer asset rights confirmation is retained with the order record.
- [ ] Import \`dist/${options.petId}.petpkg\` into MiraPet.
- [ ] Test drag movement, double-click interaction, sleep, play, jump, and idle.
- [ ] Create customer delivery after acceptance:

\`\`\`powershell
npm run customer:delivery -- --order-file ${path.relative(root, path.join(path.dirname(filePath), "order.json")).replaceAll("\\", "/")}
\`\`\`
`;
  fs.writeFileSync(filePath, content, "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.order) throw new Error("Missing --order.");
  if (!options.customer) throw new Error("Missing --customer.");
  if (!options.petId) throw new Error("Missing --pet-id.");
  if (!options.displayName) throw new Error("Missing --display-name.");
  assertSafePetId(options.petId);

  const orderSlug = safeSlug(options.order);
  const targetDir = path.join(root, "orders", orderSlug);
  if (fs.existsSync(targetDir) && !options.force) {
    throw new Error(`Order workspace already exists: ${targetDir}. Use --force to replace it.`);
  }
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  const sourceDir = path.join(targetDir, "source-pet");
  const referenceDir = path.join(targetDir, "reference-images");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(referenceDir, { recursive: true });
  for (const state of requiredStates) {
    fs.mkdirSync(path.join(sourceDir, state), { recursive: true });
  }

  writeJson(path.join(sourceDir, "pet.config.json"), {
    id: options.petId,
    displayName: options.displayName,
    cellWidth: 192,
    cellHeight: 208,
    states: {
      idle: { fps: 6, loop: true },
      runRight: { fps: 12, loop: true },
      runLeft: { fps: 12, loop: true },
      jump: { fps: 10, loop: false },
      play: { fps: 8, loop: false },
      sleep: { fps: 4, loop: true },
      interact: { fps: 8, loop: false },
    },
  });

  writeJson(path.join(targetDir, "order.json"), {
    order: options.order,
    customer: options.customer,
    petpkg: `dist/${options.petId}.petpkg`,
    notes: options.notes ?? "",
    rightsConfirmed: false,
    supportScopeConfirmed: false,
    evidence: {
      contactSheet: `dist/${options.petId}.package/contact-sheet.png`,
      report: `dist/${options.petId}.package/report.json`,
      productionChecklist: path.relative(root, path.join(targetDir, "PRODUCTION.md")).replaceAll("\\", "/"),
    },
    production: {
      petId: options.petId,
      displayName: options.displayName,
      style: options.style ?? "",
      sourcePet: "source-pet",
      referenceImages: "reference-images",
    },
  });
  writeProductionChecklist(path.join(targetDir, "PRODUCTION.md"), options);

  console.log(`Order workspace written to ${targetDir}`);
}

try {
  main();
} catch (error) {
  console.error(`create-order: ${error.message}`);
  process.exitCode = 1;
}
