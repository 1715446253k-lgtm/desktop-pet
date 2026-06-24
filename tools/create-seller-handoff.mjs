#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import AdmZip from "adm-zip";

const root = process.cwd();

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--delivery") options.delivery = argv[++index];
    else if (item === "--out") options.out = argv[++index];
    else if (item === "--help" || item === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${item}`);
  }
  return options;
}

function printHelp() {
  console.log(`Create an internal seller handoff checklist for one customer delivery.

Usage:
  npm run handoff:new -- --delivery deliveries/YYYY-MM-DD-order-customer
  npm run handoff:new -- --delivery deliveries/YYYY-MM-DD-order-customer.zip
`);
}

function readJsonText(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error.message}`);
  }
}

function readDeliveryManifest(deliveryPath) {
  const resolved = path.resolve(deliveryPath);
  if (!fs.existsSync(resolved)) throw new Error(`Delivery not found: ${resolved}`);
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    const manifestPath = path.join(resolved, "customer-manifest.json");
    if (!fs.existsSync(manifestPath)) throw new Error(`Missing ${manifestPath}`);
    return {
      deliveryPath: resolved,
      manifest: readJsonText(fs.readFileSync(manifestPath, "utf8"), manifestPath),
      sourceKind: "folder",
    };
  }
  if (!resolved.toLowerCase().endsWith(".zip")) {
    throw new Error("Delivery must be a folder or .zip archive.");
  }
  const zip = new AdmZip(resolved);
  const manifestEntry = zip.getEntry("customer-manifest.json");
  if (!manifestEntry) throw new Error("Delivery archive missing customer-manifest.json.");
  return {
    deliveryPath: resolved,
    manifest: readJsonText(manifestEntry.getData().toString("utf8"), "customer-manifest.json"),
    sourceKind: "zip",
  };
}

function safeSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function renderChecklist(context) {
  const { deliveryPath, manifest, sourceKind } = context;
  const deliveryName = path.basename(deliveryPath);
  const installer = manifest.files?.find((file) => file.name.endsWith("_x64-setup.exe"));
  const petpkg = manifest.files?.find((file) => file.name.endsWith(".petpkg"));
  const installNote = manifest.files?.find((file) => file.name === "INSTALL.txt");
  const archiveName = manifest.archiveName ?? (sourceKind === "zip" ? deliveryName : `${deliveryName}.zip`);
  const lines = [
    "# MiraPet Seller Handoff",
    "",
    `Created: ${new Date().toISOString()}`,
    `Customer: ${manifest.customer ?? ""}`,
    `Order: ${manifest.order ?? ""}`,
    `App version: ${manifest.appVersion ?? ""}`,
    `Delivery source: ${deliveryPath}`,
    `Delivery archive: ${archiveName}`,
    "",
    "## Files",
    "",
    "| File | Bytes | SHA-256 |",
    "|---|---:|---|",
  ];

  for (const file of manifest.files ?? []) {
    lines.push(`| ${file.name} | ${file.bytes} | ${file.sha256} |`);
  }

  lines.push(
    "",
    "## Customer Message Checklist",
    "",
    "- [ ] Send the verified delivery zip only, not loose files.",
    "- [ ] Send the `.zip.sha256` checksum next to the zip.",
    "- [ ] Tell the customer to install MiraPet first, then import the `.petpkg`.",
    "- [ ] Tell the customer to use tray `Reset Position` if the pet is off screen.",
    "- [ ] Tell the customer to keep the delivered `.petpkg` as a backup.",
    "- [ ] Tell the customer how to export `logs/mirapet-support-*.zip` for support.",
    "",
    "## Internal Delivery Checks",
    "",
    "- [ ] `npm run verify:customer` passed for the delivery folder.",
    "- [ ] `npm run verify:customer` passed for the delivery zip.",
    "- [ ] `INSTALL.txt` includes install, import, reset, support, update, and uninstall notes.",
    "- [ ] The pet was imported into MiraPet and all states were visually checked.",
    "- [ ] `contact-sheet.png` and `report.json` are retained with the order record.",
    "- [ ] Customer asset rights confirmation is retained with the order record.",
    "",
    "## Support Scope To Confirm",
    "",
    "- Included: install, import, startup, tray, reset position, and support bundle review.",
    "- Excluded unless quoted: unlimited redesign, new animation states, post-approval style changes, antivirus policy, and customer Windows repair.",
    "",
    "## Update Policy",
    "",
    "- MiraPet v0.1.x uses manual updates.",
    "- For runtime updates, send a new verified delivery zip and ask the customer to quit MiraPet before running the new installer.",
    "",
    "## Release Evidence",
    "",
    `- Installer: ${installer?.name ?? "missing"}`,
    `- Installer SHA-256: ${installer?.sha256 ?? "missing"}`,
    `- Pet package: ${petpkg?.name ?? "missing"}`,
    `- Pet package SHA-256: ${petpkg?.sha256 ?? "missing"}`,
    `- Install note SHA-256: ${installNote?.sha256 ?? "missing"}`,
    "",
    "## Final Send-Off",
    "",
    "- [ ] Delivery zip attached.",
    "- [ ] Checksum attached.",
    "- [ ] Customer instructions included.",
    "- [ ] Support boundary included.",
    "- [ ] Follow-up date recorded if installation help is included.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.delivery) throw new Error("Missing --delivery.");
  const context = readDeliveryManifest(options.delivery);
  const manifest = context.manifest;
  const defaultName = `${safeSlug(manifest.order ?? "order")}-${safeSlug(manifest.customer ?? "customer")}-seller-handoff.md`;
  const outputPath = path.resolve(options.out ?? path.join(root, "deliveries", defaultName));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, renderChecklist(context), "utf8");
  console.log(`Seller handoff written to ${outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(`create-seller-handoff: ${error.message}`);
  process.exitCode = 1;
}
