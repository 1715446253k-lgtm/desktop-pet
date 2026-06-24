#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const brandPath = path.join(root, "brand.config.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function requiredString(value, name) {
  if (!value || typeof value !== "string") throw new Error(`brand.config.json missing ${name}.`);
  return value;
}

function main() {
  const brand = readJson(brandPath);
  const productName = requiredString(brand.productName, "productName");
  const studioName = requiredString(brand.studioName, "studioName");
  const identifier = requiredString(brand.identifier, "identifier");
  const version = requiredString(brand.version, "version");

  const packageJsonPath = path.join(root, "package.json");
  const packageJson = readJson(packageJsonPath);
  packageJson.name = brand.packageName ?? packageJson.name;
  packageJson.version = version;
  packageJson.description = brand.description ?? packageJson.description;
  packageJson.author = brand.author ?? studioName;
  writeJson(packageJsonPath, packageJson);

  const tauriConfigPath = path.join(root, "src-tauri", "tauri.conf.json");
  const tauriConfig = readJson(tauriConfigPath);
  tauriConfig.productName = productName;
  tauriConfig.version = version;
  tauriConfig.identifier = identifier;
  tauriConfig.app.windows[0].title = productName;
  writeJson(tauriConfigPath, tauriConfig);

  const brandTs = `export const BRAND = {
  productName: ${JSON.stringify(productName)},
  studioName: ${JSON.stringify(studioName)},
  version: ${JSON.stringify(version)},
} as const;
`;
  fs.writeFileSync(path.join(root, "src", "brand.ts"), brandTs, "utf8");

  console.log(`Brand synced: ${productName} ${version}`);
}

try {
  main();
} catch (error) {
  console.error(`sync-brand: ${error.message}`);
  process.exitCode = 1;
}
