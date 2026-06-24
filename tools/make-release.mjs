#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const releaseDir = path.join(root, "release");
const brand = JSON.parse(fs.readFileSync(path.join(root, "brand.config.json"), "utf8"));
const installerFileName = brand.installerBaseName ?? `${brand.productName}_${brand.version}_x64-setup.exe`;
const installerPath = path.join(
  root,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "nsis",
  installerFileName,
);
const debugInstallerPath = path.join(
  root,
  "src-tauri",
  "target",
  "debug",
  "bundle",
  "nsis",
  installerFileName,
);

function run(command, args) {
  const executable = process.platform === "win32" && command === "npm" ? "cmd.exe" : command;
  const finalArgs = process.platform === "win32" && command === "npm" ? ["/d", "/s", "/c", "npm", ...args] : args;
  execFileSync(executable, finalArgs, {
    cwd: root,
    stdio: "inherit",
  });
}

function copyRequired(source, target) {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing release source: ${source}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function signInstallerIfConfigured(installerPath) {
  const signtool = process.env.SIGNTOOL_PATH;
  if (!signtool) return false;
  if (!fs.existsSync(signtool)) {
    throw new Error(`SIGNTOOL_PATH does not exist: ${signtool}`);
  }

  const args = ["sign", "/fd", "SHA256", "/tr", process.env.TIMESTAMP_URL ?? "http://timestamp.digicert.com", "/td", "SHA256"];
  if (process.env.CERT_THUMBPRINT) {
    args.push("/sha1", process.env.CERT_THUMBPRINT);
  } else if (process.env.PFX_PATH) {
    args.push("/f", process.env.PFX_PATH);
    if (process.env.PFX_PASSWORD) args.push("/p", process.env.PFX_PASSWORD);
  } else {
    throw new Error("Set CERT_THUMBPRINT or PFX_PATH when SIGNTOOL_PATH is provided.");
  }
  args.push(installerPath);
  execFileSync(signtool, args, { cwd: root, stdio: "inherit" });
  return true;
}

function fileRecord(filePath) {
  const buffer = fs.readFileSync(filePath);
  return {
    name: path.basename(filePath),
    bytes: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

function writeReleaseManifest(installerSource, signed) {
  const releaseFiles = [
    path.join(releaseDir, path.basename(installerSource)),
    path.join(releaseDir, "starter.petpkg"),
    path.join(releaseDir, "starter-contact-sheet.png"),
    path.join(releaseDir, "starter-report.json"),
  ];
  const manifest = {
    product: brand.productName,
    version: brand.version,
    createdAt: new Date().toISOString(),
    files: releaseFiles.map(fileRecord),
    checks: [
      "npm run lint",
      "npm run build",
      "npm run petpack -- validate sample-pets/starter",
      "npm run petpack -- build sample-pets/starter --out dist/starter.petpkg",
      "npm run tauri:build",
      "npm run petpack -- check-package dist/starter.petpkg",
    ],
    notes: [
      signed ? "Installer was signed during release." : "Installer is not code-signed yet.",
      "Run clean Windows install smoke test before paid customer delivery.",
      "Run npm run verify:signing after signing or after downloading a signed installer.",
    ],
  };
  fs.writeFileSync(path.join(releaseDir, "release-manifest.json"), JSON.stringify(manifest, null, 2));
}

async function main() {
  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.mkdirSync(releaseDir, { recursive: true });

  run("npm", ["run", "brand:sync"]);
  run("npm", ["run", "lint"]);
  run("npm", ["run", "build"]);
  run("npm", ["run", "petpack", "--", "validate", "sample-pets/starter"]);
  run("npm", ["run", "petpack", "--", "build", "sample-pets/starter", "--out", "dist/starter.petpkg"]);
  run("npm", ["run", "preflight", "--", "--skip-release"]);
  run("npm", ["run", "tauri:build"]);
  run("npm", ["run", "petpack", "--", "build", "sample-pets/starter", "--out", "dist/starter.petpkg"]);
  run("npm", ["run", "petpack", "--", "check-package", "dist/starter.petpkg"]);

  const installerSource = fs.existsSync(installerPath) ? installerPath : debugInstallerPath;
  copyRequired(installerSource, path.join(releaseDir, path.basename(installerSource)));
  copyRequired(path.join(root, "dist", "starter.petpkg"), path.join(releaseDir, "starter.petpkg"));
  copyRequired(
    path.join(root, "dist", "starter.package", "contact-sheet.png"),
    path.join(releaseDir, "starter-contact-sheet.png"),
  );
  copyRequired(
    path.join(root, "dist", "starter.package", "report.json"),
    path.join(releaseDir, "starter-report.json"),
  );
  const releaseInstallerPath = path.join(releaseDir, path.basename(installerSource));
  const signed = signInstallerIfConfigured(releaseInstallerPath);
  writeReleaseManifest(installerSource, signed);
  run("npm", ["run", "verify:release"]);
  run("npm", ["run", "preflight"]);

  console.log(`Release files written to ${releaseDir}`);
}

main().catch((error) => {
  console.error(`make-release: ${error.message}`);
  process.exitCode = 1;
});
