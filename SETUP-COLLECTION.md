# Turning on data collection — step by step

The app is deployed with collection **off**. Nothing reaches the Google Sheet
until all five steps below are done. Allow about 20 minutes.

**Steps 1–4 use synthetic data only and need no ethics approval.** Step 5 is the
one that waits for MREC/NMRR, because that is when real patients are recorded.

Target sheet:
[Family Cancer Risk Check — Study Data (pseudonymised)](https://docs.google.com/spreadsheets/d/1aWzcp4sNKZUuCSqq_qm9EICVndontepq8Gy88-KlCwQ/edit)

---

## Step 1 — Fix the sheet (2 minutes)

Open the sheet.

**1a. Rename the tab.** Bottom-left, the tab is called `Untitled`.
Double-click it and rename to exactly:

```
Submissions
```

Capital S, no spaces. If this is wrong the app fails with a 502 and everything
else looks perfectly configured. It is the most common cause of "nothing is
flowing".

**1b. Add the last column header.** Click cell **AC1** (scroll right; it is the
column after `any_red_flag`) and type exactly:

```
summary_generated
```

The sheet should now have 29 headers, A1 through AC1.

---

## Step 2 — Create a service account (10 minutes)

A service account is a robot Google account that the app logs in as. It is the
only thing that will ever write to this sheet.

Go to **https://console.cloud.google.com**

**2a. Pick or create a project.** Top-left dropdown → *New Project* → name it
e.g. `fcrc-study` → *Create*. Make sure it is selected afterwards.

**2b. Enable the Sheets API.**
*APIs & Services* → *Library* → search `Google Sheets API` → **Enable**.
Skipping this gives a 403 later.

**2c. Create the service account.**
*APIs & Services* → *Credentials* → *Create credentials* → *Service account*.

- Name: `fcrc-sheet-writer`
- *Create and continue*
- **Skip the "Grant this service account access to project" step** — it needs no
  project role. Its only permission comes from sharing the sheet in step 3.
- *Done*

**2d. Download the key.** Click the service account you just made → *Keys* tab →
*Add key* → *Create new key* → **JSON** → *Create*. A `.json` file downloads.

**Treat that file as a credential.** Anyone holding it can read and write the
sheet. Do not email it, and do not commit it to the repository.

Open it in a text editor. You need two values:

```json
{
  "client_email": "fcrc-sheet-writer@fcrc-study.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n"
}
```

---

## Step 3 — Share the sheet with it (1 minute)

Open the sheet → **Share** → paste the `client_email` value from the JSON →
set to **Editor** → untick *Notify people* (it is a robot) → **Share**.

This is what grants access. The service account can now write to this one sheet
and nothing else in your Drive.

---

## Step 4 — Prove it works, before any patient sees it

Two ways. Pick whichever suits you.

### Option A — from a terminal (gives the clearest diagnosis)

Clone the repo, then create a file called `.env.local` in the project root:

```bash
COLLECTION_ENABLED=true
GOOGLE_SERVICE_ACCOUNT_EMAIL=fcrc-sheet-writer@fcrc-study.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n"
SHEETS_SPREADSHEET_ID=1aWzcp4sNKZUuCSqq_qm9EICVndontepq8Gy88-KlCwQ
SHEETS_TAB_NAME=Submissions
```

Copy `private_key` out of the JSON **exactly as it appears there**, including the
`\n` sequences and the BEGIN/END lines, wrapped in double quotes. This is the
second most common cause of failure.

Then:

```bash
npm install
node scripts/verify-sheet.mjs
```

A pass writes one row to the sheet marked `FCR-TEST-0000`. **Delete that row**
before real collection starts.

A failure names the likely cause in the order worth checking.

### Option B — from the browser (no terminal needed)

Do step 5 first, then simply use the live site: accept the consent screen,
complete a check, and watch the sheet. The results page will show
*"✅ Anonymous study record saved"* when the row lands.

If something is wrong it shows *"⚠ Your study record could not be saved"*, and
the reason will be in **Vercel → your project → Logs**.

---

## Step 5 — Switch it on in Vercel (waits for ethics approval)

**Vercel → your project → Settings → Environment Variables.** Add these, for the
Production environment:

| Variable | Value |
|---|---|
| `COLLECTION_ENABLED` | `true` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the `client_email` from the JSON |
| `GOOGLE_PRIVATE_KEY` | the `private_key` from the JSON, quoted, `\n` intact |
| `SHEETS_SPREADSHEET_ID` | `1aWzcp4sNKZUuCSqq_qm9EICVndontepq8Gy88-KlCwQ` |
| `SHEETS_TAB_NAME` | `Submissions` |
| `VITE_COLLECT_ENABLED` | `true` |
| `VITE_NMRR_ID` | your NMRR number once approved |
| `VITE_DATA_CONTACT` | a monitored email — this is the withdrawal route |

Then **redeploy** — environment variables do not apply to an existing build.
*Deployments* → latest → ⋯ → *Redeploy*.

`VITE_` variables are baked in at build time; the other four are read at runtime.
That is why a redeploy is required and not optional.

---

## Why two flags

`COLLECTION_ENABLED` (server) is the one that matters. The server refuses every
write without it, so a tampered front end cannot store anything.
`VITE_COLLECT_ENABLED` (client) only controls whether the consent screen and
participant code appear.

Setting the client flag alone shows people a consent screen and then fails to
save — the worst combination. Set both, or neither.

---

## Checking it afterwards

- A row appears per consented participant, when their results render
- `summary_generated` flips to `yes` if they generate a clinic sheet
- No name, IC, phone or exact age ever appears — the server refuses such records
- Participants who decline consent produce no row at all, by design

If the sheet stays empty with everything above done, check in this order:

1. Tab name is exactly `Submissions`
2. Sheet is shared with the service account as **Editor**
3. Google Sheets API is enabled on that Cloud project
4. The deployment was **redeployed** after the variables were set
5. Vercel → Logs, for the actual error
