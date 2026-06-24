import fs from "node:fs";
import path from "node:path";

export function readOrderFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`Order file not found: ${resolved}`);
  const order = JSON.parse(fs.readFileSync(resolved, "utf8"));
  return { order, orderFilePath: resolved };
}

function checked(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`- \\[x\\] ${escaped}`, "i").test(text);
}

export function validateOrderProduction({ root, order, orderFilePath }) {
  const baseRoot = path.resolve(root);
  const orderDir = path.dirname(orderFilePath);
  const errors = [];
  if (order.rightsConfirmed !== true) errors.push("order.json rightsConfirmed must be true.");
  if (order.supportScopeConfirmed !== true) errors.push("order.json supportScopeConfirmed must be true.");

  const evidence = order.evidence ?? {};
  for (const [label, relativePath] of Object.entries({
    contactSheet: evidence.contactSheet,
    report: evidence.report,
    productionChecklist: evidence.productionChecklist,
  })) {
    if (!relativePath) {
      errors.push(`order.json evidence.${label} is missing.`);
      continue;
    }
    const resolved = path.resolve(baseRoot, relativePath);
    if (!fs.existsSync(resolved)) errors.push(`Missing production evidence: ${relativePath}`);
  }

  const checklistPath = evidence.productionChecklist ? path.resolve(baseRoot, evidence.productionChecklist) : path.join(orderDir, "PRODUCTION.md");
  if (fs.existsSync(checklistPath)) {
    const checklist = fs.readFileSync(checklistPath, "utf8");
    for (const required of [
      "Customer owns or has permission to use the character/person/pet reference.",
      "Support scope, update policy, and rework boundary have been sent to the customer.",
      "Review",
      "Customer asset rights confirmation is retained with the order record.",
      "Import",
      "Test drag movement, double-click interaction, sleep, play, jump, and idle.",
    ]) {
      if (!checked(checklist, required) && !checklist.includes(`- [x] ${required}`)) {
        errors.push(`PRODUCTION.md unchecked or missing: ${required}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    evidence: {
      contactSheet: evidence.contactSheet ?? null,
      report: evidence.report ?? null,
      productionChecklist: evidence.productionChecklist ?? null,
    },
  };
}

export function assertOrderProductionReady({ root, order, orderFilePath }) {
  const result = validateOrderProduction({ root, order, orderFilePath });
  if (!result.ok) {
    throw new Error(`Order production gate failed:\n- ${result.errors.join("\n- ")}\nUse --skip-order-gate only for demo or manual internal deliveries.`);
  }
  return result;
}
