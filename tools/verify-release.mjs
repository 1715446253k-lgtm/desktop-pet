#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const releaseDir = path.join(root, "release");
const manifestPath = path.join(releaseDir, "release-manifest.json");

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function verify() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("release-manifest.json must contain a non-empty files array.");
  }

  for (const record of manifest.files) {
    const filePath = path.join(releaseDir, record.name);
    if (!fs.existsSync(filePath)) throw new Error(`Missing release file: ${record.name}`);
    const stat = fs.statSync(filePath);
    if (stat.size !== record.bytes) {
      throw new Error(`${record.name} size mismatch: expected ${record.bytes}, got ${stat.size}`);
    }
    const actualSha = sha256(filePath);
    if (actualSha !== record.sha256) {
      throw new Error(`${record.name} sha256 mismatch.`);
    }
    console.log(`ok ${record.name} ${record.bytes} ${actualSha}`);
  }
}

try {
  verify();
  console.log("Release verification passed.");
} catch (error) {
  console.error(`verify-release: ${error.message}`);
  process.exitCode = 1;
}
