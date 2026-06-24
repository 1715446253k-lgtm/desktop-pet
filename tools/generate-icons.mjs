#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const root = process.cwd();
const tauriDir = path.join(root, "src-tauri");
const sourceIcon = path.join(tauriDir, "app-icon.png");

function iconSvg() {
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="160" y1="104" x2="864" y2="920" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fbfdff"/>
        <stop offset="0.48" stop-color="#dff7ff"/>
        <stop offset="1" stop-color="#c7f3df"/>
      </linearGradient>
      <linearGradient id="mark" x1="292" y1="230" x2="760" y2="802" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#1d4ed8"/>
        <stop offset="1" stop-color="#059669"/>
      </linearGradient>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="24" stdDeviation="30" flood-color="#0f172a" flood-opacity="0.20"/>
      </filter>
    </defs>
    <rect width="1024" height="1024" rx="232" fill="url(#bg)"/>
    <path d="M512 150l62 123c12 23 34 39 60 43l136 20c65 10 91 89 44 135l-99 96c-18 18-27 44-23 69l23 136c11 65-57 114-115 83l-121-64c-23-12-50-12-73 0l-121 64c-58 31-126-18-115-83l23-136c4-25-5-51-23-69l-99-96c-47-46-21-125 44-135l136-20c26-4 48-20 60-43l62-123c29-59 113-59 142 0z" fill="#ffffff" filter="url(#softShadow)"/>
    <path d="M512 196l51 102c20 39 57 66 100 72l113 17c23 3 32 31 15 47l-82 80c-31 30-45 74-38 116l19 113c4 23-20 40-40 29l-101-53c-38-20-84-20-122 0l-101 53c-20 11-44-6-40-29l19-113c7-42-7-86-38-116l-82-80c-17-16-8-44 15-47l113-17c43-6 80-33 100-72l51-102c10-21 40-21 50 0z" fill="url(#mark)"/>
    <circle cx="512" cy="510" r="202" fill="#ffffff"/>
    <path d="M372 422l-54-94c-9-16 6-34 23-28l105 38" fill="#ffffff" stroke="#172033" stroke-width="34" stroke-linejoin="round"/>
    <path d="M652 422l54-94c9-16-6-34-23-28l-105 38" fill="#ffffff" stroke="#172033" stroke-width="34" stroke-linejoin="round"/>
    <circle cx="438" cy="500" r="28" fill="#172033"/>
    <circle cx="586" cy="500" r="28" fill="#172033"/>
    <path d="M468 594c27 32 62 32 88 0" fill="none" stroke="#172033" stroke-width="30" stroke-linecap="round"/>
    <circle cx="382" cy="574" r="24" fill="#fda4af" opacity="0.80"/>
    <circle cx="642" cy="574" r="24" fill="#fda4af" opacity="0.80"/>
  </svg>`;
}

async function main() {
  await fs.promises.mkdir(tauriDir, { recursive: true });
  await sharp(Buffer.from(iconSvg()))
    .resize(1024, 1024, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(sourceIcon);

  const executable = process.platform === "win32" ? "cmd.exe" : "npx";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npx", "tauri", "icon", sourceIcon]
      : ["tauri", "icon", sourceIcon];
  execFileSync(executable, args, { cwd: root, stdio: "inherit" });
  await fs.promises.rm(path.join(tauriDir, "icons", "android"), { recursive: true, force: true });
  await fs.promises.rm(path.join(tauriDir, "icons", "ios"), { recursive: true, force: true });
  console.log(`Generated MiraPet icons from ${sourceIcon}`);
}

await main().catch((error) => {
  console.error(`generate-icons: ${error.message}`);
  process.exitCode = 1;
});
