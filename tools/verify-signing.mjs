#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const releaseDir = path.join(root, "release");

function parseArgs(argv) {
  const options = { allowUnsigned: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--installer") options.installer = argv[++index];
    else if (item === "--allow-unsigned") options.allowUnsigned = true;
    else if (item === "--help" || item === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${item}`);
  }
  return options;
}

function printHelp() {
  console.log(`Verify Windows Authenticode signature status.

Usage:
  npm run verify:signing
  npm run verify:signing -- --allow-unsigned
  npm run verify:signing -- --installer release/MiraPet_0.1.0_x64-setup.exe
`);
}

function defaultInstallerPath() {
  const manifestPath = path.join(releaseDir, "release-manifest.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const installer = manifest.files?.find((file) => file.name.endsWith("_x64-setup.exe"));
    if (installer) return path.join(releaseDir, installer.name);
  }
  const candidates = fs
    .readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith("_x64-setup.exe"))
    .map((entry) => path.join(releaseDir, entry.name));
  if (candidates.length === 1) return candidates[0];
  throw new Error("Cannot resolve installer. Pass --installer <path>.");
}

function readSignature(installerPath) {
  if (process.platform !== "win32") {
    throw new Error("Authenticode verification requires Windows PowerShell.");
  }
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$sig = Get-AuthenticodeSignature -LiteralPath ${JSON.stringify(installerPath)}`,
    "$cert = $sig.SignerCertificate",
    "$result = [ordered]@{}",
    "$result.Status = [string]$sig.Status",
    "$result.StatusMessage = [string]$sig.StatusMessage",
    "$result.Subject = if ($cert) { [string]$cert.Subject } else { '' }",
    "$result.Issuer = if ($cert) { [string]$cert.Issuer } else { '' }",
    "$result.NotBefore = if ($cert) { $cert.NotBefore.ToString('o') } else { '' }",
    "$result.NotAfter = if ($cert) { $cert.NotAfter.ToString('o') } else { '' }",
    "$result.Thumbprint = if ($cert) { [string]$cert.Thumbprint } else { '' }",
    "[pscustomobject]$result | ConvertTo-Json -Compress",
  ].join("\n");
  const output = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    cwd: root,
    encoding: "utf8",
  });
  return JSON.parse(output);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const installerPath = path.resolve(options.installer ?? defaultInstallerPath());
  if (!fs.existsSync(installerPath)) throw new Error(`Installer not found: ${installerPath}`);
  const signature = readSignature(installerPath);
  console.log(JSON.stringify({ installer: installerPath, signature }, null, 2));
  if (signature.Status !== "Valid") {
    const message = `Installer signature is ${signature.Status}: ${signature.StatusMessage}`;
    if (options.allowUnsigned) {
      console.warn(`warn ${message}`);
      return;
    }
    throw new Error(message);
  }
  console.log("Signing verification passed.");
}

try {
  main();
} catch (error) {
  console.error(`verify-signing: ${error.message}`);
  process.exitCode = 1;
}
