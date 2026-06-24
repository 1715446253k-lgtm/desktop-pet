#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import AdmZip from "adm-zip";
import { ZipArchive } from "archiver";
import sharp from "sharp";

const REQUIRED_STATES = [
  { dir: "idle", key: "idle", row: 0, defaultFrames: 6, fps: 6, loop: true },
  { dir: "run-right", key: "runRight", row: 1, defaultFrames: 8, fps: 12, loop: true },
  { dir: "run-left", key: "runLeft", row: 2, defaultFrames: 8, fps: 12, loop: true },
  { dir: "jump", key: "jump", row: 3, defaultFrames: 6, fps: 10, loop: false },
  { dir: "play", key: "play", row: 4, defaultFrames: 6, fps: 8, loop: false },
  { dir: "sleep", key: "sleep", row: 5, defaultFrames: 6, fps: 4, loop: true },
  { dir: "interact", key: "interact", row: 6, defaultFrames: 6, fps: 8, loop: false },
];

const DEFAULT_CELL_WIDTH = 192;
const DEFAULT_CELL_HEIGHT = 208;
const MAX_OPAQUE_RATIO = 0.82;
const MAX_EDGE_ALPHA_RATIO = 0.08;

function fail(message) {
  console.error(`petpack: ${message}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const [command, sourceDir, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (item === "--out") options.out = rest[++index];
    else if (item === "--cell-width") options.cellWidth = Number(rest[++index]);
    else if (item === "--cell-height") options.cellHeight = Number(rest[++index]);
    else if (item === "--help" || item === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${item}`);
  }
  return { command, sourceDir, options };
}

function printHelp() {
  console.log(`MiraPet package builder

Usage:
  npm run petpack -- validate <source-pet>
  npm run petpack -- build <source-pet> --out <dist/name.petpkg>
  npm run petpack -- check-package <dist/name.petpkg>

Required source layout:
  source-pet/
    pet.config.json
    idle/000.png ...
    run-right/000.png ...
    run-left/000.png ...
    jump/000.png ...
    play/000.png ...
    sleep/000.png ...
    interact/000.png ...
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertSafeId(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("pet.config.json id must use only letters, numbers, hyphen, or underscore.");
  }
}

function validateManifestShape(manifest) {
  if (manifest.schemaVersion !== 1) throw new Error("pet.json schemaVersion must be 1.");
  assertSafeId(String(manifest.id ?? ""));
  if (!manifest.displayName) throw new Error("pet.json displayName is required.");
  if (!Number.isInteger(manifest.cellWidth) || !Number.isInteger(manifest.cellHeight)) {
    throw new Error("pet.json cellWidth and cellHeight must be integers.");
  }
  if (manifest.sprite !== "spritesheet.webp") throw new Error("pet.json sprite must be spritesheet.webp.");
  if (!manifest.states || typeof manifest.states !== "object") throw new Error("pet.json states are required.");
  for (const state of REQUIRED_STATES) {
    const value = manifest.states[state.key];
    if (!value) throw new Error(`pet.json missing state ${state.key}.`);
    if (value.row !== state.row) throw new Error(`State ${state.key} must use row ${state.row}.`);
    if (!Number.isInteger(value.frames) || value.frames < 2) throw new Error(`State ${state.key} needs at least 2 frames.`);
    if (!Number.isFinite(value.fps) || value.fps <= 0) throw new Error(`State ${state.key} fps must be positive.`);
  }
}

async function inspectFrame(filePath) {
  const image = sharp(filePath).ensureAlpha();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Cannot inspect image size: ${filePath}`);
  }
  const stats = await image.stats();
  const alpha = stats.channels[3];
  const opaqueRatio = alpha ? alpha.sum / (255 * metadata.width * metadata.height) : 1;
  const alphaBuffer = await image
    .clone()
    .extractChannel("alpha")
    .raw()
    .toBuffer();
  const edgeAlphaRatio = measureEdgeAlphaRatio(alphaBuffer, metadata.width, metadata.height);
  return {
    width: metadata.width,
    height: metadata.height,
    hasAlpha: metadata.hasAlpha === true || metadata.channels === 4,
    opaqueRatio: Number(opaqueRatio.toFixed(4)),
    edgeAlphaRatio: Number(edgeAlphaRatio.toFixed(4)),
  };
}

