#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import AdmZip from "adm-zip";

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function readJsonBuffer(buffer, label) {
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error.message}`);
  }
}

function verifyManifestShape(manifest) {
  if (!manifest.customer) throw new Error("customer-manifest.json missing customer.");
  if (!manifest.appVersion) throw new Error("customer-manifest.json missing appVersion.");
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("customer-manifest.json must contain a non-empty files array.");
  }
  for (const record of manifest.files) {
    if (!record.name || !Number.isInteger(record.bytes) || !record.sha256) {
      throw new Error("customer-manifest.json contains an invalid file record.");
    }
    if (record.name.includes("/") || record.name.includes("\\") || record.name.includes("..")) {
      throw new Error(`Unsafe file record name: ${record.name}`);
    }
  }
}

function verifyInstallNoteText(text) {
  const requiredSnippets = [
    "中文步骤",
    "English steps",
    "Import",
    "Reset Position",
    "Support",
    "更新说明",
    "Updates",
    "卸载说明",
    "Uninstall",
    "mirapet-support-*.zip",
  ];
  const missing = requiredSnippets.filter((snippet) => !text.includes(snippet));
  if (missing.length > 0) {
    throw new Error(`INSTALL.txt missing required content: ${missing.join(", ")}`);
  }
}

function verifyDirectory(targetDir) {
  const manifestPath = path.join(targetDir, "customer-manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`Missing ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  verifyManifestShape(manifest);

  for (const record of manifest.files) {
    const filePath = path.join(targetDir, record.name);
    if (!fs.existsSync(filePath)) throw new Error(`Missing delivery file: ${record.name}`);
    const stat = fs.statSync(filePath);
    if (stat.size !== record.bytes) {
      throw new Error(`${record.name} size mismatch: expected ${record.bytes}, got ${stat.size}`);
    }
    const actualSha = sha256File(filePath);
    if (actualSha !== record.sha256) throw new Error(`${record.name} sha256 mismatch.`);
    if (record.name === "INSTALL.txt") verifyInstallNoteText(fs.readFileSync(filePath, "utf8"));
    console.log(`ok ${record.name} ${record.bytes} ${actualSha}`);
  }

  const archiveName = manifest.archiveName ?? `${path.basename(targetDir)}.zip`;
  const archivePath = path.join(path.dirname(targetDir), archiveName);
  if (fs.existsSync(archivePath)) verifyArchive(archivePath, { skipSidecar: false });
  return manifest;
}

function verifyArchive(archivePath, options = {}) {
  if (!fs.existsSync(archivePath)) throw new Error(`Missing archive: ${archivePath}`);
  if (!options.skipSidecar) {
    const sidecarPath = `${archivePath}.sha256`;
    if (!fs.existsSync(sidecarPath)) throw new Error(`Missing archive checksum: ${sidecarPath}`);
    const expectedHash = fs.readFileSync(sidecarPath, "utf8").trim().split(/\s+/)[0];
    const actualHash = sha256File(archivePath);
    if (actualHash !== expectedHash) throw new Error(`${path.basename(archivePath)} sha256 mismatch.`);
    console.log(`ok ${path.basename(archivePath)} ${fs.statSync(archivePath).size} ${actualHash}`);
  }

  const zip = new AdmZip(archivePath);
  const entries = new Map(zip.getEntries().map((entry) => [entry.entryName.replaceAll("\\", "/"), entry]));
  const manifestEntry = entries.get("customer-manifest.json");
  if (!manifestEntry) throw new Error("Archive missing customer-manifest.json.");
  const manifest = readJsonBuffer(manifestEntry.getData(), "customer-manifest.json");
  verifyManifestShape(manifest);

  for (const record of manifest.files) {
    const entry = entries.get(record.name);
    if (!entry) throw new Error(`Archive missing ${record.name}.`);
    const data = entry.getData();
    if (data.length !== record.bytes) {
      throw new Error(`Archive ${record.name} size mismatch: expected ${record.bytes}, got ${data.length}`);
    }
    const actualSha = sha256Buffer(data);
    if (actualSha !== record.sha256) throw new Error(`Archive ${record.name} sha256 mismatch.`);
    if (record.name === "INSTALL.txt") verifyInstallNoteText(data.toString("utf8"));
    console.log(`ok archive:${record.name} ${record.bytes} ${actualSha}`);
  }
  return manifest;
}

function printHelp() {
  console.log(`Verify a customer delivery folder or archive.

Usage:
  npm run verify:customer -- deliveries/YYYY-MM-DD-order-customer
  npm run verify:customer -- deliveries/YYYY-MM-DD-order-customer.zip
`);
}

function main() {
  const target = process.argv[2];
  if (!target || target === "--help" || target === "-h") {
    printHelp();
    return;
  }
  const resolved = path.resolve(target);
  const stat = fs.existsSync(resolved) ? fs.statSync(resolved) : null;
  if (!stat) throw new Error(`Path not found: ${resolved}`);
  if (stat.isDirectory()) verifyDirectory(resolved);
  else if (resolved.toLowerCase().endsWith(".zip")) verifyArchive(resolved);
  else throw new Error("Target must be a delivery directory or .zip archive.");
  console.log("Customer delivery verification passed.");
}

try {
  main();
} catch (error) {
  console.error(`verify-customer-delivery: ${error.message}`);
  process.exitCode = 1;
}
