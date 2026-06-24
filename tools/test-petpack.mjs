#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const root = process.cwd();
const tempRoot = path.join(root, "tmp", "petpack-regression");
const states = [
  ["idle", 2],
  ["run-right", 2],
  ["run-left", 2],
  ["jump", 2],
  ["play", 2],
  ["sleep", 2],
  ["interact", 2],
];

function runPetpack(args, options = {}) {
  const executable = process.platform === "win32" ? "cmd.exe" : "node";
  const finalArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "node", "tools/petpack.mjs", ...args]
      : ["tools/petpack.mjs", ...args];
  return execFileSync(executable, finalArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

async function writeConfig(sourceDir, id) {
  await fs.promises.mkdir(sourceDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(sourceDir, "pet.config.json"),
    JSON.stringify(
      {
        id,
        displayName: id,
        cellWidth: 192,
        cellHeight: 208,
      },
      null,
      2,
    ),
    "utf8",
  );
}

function transparentFrameSvg(index) {
  const x = 78 + index * 8;
  return `<svg width="192" height="208" viewBox="0 0 192 208" xmlns="http://www.w3.org/2000/svg">
    <rect width="192" height="208" fill="none"/>
    <circle cx="${x}" cy="82" r="34" fill="#ffffff" stroke="#2563eb" stroke-width="7"/>
    <ellipse cx="${x}" cy="130" rx="38" ry="46" fill="#f8fafc" stroke="#2563eb" stroke-width="7"/>
    <circle cx="${x - 10}" cy="78" r="5" fill="#172033"/>
    <circle cx="${x + 12}" cy="78" r="5" fill="#172033"/>
  </svg>`;
}

async function writeTransparentFrames(sourceDir) {
  for (const [state, count] of states) {
    const stateDir = path.join(sourceDir, state);
    await fs.promises.mkdir(stateDir, { recursive: true });
    for (let index = 0; index < count; index += 1) {
      await sharp(Buffer.from(transparentFrameSvg(index)))
        .resize(256, 256, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(path.join(stateDir, `${String(index).padStart(3, "0")}.png`));
    }
  }
}

async function writeOpaqueFrames(sourceDir) {
  for (const [state, count] of states) {
    const stateDir = path.join(sourceDir, state);
    await fs.promises.mkdir(stateDir, { recursive: true });
    for (let index = 0; index < count; index += 1) {
      await sharp({
        create: {
          width: 256,
          height: 256,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      })
        .png()
        .toFile(path.join(stateDir, `${String(index).padStart(3, "0")}.png`));
    }
  }
}

async function main() {
  await fs.promises.rm(tempRoot, { recursive: true, force: true });
  const goodSource = path.join(tempRoot, "good");
  const badSource = path.join(tempRoot, "bad-opaque");
  const goodPackage = path.join(tempRoot, "good.petpkg");

  await writeConfig(goodSource, "good_pet");
  await writeTransparentFrames(goodSource);
  runPetpack(["validate", goodSource]);
  runPetpack(["build", goodSource, "--out", goodPackage]);
  runPetpack(["check-package", goodPackage]);

  await writeConfig(badSource, "bad_pet");
  await writeOpaqueFrames(badSource);
  try {
    runPetpack(["validate", badSource], { capture: true });
    throw new Error("Opaque-background source unexpectedly passed validation.");
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    if (!output.includes("appears to contain an opaque background")) {
      throw new Error(`Opaque-background validation failed for the wrong reason:\n${output}`);
    }
  }

  console.log("Petpack regression tests passed.");
}

try {
  await main();
} finally {
  await fs.promises.rm(tempRoot, { recursive: true, force: true });
}
