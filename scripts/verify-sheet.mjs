/**
 * verify-sheet.mjs — prove the Google Sheets pipeline works, end to end,
 * before a single patient sees it.
 *
 *   node scripts/verify-sheet.mjs
 *
 * It calls the REAL api/submit.js handler, so a pass means the actual
 * production code path works — the ethics gate, the identifier allowlist, the
 * service-account JWT, and the append. A test that bypassed the handler would
 * prove nothing about the thing you are about to deploy.
 *
 * It writes ONE clearly-marked row:
 *   participant_code = FCR-TEST-0000
 *   consent_version  = PIPELINE-TEST
 * Sort or filter on either to find and delete it before real collection starts.
 *
 * Reads .env.local if present, otherwise the process environment. Run it with
 * COLLECTION_ENABLED=true even while the deployed site has it off — this is a
 * local check against the sheet, not a switch-on of the live site.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* Minimal .env.local reader — avoids a dotenv dependency for one script. */
function loadEnvLocal() {
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) return 0;
  let n = 0;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let [, k, v] = m;
    v = v.trim().replace(/^["'](.*)["']$/s, "$1"); // strip wrapping quotes, keep \n escapes
    if (process.env[k] === undefined) { process.env[k] = v; n++; }
  }
  return n;
}

const loaded = loadEnvLocal();
if (loaded) console.log(`Loaded ${loaded} variable(s) from .env.local\n`);

/* --- Pre-flight: say which variable is missing, rather than failing opaquely */
const required = [
  "COLLECTION_ENABLED",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "SHEETS_SPREADSHEET_ID",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("✗ Missing environment variable(s):\n  " + missing.join("\n  "));
  console.error("\nSet them in .env.local (see .env.example) and run again.");
  process.exit(1);
}
if (String(process.env.COLLECTION_ENABLED).toLowerCase() !== "true") {
  console.error('✗ COLLECTION_ENABLED is not "true", so the handler will refuse by design.');
  console.error("  For this local check only, run:  COLLECTION_ENABLED=true node scripts/verify-sheet.mjs");
  process.exit(1);
}

const tab = process.env.SHEETS_TAB_NAME || "Submissions";
console.log("Spreadsheet :", process.env.SHEETS_SPREADSHEET_ID);
console.log("Tab         :", tab, "(must match the tab name in the sheet exactly)");
console.log("Service acct:", process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, "\n");

/* --- The synthetic record. Shaped like a real one, marked unmistakably. --- */
const record = {
  submitted_at: new Date().toISOString(),
  participant_code: "FCR-TEST-0000",
  app_version: "pipeline-test",
  consent_version: "PIPELINE-TEST",
  language: "en",
  age_band: "50-59",
  sex: "female",
  ethnicity: "malay",
  state: "Selangor",
  ever_sexually_active: "yes",
  smoking: "never",
  smoked_20y: "no",
  passive_smoke: "no",
  occupational_hazards: "none",
  relatives_encoded: "mother:breast:u50:na",
  n_relatives: 1,
  n_first_degree: 1,
  n_second_degree: 0,
  any_relative_under_50: "yes",
  genetics: "none",
  risk_colorectal: "average",
  risk_breast: "moderate",
  risk_lung: "average",
  risk_cervical: "info",
  risk_npc: "info",
  symptoms_flagged: "none",
  n_symptoms_flagged: 0,
  any_red_flag: "no",
};

const handler = (await import(path.join(root, "api", "submit.js"))).default;

const res = {
  _status: 0,
  status(c) { this._status = c; return this; },
  json(j) { this._json = j; return this; },
  setHeader() {},
};

console.log("Posting one test row through api/submit.js …\n");
await handler({ method: "POST", body: { record } }, res);

if (res._status === 200) {
  console.log("✓ PASS — the row was appended.");
  console.log(`  Open the sheet and look for participant_code "FCR-TEST-0000".`);
  console.log(`  https://docs.google.com/spreadsheets/d/${process.env.SHEETS_SPREADSHEET_ID}/edit`);
  console.log("\n  Delete that row before real collection begins.");
  process.exit(0);
}

console.error(`✗ FAIL — handler returned ${res._status}: ${res._json?.error || "(no message)"}`);
console.error("\nMost likely causes, in the order worth checking:");
console.error(`  502  The tab name is wrong. The sheet's tab must be called "${tab}",`);
console.error(`       or set SHEETS_TAB_NAME to whatever it is actually called.`);
console.error("  502  The sheet is not shared with the service account as Editor.");
console.error("  500  GOOGLE_PRIVATE_KEY is malformed — it needs literal \\n for newlines,");
console.error("       wrapped in double quotes, including the BEGIN/END lines.");
console.error("  500  The Google Sheets API is not enabled on the Cloud project.");
console.error("\nThe scrollback above carries the exact error Google returned.");
process.exit(1);
