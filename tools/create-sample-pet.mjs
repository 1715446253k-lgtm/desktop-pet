#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve("sample-pets/starter");
const states = [
  ["idle", 6],
  ["run-right", 8],
  ["run-left", 8],
  ["jump", 6],
  ["play", 6],
  ["sleep", 6],
  ["interact", 6],
];

await fs.promises.rm(root, { recursive: true, force: true });
await fs.promises.mkdir(root, { recursive: true });
await fs.promises.writeFile(
  path.join(root, "pet.config.json"),
  JSON.stringify(
    {
      id: "starter",
      displayName: "Starter Pet",
      cellWidth: 192,
      cellHeight: 208,
    },
    null,
    2,
  ),
);

function svg(state, index, count) {
  const t = index / Math.max(1, count - 1);
  const bob = Math.sin(t * Math.PI * 2) * 8;
  const x =
    state === "run-right" ? 64 + t * 26 : state === "run-left" ? 90 - t * 26 : 76;
  const y = state === "jump" ? 84 - Math.sin(t * Math.PI) * 34 : 92 + bob;
  const eye = state === "sleep" ? '<path d="M74 92h12M108 92h12" stroke="#172033" stroke-width="4" stroke-linecap="round"/>' : '<circle cx="82" cy="92" r="5" fill="#172033"/><circle cx="112" cy="92" r="5" fill="#172033"/>';
  const arm =
    state === "interact" || state === "play"
      ? `<path d="M122 ${116 - bob}q28 -18 18 -42" stroke="#2563eb" stroke-width="11" fill="none" stroke-linecap="round"/>`
      : `<path d="M124 ${120 - bob}q18 12 24 30" stroke="#2563eb" stroke-width="11" fill="none" stroke-linecap="round"/>`;
  return `<svg width="320" height="320" viewBox="0 0 192 208" xmlns="http://www.w3.org/2000/svg">
    <rect width="192" height="208" fill="none"/>
    <ellipse cx="${x + 20}" cy="${y + 42}" rx="42" ry="50" fill="#f8fafc" stroke="#2563eb" stroke-width="7"/>
    <circle cx="${x + 20}" cy="${y}" r="43" fill="#ffffff" stroke="#2563eb" stroke-width="7"/>
    <path d="M${x - 6} ${y - 34}l-13 -24l26 10z" fill="#ffffff" stroke="#2563eb" stroke-width="7" stroke-linejoin="round"/>
    <path d="M${x + 47} ${y - 34}l13 -24l-26 10z" fill="#ffffff" stroke="#2563eb" stroke-width="7" stroke-linejoin="round"/>
    ${arm}
    ${eye.replaceAll("82", String(x + 6)).replaceAll("112", String(x + 36))}
    <path d="M${x + 18} ${y + 104}v28M${x + 46} ${y + 104}v28" stroke="#2563eb" stroke-width="12" stroke-linecap="round"/>
    <path d="M${x + 12} ${y + 112}q8 8 18 0" stroke="#172033" stroke-width="4" fill="none" stroke-linecap="round"/>
  </svg>`;
}

for (const [state, count] of states) {
  const dir = path.join(root, state);
  await fs.promises.mkdir(dir, { recursive: true });
  for (let index = 0; index < count; index += 1) {
    await sharp(Buffer.from(svg(state, index, count)))
      .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(dir, `${String(index).padStart(3, "0")}.png`));
  }
}

console.log(`Created ${root}`);
