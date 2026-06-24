#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const releaseDir = path.join(root, "release");
const reportsDir = path.join(root, "acceptance-reports");

const sections = [
  {
    title: "Install",
    items: [
      "Install release/MiraPet_0.1.0_x64-setup.exe.",
      "Confirm Windows does not block install unexpectedly.",
      "Confirm Start Menu entry launches the app.",
      "Confirm the app opens with the bundled starter pet before importing anything.",
    ],
  },
  {
    title: "Runtime",
    items: [
      "Drag the pet and confirm the window follows the cursor.",
      "Double-click the pet and confirm an interaction animation plays.",
      "Use state buttons to test idle, runRight, runLeft, jump, play, sleep, and interact.",
      "Hide from the control panel, then restore from the tray icon.",
      "Move the window, click Reset, and confirm the pet returns to the default position.",
      "Move the window, use tray Reset Position, and confirm the pet returns to the default position.",
      "Quit from the tray menu.",
    ],
  },
  {
    title: "Pet Package",
    items: [
      "Import release/starter.petpkg.",
      "Confirm the active pet switches without restarting.",
      "Delete the active pet and confirm the app remains stable.",
      "Import the same .petpkg again and confirm replacement works.",
    ],
  },
  {
    title: "Startup And Persistence",
    items: [
      "Enable auto start.",
      "Restart Windows.",
      "Confirm MiraPet starts automatically.",
      "Confirm selected pet, window position, and scale persist.",
      "Disable auto start and confirm the setting persists.",
    ],
  },
  {
    title: "Support",
    items: [
      "Click Diagnose.",
      "Click Support.",
      "Click Data.",
      "Confirm logs/diagnostics.json exists.",
      "Confirm logs/mirapet-support-*.zip exists.",
      "Confirm diagnostics and support bundles do not include customer image bytes.",
    ],
  },
  {
    title: "Uninstall",
    items: [
      "Uninstall MiraPet from Windows Apps.",
      "Confirm the app executable is removed.",
      "Record whether %APPDATA% data remains; keep or remove by product policy.",
    ],
  },
];

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--tester") options.tester = argv[++index];
    else if (item === "--machine") options.machine = argv[++index];
    else if (item === "--out") options.out = argv[++index];
    else if (item === "--help" || item === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${item}`);
  }
  return options;
}

function printHelp() {
  console.log(`Create a Windows acceptance report template.

Usage:
  npm run acceptance:new -- --tester "Name" --machine "Clean Windows 11 VM"
`);
}

function readReleaseManifest() {
  const manifestPath = path.join(releaseDir, "release-manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error("Missing release/release-manifest.json. Run npm run release first.");
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
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

function renderReport(options, manifest) {
  const installer = manifest.files?.find((file) => file.name.endsWith("_x64-setup.exe"));
  const petpkg = manifest.files?.find((file) => file.name.endsWith(".petpkg"));
  const date = new Date().toISOString();
  const lines = [
    "# MiraPet Windows Acceptance Report",
    "",
    `Created: ${date}`,
    `Tester: ${options.tester ?? ""}`,
    `Machine: ${options.machine ?? os.hostname()}`,
    `OS: ${os.type()} ${os.release()} ${os.arch()}`,
    `Product: ${manifest.product ?? "MiraPet"}`,
    `Version: ${manifest.version ?? ""}`,
    "",
    "## Release Evidence",
    "",
    `- Installer: ${installer?.name ?? "missing"}`,
    `- Installer SHA-256: ${installer?.sha256 ?? "missing"}`,
    `- Starter package: ${petpkg?.name ?? "missing"}`,
    `- Starter package SHA-256: ${petpkg?.sha256 ?? "missing"}`,
    "",
    "## Result",
    "",
    "- [ ] Pass",
    "- [ ] Fail",
    "",
    "## Checklist",
    "",
  ];

  for (const section of sections) {
    lines.push(`### ${section.title}`, "");
    for (const item of section.items) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push("");
  }

  lines.push("## Issues", "", "- None recorded.", "", "## Notes", "", "- ");
  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const manifest = readReleaseManifest();
  const fileName = `${new Date().toISOString().slice(0, 10)}-${safeSlug(manifest.version ?? "version")}-windows-acceptance.md`;
  const outputPath = path.resolve(options.out ?? path.join(reportsDir, fileName));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, renderReport(options, manifest), "utf8");
  console.log(`Acceptance report written to ${outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(`create-acceptance-report: ${error.message}`);
  process.exitCode = 1;
}
