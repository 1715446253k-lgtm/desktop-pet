#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import AdmZip from "adm-zip";

const root = process.cwd();
const releaseDir = path.join(root, "release");
const deliveriesDir = path.join(root, "deliveries");
const acceptanceDir = path.join(root, "acceptance-reports");
const outputDir = path.join(root, "readiness");

function parseArgs(argv) {
  const options = { strict: false };
  for (const item of argv) {
    if (item === "--strict") options.strict = true;
    else if (item === "--help" || item === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${item}`);
  }
  return options;
}

function printHelp() {
  console.log(`Create a commercial readiness audit report.

Usage:
  npm run readiness
  npm run readiness -- --strict
`);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function checkFileRecord(baseDir, record) {
  const filePath = path.join(baseDir, record.name);
  if (!fs.existsSync(filePath)) return { ok: false, message: `Missing ${record.name}` };
  const buffer = fs.readFileSync(filePath);
  if (buffer.length !== record.bytes) {
    return { ok: false, message: `${record.name} size mismatch.` };
  }
  if (sha256(buffer) !== record.sha256) {
    return { ok: false, message: `${record.name} SHA-256 mismatch.` };
  }
  return { ok: true, message: `${record.name} verified.` };
}

function readSignature(installerPath) {
  if (process.platform !== "win32") return { Status: "Unknown", StatusMessage: "Authenticode check requires Windows." };
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$sig = Get-AuthenticodeSignature -LiteralPath ${JSON.stringify(installerPath)}`,
    "$cert = $sig.SignerCertificate",
    "$result = [ordered]@{}",
    "$result.Status = [string]$sig.Status",
    "$result.StatusMessage = [string]$sig.StatusMessage",
    "$result.Subject = if ($cert) { [string]$cert.Subject } else { '' }",
    "$result.Thumbprint = if ($cert) { [string]$cert.Thumbprint } else { '' }",
    "[pscustomobject]$result | ConvertTo-Json -Compress",
  ].join("\n");
  try {
    const output = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      cwd: root,
      encoding: "utf8",
    });
    return JSON.parse(output);
  } catch (error) {
    return { Status: "Error", StatusMessage: error.message };
  }
}

function item(id, title, status, evidence, required = true) {
  return { id, title, status, required, evidence };
}

function auditRelease() {
  const manifestPath = path.join(releaseDir, "release-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return [item("release.manifest", "Release manifest exists", "fail", "Missing release/release-manifest.json")];
  }
  const manifest = readJson(manifestPath);
  const results = [item("release.manifest", "Release manifest exists", "pass", manifestPath)];
  for (const record of manifest.files ?? []) {
    const check = checkFileRecord(releaseDir, record);
    results.push(item(`release.file.${record.name}`, `Release file ${record.name}`, check.ok ? "pass" : "fail", check.message));
  }
  const installer = manifest.files?.find((file) => file.name.endsWith("_x64-setup.exe"));
  if (installer) {
    const signature = readSignature(path.join(releaseDir, installer.name));
    results.push(
      item(
        "release.signing",
        "Installer is Authenticode signed",
        signature.Status === "Valid" ? "pass" : "blocker",
        `${signature.Status}: ${signature.StatusMessage}`,
      ),
    );
  }
  return results;
}

