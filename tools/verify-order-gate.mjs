#!/usr/bin/env node
import process from "node:process";
import { readOrderFile, validateOrderProduction } from "./order-gate-lib.mjs";

const root = process.cwd();

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--order-file") options.orderFile = argv[++index];
    else if (item === "--json") options.json = true;
    else if (item === "--help" || item === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${item}`);
  }
  return options;
}

function printHelp() {
  console.log(`Verify that an order is ready for customer delivery.

Usage:
  npm run order:verify -- --order-file orders/customer-order.json
  npm run order:verify -- --order-file orders/customer-order.json --json
`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.orderFile) throw new Error("Missing --order-file.");
  const { order, orderFilePath } = readOrderFile(options.orderFile);
  const result = validateOrderProduction({ root, order, orderFilePath });
  const payload = {
    ok: result.ok,
    order: order.order ?? null,
    customer: order.customer ?? null,
    orderFile: orderFilePath,
    evidence: result.evidence,
    errors: result.errors,
  };
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (result.ok) {
    console.log(`Order production gate passed: ${orderFilePath}`);
  } else {
    console.error(`Order production gate failed: ${orderFilePath}`);
    for (const error of result.errors) console.error(`- ${error}`);
  }
  if (!result.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`verify-order-gate: ${error.message}`);
  process.exitCode = 1;
}
