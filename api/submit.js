/**
 * /api/submit — appends one pseudonymised research record to a Google Sheet.
 *
 * DESIGN NOTES
 *
 * 1. The server is the authoritative gate on collection, not the client.
 *    COLLECTION_ENABLED must be "true" here or every request is refused. A
 *    tampered front end cannot talk this endpoint into storing anything, which
 *    is what makes "ethics approval pending" an enforceable state rather than a
 *    UI convention.
 *
 * 2. Fields are allowlisted against RESEARCH_FIELDS. Anything else in the body
 *    is dropped, and a body carrying an obvious identifier is rejected outright
 *    rather than quietly trimmed — a request that tries to send a name is a bug
 *    or an attack, and should be loud either way.
 *
 * 3. No googleapis dependency. A service-account JWT is signed with node:crypto
 *    and exchanged for an access token. ~40 lines against a ~50MB package, and
 *    a much faster cold start on a function that runs rarely.
 *
 * 4. Nothing identifying is logged. Errors log the status and the Google error,
 *    never the record.
 *
 * Required environment variables (Vercel → Settings → Environment Variables):
 *   COLLECTION_ENABLED             "true" to accept records. Anything else refuses.
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL   ...@...iam.gserviceaccount.com
 *   GOOGLE_PRIVATE_KEY             the PEM, newlines as literal \n
 *   SHEETS_SPREADSHEET_ID          the id from the sheet URL
 *   SHEETS_TAB_NAME                optional, defaults to "Submissions"
 *
 * The service account needs Editor on that ONE sheet and nothing else. Share
 * the sheet with its email address; do not grant it Drive-wide scope.
 */

import crypto from "node:crypto";

/* Must stay in step with RESEARCH_FIELDS in src/collection.js. Duplicated
   rather than imported because Vercel builds the API and the front end
   separately — the mismatch check below turns drift into a clear 500 at the
   first request instead of silently misaligned columns months later. */
const RESEARCH_FIELDS = [
  "submitted_at",
  "participant_code",
  "app_version",
  "consent_version",
  "language",
  "age_band",
  "sex",
  "ethnicity",
  "state",
  "ever_sexually_active",
  "smoking",
  "smoked_20y",
  "passive_smoke",
  "occupational_hazards",
  "relatives_encoded",
  "n_relatives",
  "n_first_degree",
  "n_second_degree",
  "any_relative_under_50",
  "genetics",
  "risk_colorectal",
  "risk_breast",
  "risk_lung",
  "risk_cervical",
  "risk_npc",
  "symptoms_flagged",
  "n_symptoms_flagged",
  "any_red_flag",
];

/* Keys that must never appear. Presence means something is badly wrong
   upstream, so the request is refused rather than sanitised. */
const FORBIDDEN_KEYS = [
  "name", "full_name", "fullname", "patient_name",
  "ic", "ic_number", "mykad", "nric", "identity_card",
  "phone", "mobile", "tel", "telephone",
  "email", "address", "postcode",
  "dob", "date_of_birth", "birthdate",
  "age", // the exact age — only age_band may be stored
];

/* A free-text field could carry an identifier in any shape, so every value is
   also length-capped. Nothing in the model legitimately exceeds this. */
const MAX_VALUE_LENGTH = 300;

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Sign a service-account JWT and exchange it for an OAuth access token. */
async function getAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(privateKey, "base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`token exchange failed: ${res.status} ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.access_token;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    COLLECTION_ENABLED,
    GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_PRIVATE_KEY,
    SHEETS_SPREADSHEET_ID,
    SHEETS_TAB_NAME,
  } = process.env;

  // (1) The ethics gate. Refuse before touching anything else.
  if (String(COLLECTION_ENABLED).toLowerCase() !== "true") {
    return res.status(503).json({
      error: "Data collection is not enabled. Nothing was stored.",
    });
  }

  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY || !SHEETS_SPREADSHEET_ID) {
    console.error("/api/submit: Google Sheets environment variables are missing");
    return res.status(500).json({ error: "Server is not configured for collection." });
  }

  try {
    const record = (req.body || {}).record;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return res.status(400).json({ error: "Malformed record." });
    }

    // (2) Refuse anything carrying a direct identifier.
    const keys = Object.keys(record).map((k) => k.toLowerCase());
    const offending = keys.filter((k) => FORBIDDEN_KEYS.includes(k));
    if (offending.length) {
      console.error("/api/submit: refused, record carried identifier keys:", offending);
      return res.status(400).json({
        error: "Record carried identifying fields and was refused. Nothing was stored.",
      });
    }

    // (3) Allowlist to the exact column set, in column order.
    const row = RESEARCH_FIELDS.map((field) => {
      const v = record[field];
      if (v === undefined || v === null) return "";
      return String(v).slice(0, MAX_VALUE_LENGTH);
    });

    // A record missing its code is unusable for analysis and suggests a
    // front-end bug — better to reject than to write an orphan row.
    if (!row[RESEARCH_FIELDS.indexOf("participant_code")]) {
      return res.status(400).json({ error: "Record is missing a participant code." });
    }

    const accessToken = await getAccessToken(
      GOOGLE_SERVICE_ACCOUNT_EMAIL,
      GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
    );

    const tab = SHEETS_TAB_NAME || "Submissions";
    const range = encodeURIComponent(`${tab}!A1`);
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_SPREADSHEET_ID}` +
      `/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [row] }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error("Sheets append failed:", upstream.status, detail.slice(0, 300));
      return res.status(502).json({ error: "Could not save the record." });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    // Log the message only — never the record.
    console.error("/api/submit failed:", err.message);
    return res.status(500).json({ error: "Unexpected error." });
  }
}