function latestReleaseManifest() {
  const manifestPath = path.join(releaseDir, "release-manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  return readJson(manifestPath);
}

function matchingReleaseRecord(releaseManifest, deliveryRecord) {
  if (!releaseManifest || !deliveryRecord) return null;
  return releaseManifest.files?.find((record) => record.name === deliveryRecord.name) ?? null;
}

function installNoteCompleteness(text) {
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
  return requiredSnippets.filter((snippet) => !text.includes(snippet));
}

function auditCustomerDelivery() {
  if (!fs.existsSync(deliveriesDir)) {
    return [item("delivery.exists", "Customer delivery exists", "fail", "Missing deliveries directory")];
  }
  const zips = fs.readdirSync(deliveriesDir).filter((name) => name.endsWith(".zip"));
  if (zips.length === 0) {
    return [item("delivery.archive", "Customer delivery archive exists", "fail", "No delivery zip found")];
  }
  const latestZip = zips.map((name) => path.join(deliveriesDir, name)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  const sidecar = `${latestZip}.sha256`;
  const results = [item("delivery.archive", "Customer delivery archive exists", "pass", latestZip)];
  if (!fs.existsSync(sidecar)) {
    results.push(item("delivery.checksum", "Customer delivery checksum exists", "fail", `Missing ${sidecar}`));
  } else {
    const expectedHash = fs.readFileSync(sidecar, "utf8").trim().split(/\s+/)[0];
    const actualHash = sha256(fs.readFileSync(latestZip));
    results.push(item("delivery.checksum", "Customer delivery checksum matches", expectedHash === actualHash ? "pass" : "fail", sidecar));
  }
  const zip = new AdmZip(latestZip);
  const entryMap = new Map(zip.getEntries().map((entry) => [entry.entryName.replaceAll("\\", "/"), entry]));
  const entries = new Set(entryMap.keys());
  for (const required of ["customer-manifest.json", "INSTALL.txt"]) {
    results.push(item(`delivery.zip.${required}`, `Archive contains ${required}`, entries.has(required) ? "pass" : "fail", latestZip));
  }
  const installEntry = entryMap.get("INSTALL.txt");
  if (installEntry) {
    const missingInstallNoteContent = installNoteCompleteness(installEntry.getData().toString("utf8"));
    results.push(
      item(
        "delivery.install-note.complete",
        "Install note covers install, reset, support, update, and uninstall",
        missingInstallNoteContent.length === 0 ? "pass" : "fail",
        missingInstallNoteContent.length === 0
          ? "INSTALL.txt contains the required customer handoff sections."
          : `INSTALL.txt missing: ${missingInstallNoteContent.join(", ")}`,
      ),
    );
  }
  const manifestEntry = entryMap.get("customer-manifest.json");
  if (manifestEntry) {
    const deliveryManifest = JSON.parse(manifestEntry.getData().toString("utf8"));
    const releaseManifest = latestReleaseManifest();
    for (const fileName of ["MiraPet_0.1.0_x64-setup.exe", "starter.petpkg"]) {
      const deliveryRecord = deliveryManifest.files?.find((record) => record.name === fileName);
      const releaseRecord = matchingReleaseRecord(releaseManifest, deliveryRecord);
      const matches =
        deliveryRecord &&
        releaseRecord &&
        deliveryRecord.bytes === releaseRecord.bytes &&
        deliveryRecord.sha256 === releaseRecord.sha256;
      results.push(
        item(
          `delivery.current.${fileName}`,
          `Delivery ${fileName} matches current release`,
          matches ? "pass" : "blocker",
          matches ? `${fileName} matches release-manifest.json.` : `${fileName} does not match current release-manifest.json.`,
        ),
      );
    }
  }
  return results;
}

function latestDeliveryZip() {
  if (!fs.existsSync(deliveriesDir)) return null;
  const zips = fs.readdirSync(deliveriesDir).filter((name) => name.endsWith(".zip"));
  if (zips.length === 0) return null;
  return zips.map((name) => path.join(deliveriesDir, name)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

function auditSellerHandoff() {
  const latestZip = latestDeliveryZip();
  if (!latestZip) {
    return [item("handoff.exists", "Seller handoff exists for latest delivery", "fail", "No delivery zip found")];
  }
  const zip = new AdmZip(latestZip);
  const manifestEntry = zip.getEntry("customer-manifest.json");
  if (!manifestEntry) {
    return [item("handoff.manifest", "Seller handoff can read latest delivery manifest", "fail", "Latest delivery zip has no customer-manifest.json")];
  }
  const manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
  const handoffName = `${safeSlug(manifest.order ?? "order")}-${safeSlug(manifest.customer ?? "customer")}-seller-handoff.md`;
  const handoffPath = path.join(deliveriesDir, handoffName);
  if (!fs.existsSync(handoffPath)) {
    return [item("handoff.exists", "Seller handoff exists for latest delivery", "fail", `Missing ${handoffPath}`)];
  }
  const text = fs.readFileSync(handoffPath, "utf8");
  const requiredText = [
    manifest.customer,
    manifest.order,
    manifest.archiveName ?? path.basename(latestZip),
    "Customer Message Checklist",
    "Internal Delivery Checks",
    "Support Scope To Confirm",
    "Final Send-Off",
    ...(manifest.files ?? []).map((file) => file.sha256),
  ].filter(Boolean);
  const missing = requiredText.filter((snippet) => !text.includes(snippet));
  return [
    item("handoff.exists", "Seller handoff exists for latest delivery", "pass", handoffPath),
    item(
      "handoff.complete",
      "Seller handoff includes delivery evidence and support checklist",
      missing.length === 0 ? "pass" : "fail",
      missing.length === 0 ? "Seller handoff contains customer, archive, file hashes, and support checklist." : `Seller handoff missing: ${missing.join(", ")}`,
    ),
  ];
}

function auditAcceptance() {
  if (!fs.existsSync(acceptanceDir)) {
    return [item("acceptance.report", "Windows acceptance report exists", "blocker", "Missing acceptance-reports directory")];
  }
  const reports = fs.readdirSync(acceptanceDir).filter((name) => name.endsWith(".md"));
  if (reports.length === 0) {
    return [item("acceptance.report", "Windows acceptance report exists", "blocker", "No acceptance report found")];
  }
  const latest = reports.map((name) => path.join(acceptanceDir, name)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  const text = fs.readFileSync(latest, "utf8");
  const releaseManifest = latestReleaseManifest();
  const releaseInstaller = releaseManifest?.files?.find((file) => file.name.endsWith("_x64-setup.exe"));
  const releasePetpkg = releaseManifest?.files?.find((file) => file.name.endsWith(".petpkg"));
  const reportInstallerSha = text.match(/^- Installer SHA-256: ([a-f0-9]+)$/im)?.[1] ?? "";
  const reportPetpkgSha = text.match(/^- Starter package SHA-256: ([a-f0-9]+)$/im)?.[1] ?? "";
  const installerMatches = Boolean(releaseInstaller?.sha256 && reportInstallerSha === releaseInstaller.sha256);
  const petpkgMatches = Boolean(releasePetpkg?.sha256 && reportPetpkgSha === releasePetpkg.sha256);
  const passChecked = /- \[x\] Pass/i.test(text);
  const uncheckedItems = (text.match(/- \[ \]/g) ?? []).length;
  return [
    item("acceptance.report", "Windows acceptance report exists", "pass", latest),
    item(
      "acceptance.current.installer",
      "Acceptance report installer SHA matches current release",
      installerMatches ? "pass" : "blocker",
      installerMatches ? "Installer SHA matches release-manifest.json." : "Installer SHA does not match current release-manifest.json.",
    ),
    item(
      "acceptance.current.petpkg",
      "Acceptance report starter package SHA matches current release",
      petpkgMatches ? "pass" : "blocker",
      petpkgMatches ? "Starter package SHA matches release-manifest.json." : "Starter package SHA does not match current release-manifest.json.",
    ),
    item(
      "acceptance.completed",
      "Windows acceptance report is completed and passing",
      passChecked && uncheckedItems === 0 ? "pass" : "blocker",
      passChecked ? `${uncheckedItems} unchecked item(s) remain.` : "Pass is not checked.",
    ),
  ];
}

function writeReports(results) {
  fs.mkdirSync(outputDir, { recursive: true });
  const summary = {
    createdAt: new Date().toISOString(),
    status: results.some((result) => result.status === "fail" || result.status === "blocker") ? "not-ready" : "ready",
    results,
  };
  const jsonPath = path.join(outputDir, "commercial-readiness-report.json");
  const mdPath = path.join(outputDir, "commercial-readiness-report.md");
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8");
  const lines = [
    "# MiraPet Commercial Readiness Report",
    "",
    `Created: ${summary.createdAt}`,
    `Status: ${summary.status}`,
    "",
    "| Status | Required | Check | Evidence |",
    "|---|---:|---|---|",
    ...results.map((result) => `| ${result.status} | ${result.required ? "yes" : "no"} | ${result.title} | ${String(result.evidence).replaceAll("|", "\\|")} |`),
    "",
  ];
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
  return { summary, jsonPath, mdPath };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const results = [...auditRelease(), ...auditCustomerDelivery(), ...auditSellerHandoff(), ...auditAcceptance()];
  const { summary, jsonPath, mdPath } = writeReports(results);
  console.log(`Readiness status: ${summary.status}`);
  console.log(`JSON report: ${jsonPath}`);
  console.log(`Markdown report: ${mdPath}`);
  for (const result of results) {
    console.log(`${result.status} ${result.id}: ${result.evidence}`);
  }
  if (options.strict && summary.status !== "ready") {
    throw new Error("Commercial readiness strict check failed.");
  }
}

try {
  main();
} catch (error) {
  console.error(`commercial-readiness: ${error.message}`);
  process.exitCode = 1;
}
