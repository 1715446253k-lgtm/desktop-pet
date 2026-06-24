#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { ZipArchive } from "archiver";
import { assertOrderProductionReady, readOrderFile } from "./order-gate-lib.mjs";

const root = process.cwd();
const releaseDir = path.join(root, "release");
const deliveriesDir = path.join(root, "deliveries");
const brand = JSON.parse(fs.readFileSync(path.join(root, "brand.config.json"), "utf8"));

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--order-file") options.orderFile = argv[++index];
    else if (item === "--customer") options.customer = argv[++index];
    else if (item === "--petpkg") options.petpkg = argv[++index];
    else if (item === "--order") options.order = argv[++index];
    else if (item === "--notes") options.notes = argv[++index];
    else if (item === "--skip-order-gate") options.skipOrderGate = true;
    else if (item === "--help" || item === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${item}`);
  }
  return options;
}

function printHelp() {
  console.log(`Create a customer delivery folder.

Usage:
  npm run customer:delivery -- --customer "Customer Name" --petpkg dist/pet.petpkg [--order ORDER-001]
  npm run customer:delivery -- --order-file orders/customer-order.json

Options:
  --skip-order-gate  Allow demo/manual delivery without order production evidence.
`);
}

function resolveOptions(rawOptions) {
  const orderFile = rawOptions.orderFile ? readOrderFile(rawOptions.orderFile) : null;
  const fileOptions = orderFile?.order ?? {};
  return {
    customer: rawOptions.customer ?? fileOptions.customer,
    petpkg: rawOptions.petpkg ?? fileOptions.petpkg,
    order: rawOptions.order ?? fileOptions.order,
    notes: rawOptions.notes ?? fileOptions.notes,
    orderFilePath: orderFile?.orderFilePath,
    orderData: orderFile?.order ?? null,
    skipOrderGate: rawOptions.skipOrderGate ?? false,
  };
}

function run(command, args) {
  const executable = process.platform === "win32" && command === "npm" ? "cmd.exe" : command;
  const finalArgs = process.platform === "win32" && command === "npm" ? ["/d", "/s", "/c", "npm", ...args] : args;
  execFileSync(executable, finalArgs, { cwd: root, stdio: "inherit" });
}

function safeSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function copyRequired(source, target) {
  if (!fs.existsSync(source)) throw new Error(`Missing file: ${source}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function fileRecord(filePath) {
  const stat = fs.statSync(filePath);
  return {
    name: path.basename(filePath),
    bytes: stat.size,
    sha256: sha256(filePath),
  };
}

function writeInstallNote(targetDir, customer, installerName, petPackageName, notes) {
  const note = `${brand.productName} 安装说明 / Installation

客户 / Customer: ${customer}
${notes ? `备注 / Notes: ${notes}\n` : ""}

中文步骤：
1. 双击运行 ${installerName}。
2. 安装完成后，从开始菜单打开 ${brand.productName}。
3. 点击 Import。
4. 选择 ${petPackageName}。
5. 可通过托盘图标显示、隐藏或退出桌宠。
6. 如果桌宠跑到屏幕外，点击控制面板 Reset，或在托盘菜单选择 Reset Position。

售后排障：
1. 打开 ${brand.productName} 控制面板。
2. 点击 Support。
3. 点击 Data。
4. 发送最新的 logs/mirapet-support-*.zip。

更新说明：
1. 新版本会以新的安装包形式发送。
2. 关闭 ${brand.productName} 后运行新版安装包即可覆盖安装。
3. 已导入的宠物包通常会保留，但建议同时保留本次交付的 ${petPackageName} 作为备份。

卸载说明：
1. 在 Windows 设置的 Apps / Installed apps 中卸载 ${brand.productName}。
2. 卸载程序会移除应用本体；用户数据目录可能保留用于后续诊断或再次安装。
3. 如需彻底清除数据，请先联系售后确认数据目录位置。

English steps:
1. Run ${installerName}.
2. Open ${brand.productName} from the Start Menu.
3. Click Import.
4. Select ${petPackageName}.
5. Use the tray icon to show, hide, or quit the pet.
6. If the pet is off screen, click Reset in the control panel or choose Reset Position from the tray menu.

Support:
1. Open the ${brand.productName} control panel.
2. Click Support.
3. Click Data.
4. Send the newest logs/mirapet-support-*.zip.

Updates:
1. New versions are delivered as a new installer.
2. Quit ${brand.productName}, then run the new installer to upgrade in place.
3. Imported pets are normally preserved, but keep ${petPackageName} as a backup.

Uninstall:
1. Uninstall ${brand.productName} from Windows Settings > Apps > Installed apps.
2. The app is removed; user data may remain for diagnostics or future reinstall.
3. Contact support before manually deleting app data.
`;
  fs.writeFileSync(path.join(targetDir, "INSTALL.txt"), note, "utf8");
}

async function zipDirectory(inputDir, outputFile) {
  await fs.promises.mkdir(path.dirname(outputFile), { recursive: true });
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputFile);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(inputDir, false);
    archive.finalize();
  });
}

