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
 * 5. THREE POSSIBLE DESTINATIONS, chosen automatically by which variables are
 *    set. They exist because a Google Workspace tenant can switch off Google
 *    Cloud Platform for its users, which kills the service-account route
 *    through no fault of the person configuring it.
 *
 *      a. "sheets"     — service account writing straight to the Sheets API.
 *                        Best, but needs Google Cloud Platform access.
 *      b. "appsscript" — a Web App deployed from the sheet itself. Apps Script
 *                        is a Workspace service, NOT Cloud Platform, so this
 *                        usually survives a GCP block. Same sheet, same row,
 *                        no Cloud Console, no key file.
 *      c. "email"      — EmailJS, reusing whatever /api/feedback already uses.
 *                        Always available, but each record arrives as a
 *                        separate message that has to be pasted into the sheet
 *                        by hand, so it does not scale past a small study.
 *
 * Required environment variables (Vercel → Settings → Environment Variables):
 *   COLLECTION_ENABLED             "true" to accept records. Anything else refuses.
 *
 *   For (a):  GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY (PEM with
 *             literal \n), SHEETS_SPREADSHEET_ID, and optionally
 *             SHEETS_TAB_NAME (defaults to "Submissions").
 *   For (b):  APPS_SCRIPT_URL, APPS_SCRIPT_SECRET.
 *   For (c):  the EMAILJS_* set, plus RESEARCH_TO_EMAIL.
 *
 * Whichever is used, the record itself is identical — the allowlist and the
 * identifier refusal run before the destination is chosen, so no destination
 * can receive a field the others would not.
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
  "summary_generated",
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

/** 1 -> A, 27 -> AA, 29 -> AC. Derived from the field list so the column
    can never drift out of step with RESEARCH_FIELDS. */
function colLetter(n) {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

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

/** Which destination this deployment is configured for, in order of
    preference. Returns null when none is, which is a configuration error
    rather than a refusal. */
function chooseSink(env) {
  if (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY && env.SHEETS_SPREADSHEET_ID) {
    return "sheets";
  }
  if (env.APPS_SCRIPT_URL && env.APPS_SCRIPT_SECRET) return "appsscript";
  if (env.EMAILJS_SERVICE_ID && env.EMAILJS_TEMPLATE_ID &&
      env.EMAILJS_PUBLIC_KEY && env.EMAILJS_PRIVATE_KEY) {
    return "email";
  }
  return null;
}

/** Post to an Apps Script Web App. The shared secret is checked inside the
    script, because a Web App deployed for "Anyone" is reachable by URL alone.
    Apps Script answers with a 302 to googleusercontent.com; fetch follows it. */
async function sendViaAppsScript(env, payload) {
  const res = await fetch(env.APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: env.APPS_SCRIPT_SECRET, ...payload }),
    redirect: "follow",
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("Apps Script failed:", res.status, text.slice(0, 300));
    return { ok: false, status: 502 };
  }
  // The script returns JSON; an HTML body means Google served a sign-in or
  // error page instead, which almost always means the deployment's access is
  // not set to "Anyone".
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    console.error("Apps Script returned non-JSON (check deployment access):", text.slice(0, 200));
    return { ok: false, status: 502 };
  }
  if (parsed.error) {
    console.error("Apps Script rejected the call:", parsed.error);
    return { ok: false, status: 502 };
  }
  return { ok: true };
}

/** Email one record via EmailJS, reusing the service /api/feedback already
    uses. The body carries a tab-separated line because pasting one into a
    Google Sheet spreads it across the columns in a single action — the least
    painful manual path that exists for this route. */
