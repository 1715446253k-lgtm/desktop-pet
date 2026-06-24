#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const tempRoot = path.join(root, "tmp", "order-gate-regression");

function runOrderVerify(args, options = {}) {
  const executable = process.platform === "win32" ? "cmd.exe" : "node";
  const finalArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "node", "tools/verify-order-gate.mjs", ...args]
      : ["tools/verify-order-gate.mjs", ...args];
  return execFileSync(executable, finalArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

async function writeText(filePath, text) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, text, "utf8");
}

async function writeJson(filePath, data) {
  await writeText(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function checklist(checked) {
  const marker = checked ? "x" : " ";
  return `# Test Order Production

## Inputs

- [${marker}] Customer owns or has permission to use the character/person/pet reference.
- [${marker}] Support scope, update policy, and rework boundary have been sent to the customer.

## Acceptance

- [${marker}] Review \`tmp/order-gate-regression/contact-sheet.png\`.
- [${marker}] Customer asset rights confirmation is retained with the order record.
- [${marker}] Import \`tmp/order-gate-regression/test.petpkg\` into MiraPet.
- [${marker}] Test drag movement, double-click interaction, sleep, play, jump, and idle.
`;
}

async function writeGoodOrder() {
  await writeText(path.join(tempRoot, "contact-sheet.png"), "placeholder contact sheet");
  await writeJson(path.join(tempRoot, "report.json"), { ok: true });
  await writeText(path.join(tempRoot, "PRODUCTION.md"), checklist(true));
  await writeJson(path.join(tempRoot, "good-order.json"), {
    order: "TEST-OK",
    customer: "Gate Test",
    petpkg: "tmp/order-gate-regression/test.petpkg",
    rightsConfirmed: true,
    supportScopeConfirmed: true,
    evidence: {
      contactSheet: "tmp/order-gate-regression/contact-sheet.png",
      report: "tmp/order-gate-regression/report.json",
      productionChecklist: "tmp/order-gate-regression/PRODUCTION.md",
    },
  });
}

async function writeBadOrder() {
  await writeText(path.join(tempRoot, "BAD-PRODUCTION.md"), checklist(false));
  await writeJson(path.join(tempRoot, "bad-order.json"), {
    order: "TEST-BAD",
    customer: "Gate Test",
    petpkg: "tmp/order-gate-regression/test.petpkg",
    rightsConfirmed: false,
    supportScopeConfirmed: false,
    evidence: {
      contactSheet: "tmp/order-gate-regression/missing-contact-sheet.png",
      report: "tmp/order-gate-regression/missing-report.json",
      productionChecklist: "tmp/order-gate-regression/BAD-PRODUCTION.md",
    },
  });
}

async function main() {
  await fs.promises.rm(tempRoot, { recursive: true, force: true });
  await fs.promises.mkdir(tempRoot, { recursive: true });
  await writeGoodOrder();
  await writeBadOrder();

  runOrderVerify(["--order-file", path.join(tempRoot, "good-order.json")]);

  try {
    runOrderVerify(["--order-file", path.join(tempRoot, "bad-order.json")], { capture: true });
    throw new Error("Incomplete order unexpectedly passed the production gate.");
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    for (const expected of ["rightsConfirmed", "supportScopeConfirmed", "Missing production evidence", "PRODUCTION.md unchecked"]) {
      if (!output.includes(expected)) {
        throw new Error(`Order gate failed for the wrong reason. Missing "${expected}" in:\n${output}`);
      }
    }
  }

  console.log("Order gate regression tests passed.");
}

try {
  await main();
} finally {
  await fs.promises.rm(tempRoot, { recursive: true, force: true });
}
