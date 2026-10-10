/**
 * Apps Script Web App — the route that needs NO Google Cloud Platform access.
 *
 * Apps Script is a Google Workspace service, not a Cloud Platform one, so this
 * usually still works in a tenant where console.cloud.google.com is blocked for
 * users. It writes to the same sheet, the same columns, the same rows as the
 * service-account route; the only difference is how the app authenticates.
 *
 * ── HOW TO INSTALL ───────────────────────────────────────────────────────────
 *
 *  1. Open the study sheet.
 *  2. Extensions → Apps Script. A code editor opens in a new tab.
 *  3. Delete whatever is in Code.gs and paste this whole file in its place.
 *  4. Change SECRET below to a long random string of your own. Keep a copy —
 *     you will paste the same string into Vercel as APPS_SCRIPT_SECRET.
 *  5. Click Save (the disk icon).
 *  6. Click Deploy → New deployment.
 *       - Click the gear next to "Select type" and choose Web app
 *       - Description:    fcrc-collector
 *       - Execute as:     Me  (your own account)
 *       - Who has access: Anyone
 *     Then click Deploy.
 *  7. Google asks you to authorise. Click Authorize access, pick your account,
 *     then on the "Google hasn't verified this app" screen click Advanced →
 *     "Go to ... (unsafe)". This warning is normal for your own script; you are
 *     authorising code you just pasted yourself.
 *  8. Copy the Web app URL. It ends in /exec. That is APPS_SCRIPT_URL.
 *
 * "Who has access: Anyone" means anyone holding the URL can POST to it, which
 * is why SECRET exists — a request without it is rejected and nothing is
 * written. Treat the URL and the secret together as a credential.
 *
 * ── IF YOU CHANGE THIS FILE LATER ────────────────────────────────────────────
 * Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy.
 * Editing the code alone does not update the live Web App.
 */

/** Must match APPS_SCRIPT_SECRET in Vercel. Change it before deploying. */
const SECRET = 'CHANGE-ME-to-a-long-random-string';

/** The study sheet, addressed by id rather than by SpreadsheetApp.getActive().
    getActive() only works when the script was opened from inside the sheet
    (Extensions -> Apps Script); a script started from script.google.com is
    standalone and getActive() returns null. Naming the id makes the script
    behave identically either way, which removes a confusing failure. */
const SPREADSHEET_ID = '1aWzcp4sNKZUuCSqq_qm9EICVndontepq8Gy88-KlCwQ';

/** The tab records are written to. setup() creates or renames it for you. */
const SHEET_NAME = 'Submissions';

/** Column order. Must match RESEARCH_FIELDS in src/collection.js and
    api/submit.js — all three are the same list in the same order. */
const FIELDS = [
  'submitted_at',
  'participant_code',
  'app_version',
  'consent_version',
  'language',
  'age_band',
  'sex',
  'ethnicity',
  'state',
  'ever_sexually_active',
  'smoking',
  'smoked_20y',
  'passive_smoke',
  'occupational_hazards',
  'relatives_encoded',
  'n_relatives',
  'n_first_degree',
  'n_second_degree',
  'any_relative_under_50',
  'genetics',
  'risk_colorectal',
  'risk_breast',
  'risk_lung',
  'risk_cervical',
  'risk_npc',
  'symptoms_flagged',
  'n_symptoms_flagged',
  'any_red_flag',
  'summary_generated',
];

/** Keys that must never be written, mirroring the server's refusal. Defence in
    depth: if a future change to the app ever sent one, it still would not land
    in the sheet. */
const FORBIDDEN = [
  'name', 'full_name', 'fullname', 'patient_name',
  'ic', 'ic_number', 'mykad', 'nric', 'identity_card',
  'phone', 'mobile', 'tel', 'telephone',
  'email', 'address', 'postcode',
  'dob', 'date_of_birth', 'birthdate', 'age',
];

/**
 * Run this ONCE before deploying: in the toolbar above, choose "setup" from the
 * function dropdown and click Run. It prepares the sheet so you do not have to
 * rename the tab or type the 29 headers by hand.
 *
 * It only ever writes row 1. Existing data rows are never touched.
 */
function setup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    const existing = ss.getSheets();
    if (existing.length === 1) {
      // The sheet created from the CSV import has a single tab called
      // "Untitled". Rename it rather than adding a second one.
      sheet = existing[0].setName(SHEET_NAME);
    } else {
      sheet = ss.insertSheet(SHEET_NAME);
    }
  }

  sheet.getRange(1, 1, 1, FIELDS.length).setValues([FIELDS]);
  sheet.setFrozenRows(1);

  const msg = 'Ready. Tab "' + SHEET_NAME + '" has ' + FIELDS.length +
              ' columns, A1 to ' + colLetter(FIELDS.length) + '1.';
  Logger.log(msg);
  return msg;
}

/** 1 -> A, 27 -> AA, 29 -> AC. */
function colLetter(n) {
  var s = '';
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.secret !== SECRET) {
      return json({ error: 'unauthorised' });
    }

    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) {
      return json({ error: 'tab "' + SHEET_NAME + '" not found — run setup() first' });
    }

    // Flip summary_generated to "yes" on an existing row.
    if (body.markSummary) {
      const code = String(body.markSummary.participant_code || '');
      if (!/^FCR-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
        return json({ error: 'malformed participant code' });
      }
      const codeCol = FIELDS.indexOf('participant_code') + 1;
      const flagCol = FIELDS.indexOf('summary_generated') + 1;
      const last = sheet.getLastRow();
      if (last < 2) return json({ error: 'no rows yet' });

      const values = sheet.getRange(1, codeCol, last, 1).getValues();
      // Search upward: the most recent match is the current session's.
      for (var i = values.length - 1; i >= 0; i--) {
        if (values[i][0] === code) {
          sheet.getRange(i + 1, flagCol).setValue('yes');
          return json({ ok: true });
        }
      }
      return json({ error: 'no matching record yet' });
    }

    // Append a new record.
    const record = body.record;
    if (!record || typeof record !== 'object') {
      return json({ error: 'malformed record' });
    }

    const keys = Object.keys(record).map(function (k) { return k.toLowerCase(); });
    for (var j = 0; j < keys.length; j++) {
      if (FORBIDDEN.indexOf(keys[j]) !== -1) {
        return json({ error: 'record carried an identifying field' });
      }
    }
    if (!record.participant_code) {
      return json({ error: 'missing participant code' });
    }

    const row = FIELDS.map(function (f) {
      const v = record[f];
      return (v === undefined || v === null) ? '' : String(v).slice(0, 300);
    });
    sheet.appendRow(row);
    return json({ ok: true });

  } catch (err) {
    // Never log the record itself.
    console.error('doPost failed: ' + err.message);
    return json({ error: 'unexpected error' });
  }
}

/** A GET is useful for checking the deployment is reachable at all: open the
    /exec URL in a browser and you should see {"ok":true,"service":"fcrc-collector"}.
    It reveals nothing and writes nothing. */
function doGet() {
  return json({ ok: true, service: 'fcrc-collector' });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