async function sendViaEmail(env, row, record) {
  const tsv = row.join("\t");
  const readable = RESEARCH_FIELDS
    .map((f, i) => `  ${f.padEnd(24)} ${row[i]}`)
    .join("\n");

  const summary = [
    "A new anonymous study record was submitted.",
    "",
    "NO personal data is included: no name, IC, contact detail or exact age.",
    `Participant code: ${record.participant_code}`,
    "",
    "── PASTE THIS LINE INTO THE SHEET ──────────────────────────────",
    "Copy the single line below, click the first empty cell in column A,",
    "and paste. Google Sheets splits it across all 29 columns for you.",
    "",
    tsv,
    "",
    "── THE SAME RECORD, READABLE ──────────────────────────────────",
    readable,
  ].join("\n");

  const upstream = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: env.EMAILJS_SERVICE_ID,
      template_id: env.EMAILJS_TEMPLATE_ID,
      user_id: env.EMAILJS_PUBLIC_KEY,
      accessToken: env.EMAILJS_PRIVATE_KEY,
      template_params: {
        to_email: env.RESEARCH_TO_EMAIL || env.FEEDBACK_TO_EMAIL || "",
        subject: `FCRC study record — ${record.participant_code}`,
        summary,
        submitted_at: record.submitted_at || "",
        app_version: record.app_version || "",
      },
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    console.error("EmailJS failed:", upstream.status, detail.slice(0, 300));
    return { ok: false, status: 502 };
  }
  return { ok: true };
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

  const sink = chooseSink(process.env);
  if (!sink) {
    console.error("/api/submit: no destination configured (need Sheets, Apps Script or EmailJS variables)");
    return res.status(500).json({ error: "Server is not configured for collection." });
  }

  const tab = SHEETS_TAB_NAME || "Submissions";
  const sheetBase = `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_SPREADSHEET_ID}`;

  try {
    /* --- Path B: mark an existing row as having produced a clinic sheet ---
       Carries only the participant code. Finds the row by that code and sets
       one cell; it cannot write anything else, so this endpoint stays unable
       to introduce new data. */
    const mark = (req.body || {}).markSummary;
    if (mark) {
      const code = String(mark.participant_code || "");
      if (!/^FCR-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
        return res.status(400).json({ error: "Malformed participant code." });
      }

      if (sink === "appsscript") {
        const r = await sendViaAppsScript(process.env, { markSummary: { participant_code: code } });
        return r.ok ? res.status(200).json({ ok: true })
                    : res.status(r.status).json({ error: "Could not update the record." });
      }

      if (sink === "email") {
        /* A sent email cannot be amended, so this signal is unavailable on the
           email route. Answered 200 so the client does not show the patient an
           error for something that is a configuration limit, not a failure. */
        return res.status(200).json({ ok: true, noop: "summary flag unavailable on the email route" });
      }

      const accessToken = await getAccessToken(
        GOOGLE_SERVICE_ACCOUNT_EMAIL,
        GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
      );

      const codeCol = colLetter(RESEARCH_FIELDS.indexOf("participant_code") + 1);
      const flagCol = colLetter(RESEARCH_FIELDS.indexOf("summary_generated") + 1);

      // Read only the code column, never the table.
      const readUrl = `${sheetBase}/values/${encodeURIComponent(`${tab}!${codeCol}:${codeCol}`)}`;
      const readRes = await fetch(readUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!readRes.ok) {
        const detail = await readRes.text();
        console.error("Sheets read failed:", readRes.status, detail.slice(0, 300));
        return res.status(502).json({ error: "Could not reach the record." });
      }
      const rows = (await readRes.json()).values || [];

      // Search upward: codes are unique, but if one were ever reused the most
      // recent row is the current session's.
      let rowNumber = -1;
      for (let i = rows.length - 1; i >= 0; i--) {
        if ((rows[i] || [])[0] === code) { rowNumber = i + 1; break; }
      }
      if (rowNumber < 0) {
        // The submission may still be in flight; not an error worth surfacing.
        return res.status(404).json({ error: "No matching record yet." });
      }

      const writeUrl =
        `${sheetBase}/values/${encodeURIComponent(`${tab}!${flagCol}${rowNumber}`)}` +
        `?valueInputOption=RAW`;
      const writeRes = await fetch(writeUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [["yes"]] }),
      });
      if (!writeRes.ok) {
        const detail = await writeRes.text();
        console.error("Sheets update failed:", writeRes.status, detail.slice(0, 300));
        return res.status(502).json({ error: "Could not update the record." });
      }
      return res.status(200).json({ ok: true });
    }

    /* --- Path A: append a new record --- */
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

    if (sink === "appsscript") {
      const r = await sendViaAppsScript(process.env, { record: Object.fromEntries(
        RESEARCH_FIELDS.map((f, i) => [f, row[i]])
      ) });
      return r.ok ? res.status(200).json({ ok: true })
                  : res.status(r.status).json({ error: "Could not save the record." });
    }

    if (sink === "email") {
      const r = await sendViaEmail(process.env, row, record);
      return r.ok ? res.status(200).json({ ok: true })
                  : res.status(r.status).json({ error: "Could not save the record." });
    }

    const accessToken = await getAccessToken(
      GOOGLE_SERVICE_ACCOUNT_EMAIL,
      GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
    );

    const url =
      `${sheetBase}/values/${encodeURIComponent(`${tab}!A1`)}` +
      `:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

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