function measureEdgeAlphaRatio(alphaBuffer, width, height) {
  let edgeAlpha = 0;
  let edgePixels = 0;

  for (let x = 0; x < width; x += 1) {
    edgeAlpha += alphaBuffer[x];
    edgeAlpha += alphaBuffer[(height - 1) * width + x];
    edgePixels += 2;
  }

  for (let y = 1; y < height - 1; y += 1) {
    edgeAlpha += alphaBuffer[y * width];
    edgeAlpha += alphaBuffer[y * width + width - 1];
    edgePixels += 2;
  }

  return edgePixels === 0 ? 0 : edgeAlpha / (255 * edgePixels);
}

async function trimAndFit(filePath, cellWidth, cellHeight) {
  const metadata = await sharp(filePath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Cannot inspect image size: ${filePath}`);
  }

  return sharp(filePath)
    .ensureAlpha()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .resize({
      width: cellWidth,
      height: cellHeight,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: false,
    })
    .extend({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

function listFrames(stateDir) {
  if (!fs.existsSync(stateDir)) return [];
  return fs
    .readdirSync(stateDir)
    .filter((name) => /^\d{3}\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(stateDir, name));
}

function assertContinuousFrames(files, stateDir) {
  files.forEach((file, index) => {
    const expected = `${String(index).padStart(3, "0")}.png`;
    if (path.basename(file).toLowerCase() !== expected) {
      throw new Error(`${stateDir} must use continuous frame names starting at 000.png.`);
    }
  });
}

async function loadSource(sourceDir, options = {}) {
  const root = path.resolve(sourceDir);
  const configPath = path.join(root, "pet.config.json");
  if (!fs.existsSync(configPath)) throw new Error("Missing pet.config.json.");

  const sourceConfig = readJson(configPath);
  const id = String(sourceConfig.id ?? "").trim();
  const displayName = String(sourceConfig.displayName ?? "").trim();
  assertSafeId(id);
  if (!displayName) throw new Error("pet.config.json displayName is required.");

  const cellWidth = Number(options.cellWidth || sourceConfig.cellWidth || DEFAULT_CELL_WIDTH);
  const cellHeight = Number(options.cellHeight || sourceConfig.cellHeight || DEFAULT_CELL_HEIGHT);
  if (!Number.isInteger(cellWidth) || !Number.isInteger(cellHeight) || cellWidth < 64 || cellHeight < 64) {
    throw new Error("cellWidth and cellHeight must be integers >= 64.");
  }

  const states = {};
  const framesByState = [];
  const frameReports = [];
  let maxFrames = 0;

  for (const state of REQUIRED_STATES) {
    const stateDir = path.join(root, state.dir);
    const files = listFrames(stateDir);
    if (files.length < 2) throw new Error(`${state.dir} requires at least 2 transparent PNG frames.`);
    assertContinuousFrames(files, state.dir);

    for (const file of files) {
      const frameReport = await inspectFrame(file);
      if (!frameReport.hasAlpha) {
        throw new Error(`${path.relative(root, file)} is not a transparent PNG with alpha channel.`);
      }
      if (frameReport.opaqueRatio < 0.01) {
        throw new Error(`${path.relative(root, file)} appears almost empty.`);
      }
      if (frameReport.opaqueRatio > MAX_OPAQUE_RATIO) {
        throw new Error(`${path.relative(root, file)} appears to contain an opaque background. Use real alpha transparency.`);
      }
      if (frameReport.edgeAlphaRatio > MAX_EDGE_ALPHA_RATIO) {
        throw new Error(`${path.relative(root, file)} has opaque pixels touching the canvas edge. Add transparent padding or fix cropped artwork.`);
      }
      frameReports.push({
        state: state.key,
        file: path.relative(root, file).replaceAll("\\", "/"),
        ...frameReport,
      });
    }

    const frameCount = files.length;
    maxFrames = Math.max(maxFrames, frameCount);
    states[state.key] = {
      row: state.row,
      frames: frameCount,
      fps: Number(sourceConfig.states?.[state.key]?.fps ?? state.fps),
      loop: Boolean(sourceConfig.states?.[state.key]?.loop ?? state.loop),
    };
    framesByState.push({ ...state, files });
  }

  return {
    root,
    config: sourceConfig,
    manifest: {
      schemaVersion: 1,
      id,
      displayName,
      cellWidth,
      cellHeight,
      sprite: "spritesheet.webp",
      defaultState: "idle",
      states,
    },
    framesByState,
    frameReports,
    maxFrames,
  };
}

async function composeSpritesheet(source, outputDir) {
  const { manifest, framesByState, maxFrames } = source;
  const sheetWidth = manifest.cellWidth * maxFrames;
  const sheetHeight = manifest.cellHeight * REQUIRED_STATES.length;
  const composites = [];

  for (const state of framesByState) {
    for (let frameIndex = 0; frameIndex < state.files.length; frameIndex += 1) {
      const input = await trimAndFit(state.files[frameIndex], manifest.cellWidth, manifest.cellHeight);
      composites.push({
        input,
        left: frameIndex * manifest.cellWidth,
        top: state.row * manifest.cellHeight,
      });
    }
  }

  const outputPath = path.join(outputDir, "spritesheet.webp");
  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .webp({ lossless: true, quality: 100 })
    .toFile(outputPath);

  return outputPath;
}

async function writePreview(source, outputDir) {
  const idle = source.framesByState.find((state) => state.key === "idle");
  const frame = idle?.files[0];
  if (!frame) return;
  await sharp(await trimAndFit(frame, source.manifest.cellWidth, source.manifest.cellHeight))
    .webp({ lossless: true })
    .toFile(path.join(outputDir, "preview.webp"));
}

async function writeContactSheet(source, outputDir) {
  const { manifest, framesByState, maxFrames } = source;
  const labelHeight = 28;
  const sheetWidth = manifest.cellWidth * maxFrames;
  const sheetHeight = (manifest.cellHeight + labelHeight) * REQUIRED_STATES.length;
  const composites = [];

  for (const state of framesByState) {
    const y = state.row * (manifest.cellHeight + labelHeight);
    const labelSvg = Buffer.from(`<svg width="${sheetWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#172033"/>
      <text x="10" y="19" font-family="Arial, sans-serif" font-size="14" fill="#ffffff">${state.key} (${state.files.length} frames)</text>
    </svg>`);
    composites.push({ input: labelSvg, left: 0, top: y });
    for (let frameIndex = 0; frameIndex < state.files.length; frameIndex += 1) {
      const input = await trimAndFit(state.files[frameIndex], manifest.cellWidth, manifest.cellHeight);
      composites.push({
        input,
        left: frameIndex * manifest.cellWidth,
        top: y + labelHeight,
      });
    }
  }

  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: { r: 241, g: 245, b: 249, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(outputDir, "contact-sheet.png"));
}

async function writeReport(source, outputDir, outputFile) {
  const now = new Date().toISOString();
  const report = {
    ok: true,
    generatedAt: now,
    packageFile: outputFile ? path.resolve(outputFile) : null,
    manifest: source.manifest,
    source: {
      root: source.root,
      maxFrames: source.maxFrames,
      frameCount: source.frameReports.length,
    },
    frames: source.frameReports,
    qaChecklist: [
      "Open contact-sheet.png and confirm identity consistency.",
      "Import the .petpkg into MiraPet before customer delivery.",
      "Check that no frame has text, background, detached effects, or cropped body parts.",
      "Check that opaqueRatio and edgeAlphaRatio are low enough to prove real transparent padding.",
    ],
  };
  await fs.promises.writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
}

async function zipDirectory(inputDir, outputFile) {
  await fs.promises.mkdir(path.dirname(outputFile), { recursive: true });
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputFile);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.file(path.join(inputDir, "pet.json"), { name: "pet.json" });
    archive.file(path.join(inputDir, "spritesheet.webp"), { name: "spritesheet.webp" });
    const previewPath = path.join(inputDir, "preview.webp");
    if (fs.existsSync(previewPath)) archive.file(previewPath, { name: "preview.webp" });
    const reportPath = path.join(inputDir, "report.json");
    if (fs.existsSync(reportPath)) archive.file(reportPath, { name: "report.json" });
    const contactSheetPath = path.join(inputDir, "contact-sheet.png");
    if (fs.existsSync(contactSheetPath)) archive.file(contactSheetPath, { name: "contact-sheet.png" });
    archive.finalize();
  });
}

async function inspectPackage(packagePath) {
  const resolved = path.resolve(packagePath);
  if (!fs.existsSync(resolved)) throw new Error(`Package not found: ${resolved}`);
  const zip = new AdmZip(resolved);
  const entries = new Map(zip.getEntries().map((entry) => [entry.entryName.replaceAll("\\", "/"), entry]));
  for (const file of ["pet.json", "spritesheet.webp"]) {
    if (!entries.has(file)) throw new Error(`Package missing ${file}.`);
  }
  const manifest = JSON.parse(entries.get("pet.json").getData().toString("utf8"));
  validateManifestShape(manifest);
  const spriteMetadata = await sharp(entries.get("spritesheet.webp").getData()).metadata();
  const maxFrames = Math.max(...REQUIRED_STATES.map((state) => manifest.states[state.key].frames));
  const expectedWidth = manifest.cellWidth * maxFrames;
  const expectedHeight = manifest.cellHeight * REQUIRED_STATES.length;
  if (spriteMetadata.width !== expectedWidth || spriteMetadata.height !== expectedHeight) {
    throw new Error(`spritesheet.webp must be ${expectedWidth}x${expectedHeight}, got ${spriteMetadata.width}x${spriteMetadata.height}.`);
  }
  console.log(`Valid pet package: ${manifest.displayName}`);
  console.log(`Package: ${resolved}`);
  console.log(`Sprite: ${spriteMetadata.width}x${spriteMetadata.height}`);
  console.log(`States: ${Object.keys(manifest.states).join(", ")}`);
}

async function validate(sourceDir, options) {
  const source = await loadSource(sourceDir, options);
  console.log(`Valid pet source: ${source.manifest.displayName}`);
  console.log(`States: ${Object.keys(source.manifest.states).join(", ")}`);
  console.log(`Cell: ${source.manifest.cellWidth}x${source.manifest.cellHeight}`);
  console.log(`Max frames: ${source.maxFrames}`);
}

async function build(sourceDir, options) {
  if (!options.out) throw new Error("Missing --out <file.petpkg>.");
  const source = await loadSource(sourceDir, options);
  const outPath = path.resolve(options.out);
  const workDir = path.join(path.dirname(outPath), `${source.manifest.id}.package`);

  await fs.promises.rm(workDir, { recursive: true, force: true });
  await fs.promises.mkdir(workDir, { recursive: true });
  await composeSpritesheet(source, workDir);
  await writePreview(source, workDir);
  await writeContactSheet(source, workDir);
  await fs.promises.writeFile(
    path.join(workDir, "pet.json"),
    JSON.stringify(source.manifest, null, 2),
    "utf8",
  );
  await writeReport(source, workDir, outPath);
  await zipDirectory(workDir, outPath);
  console.log(`Built ${outPath}`);
  console.log(`QA report: ${path.join(workDir, "report.json")}`);
  console.log(`Contact sheet: ${path.join(workDir, "contact-sheet.png")}`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (process.env.PETPACK_DEBUG_ARGS === "1") {
    console.log(JSON.stringify({ argv }));
  }
  const { command, sourceDir, options } = parseArgs(argv);
  if (!command || options.help) {
    printHelp();
    return;
  }
  if (!sourceDir) throw new Error("Missing source directory or package file.");
  if (command === "validate") await validate(sourceDir, options);
  else if (command === "build") await build(sourceDir, options);
  else if (command === "check-package") await inspectPackage(sourceDir);
  else throw new Error(`Unknown command: ${command}`);
}

await main().catch((error) => fail(error.message));