async function main() {
  const rawOptions = parseArgs(process.argv.slice(2));
  if (rawOptions.help) {
    printHelp();
    return;
  }
  const options = resolveOptions(rawOptions);
  if (!options.customer) throw new Error("Missing --customer.");
  if (!options.petpkg) throw new Error("Missing --petpkg.");

  if (options.orderFilePath && !options.skipOrderGate) {
    assertOrderProductionReady({ root, order: options.orderData, orderFilePath: options.orderFilePath });
  }

  run("npm", ["run", "verify:release"]);
  run("npm", ["run", "petpack", "--", "check-package", options.petpkg]);

  const releaseManifest = JSON.parse(fs.readFileSync(path.join(releaseDir, "release-manifest.json"), "utf8"));
  const installerRecord = releaseManifest.files.find((file) => file.name.endsWith("_x64-setup.exe"));
  if (!installerRecord) throw new Error("Release manifest does not contain installer.");

  const customerSlug = safeSlug(options.customer);
  const date = new Date().toISOString().slice(0, 10);
  const order = options.order ? safeSlug(options.order) : "order";
  const targetDir = path.join(deliveriesDir, `${date}-${order}-${customerSlug}`);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  const installerSource = path.join(releaseDir, installerRecord.name);
  const petSource = path.resolve(options.petpkg);
  const petTargetName = path.basename(petSource);
  copyRequired(installerSource, path.join(targetDir, installerRecord.name));
  copyRequired(petSource, path.join(targetDir, petTargetName));
  writeInstallNote(targetDir, options.customer, installerRecord.name, petTargetName, options.notes);

  const manifestFiles = [
    fileRecord(path.join(targetDir, installerRecord.name)),
    fileRecord(path.join(targetDir, petTargetName)),
    fileRecord(path.join(targetDir, "INSTALL.txt")),
  ];
  const manifest = {
    customer: options.customer,
    order: options.order ?? null,
    notes: options.notes ?? null,
    createdAt: new Date().toISOString(),
    appVersion: releaseManifest.version,
    files: manifestFiles,
    archiveName: `${path.basename(targetDir)}.zip`,
    sourceReleaseManifest: path.relative(targetDir, path.join(releaseDir, "release-manifest.json")),
  };
  fs.writeFileSync(path.join(targetDir, "customer-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  const archivePath = `${targetDir}.zip`;
  await zipDirectory(targetDir, archivePath);
  const archiveHash = sha256(archivePath);
  fs.writeFileSync(`${archivePath}.sha256`, `${archiveHash}  ${path.basename(archivePath)}\n`, "utf8");
  console.log(`Customer delivery written to ${targetDir}`);
  console.log(`Customer delivery archive written to ${archivePath}`);
}

try {
  await main();
} catch (error) {
  console.error(`make-customer-delivery: ${error.message}`);
  process.exitCode = 1;
}
