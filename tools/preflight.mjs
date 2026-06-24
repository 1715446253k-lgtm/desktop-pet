#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const errors = [];
const warnings = [];
const skipRelease = process.argv.includes("--skip-release");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.join(root, filePath), "utf8"));
}

function exists(filePath) {
  return fs.existsSync(path.join(root, filePath));
}

function error(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function run(command, args) {
  const executable = process.platform === "win32" && command === "npm" ? "cmd.exe" : command;
  const finalArgs = process.platform === "win32" && command === "npm" ? ["/d", "/s", "/c", "npm", ...args] : args;
  execFileSync(executable, finalArgs, { cwd: root, stdio: "inherit" });
}

function checkRequiredFiles() {
  [
    "brand.config.json",
    "LICENSE",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "CHANGELOG.md",
    ".github/workflows/ci.yml",
    "src-tauri/EULA.txt",
    "src-tauri/resources/default-pet/pet.json",
    "src-tauri/resources/default-pet/spritesheet.webp",
    "docs/commercial-delivery.md",
    "docs/windows-acceptance.md",
    "docs/legal-and-signing.md",
    "docs/branding.md",
    "docs/customer-operations.md",
    "docs/open-source-signing.md",
    "docs/signpath-application.md",
    "orders/example-order.json",
    "orders/example-production.md",
    "tools/order-gate-lib.mjs",
    "tools/verify-order-gate.mjs",
    "tools/test-order-gate.mjs",
    "tools/create-seller-handoff.mjs",
  ].forEach((file) => {
    if (!exists(file)) error(`Missing required file: ${file}`);
  });
}

function checkBrandSync() {
  const brand = readJson("brand.config.json");
  const packageJson = readJson("package.json");
  const tauri = readJson("src-tauri/tauri.conf.json");
  if (packageJson.license !== "MIT") error("package.json license must be MIT for the open-source runtime model.");
  if (packageJson.name !== brand.packageName) error("package.json name is not synced with brand.config.json.");
  if (packageJson.version !== brand.version) error("package.json version is not synced with brand.config.json.");
  if (packageJson.author !== brand.author) error("package.json author is not synced with brand.config.json.");
  if (tauri.productName !== brand.productName) error("tauri.conf.json productName is not synced with brand.config.json.");
  if (tauri.version !== brand.version) error("tauri.conf.json version is not synced with brand.config.json.");
  if (tauri.identifier !== brand.identifier) error("tauri.conf.json identifier is not synced with brand.config.json.");
  if (/example|changeme|your-/i.test(brand.productName)) warn("Product name still looks like a placeholder.");
  if (/example|changeme|your-/i.test(brand.identifier)) warn("Identifier still looks like a placeholder.");
}

function checkTauriConfig() {
  const tauri = readJson("src-tauri/tauri.conf.json");
  if (tauri.bundle?.licenseFile !== "EULA.txt") error("Tauri bundle licenseFile must be EULA.txt.");
  if (!tauri.bundle?.resources?.["resources/default-pet"]) error("Default pet resource is not bundled.");
  const window = tauri.app?.windows?.[0];
  if (!window?.transparent || window?.decorations !== false || !window?.alwaysOnTop) {
    error("Main window must remain transparent, decorationless, and always on top.");
  }
}

function checkReleaseManifest() {
  if (!exists("release/release-manifest.json")) {
    warn("release/release-manifest.json does not exist yet. Run npm run release.");
    return;
  }
  const manifest = readJson("release/release-manifest.json");
  const installer = manifest.files?.find((file) => file.name.endsWith("_x64-setup.exe"));
  const petpkg = manifest.files?.find((file) => file.name.endsWith(".petpkg"));
  if (!installer) error("Release manifest is missing installer record.");
  if (!petpkg) error("Release manifest is missing .petpkg record.");
  if (manifest.notes?.some((note) => note.includes("not code-signed"))) {
    warn("Release installer is not code-signed.");
  }
}

function checkDefaultPet() {
  if (!exists("src-tauri/resources/default-pet/pet.json")) return;
  const manifest = readJson("src-tauri/resources/default-pet/pet.json");
  if (manifest.schemaVersion !== 1) error("Default pet schemaVersion must be 1.");
  if (!manifest.states?.idle || !manifest.states?.runRight || !manifest.states?.runLeft) {
    error("Default pet must include idle, runRight, and runLeft states.");
  }
}

function main() {
  checkRequiredFiles();
  checkBrandSync();
  checkTauriConfig();
  checkDefaultPet();
  if (!skipRelease) checkReleaseManifest();

  if (!skipRelease && exists("release/starter.petpkg")) {
    run("npm", ["run", "petpack", "--", "check-package", "release/starter.petpkg"]);
  }
  run("npm", ["run", "test:petpack"]);
  run("npm", ["run", "test:order-gate"]);
  run("npm", ["run", "test:rust"]);
}

try {
  main();
} catch (caught) {
  error(caught.message);
}

warnings.forEach((message) => console.warn(`warn ${message}`));
errors.forEach((message) => console.error(`error ${message}`));

if (errors.length > 0) {
  console.error(`Preflight failed with ${errors.length} error(s).`);
  process.exitCode = 1;
} else {
  console.log(`Preflight passed with ${warnings.length} warning(s).`);
}
