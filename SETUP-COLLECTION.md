# Turning on data collection — detailed walkthrough

The app is deployed with collection **off**. Nothing reaches the Google Sheet
until all five steps below are done.

**Steps 1–4 use synthetic data and need no ethics approval.** Step 5 is where
real patients start being recorded, so that one waits for MREC/NMRR.

Target sheet:
[Family Cancer Risk Check — Study Data (pseudonymised)](https://docs.google.com/spreadsheets/d/1aWzcp4sNKZUuCSqq_qm9EICVndontepq8Gy88-KlCwQ/edit)

Spreadsheet ID (you will paste this later):

```
1aWzcp4sNKZUuCSqq_qm9EICVndontepq8Gy88-KlCwQ
```

---

## How the pieces fit together

Before clicking anything, the shape of it:

```
  Patient's browser                 Your Vercel server              Google
 ┌──────────────────┐            ┌──────────────────────┐      ┌─────────────┐
 │ completes check  │  ── POST ─▶│  /api/submit         │ ──▶  │ Your Sheet  │
 │ consent given    │            │  logs in as the      │      │             │
 └──────────────────┘            │  SERVICE ACCOUNT     │      └─────────────┘
                                 └──────────────────────┘
```

A **service account** is a robot Google account. Your app logs in as it, and it
writes the row. It needs two things, which are the whole point of steps 2 and 3:

1. **An identity and a key** (step 2) — so Google knows who is calling
2. **Permission on your sheet** (step 3) — so Google lets it write

Steps 4 and 5 are testing it, then switching it on.

---

## Step 1 — Fix the sheet (2 minutes)

Open the sheet.

### 1a. Rename the tab

Look at the **bottom-left** of the window. There is a tab currently called
**`Untitled`**.

- Double-click that tab name
- Type exactly: `Submissions`
- Press Enter

Capital S, no spaces, no trailing space. If this is wrong, everything else can
be perfect and the app will still fail with a 502. It is the single most common
cause of "nothing is flowing".

### 1b. Add the last column header

The headers currently run A1 to AB1. One is missing.

- Press **Ctrl+Right Arrow** (or scroll right) until you reach `any_red_flag`
  in column **AB**
- Click the cell immediately to its right — cell **AC1**
- Type exactly: `summary_generated`
- Press Enter

You should now have 29 headers, A1 through AC1.

---

## Choose your route first

Step 2 below needs **Google Cloud Platform**, which many MOH/government
Workspace tenants switch off for their users. If you see *"you do not have
access to Google Cloud Platform"*, that is an organisation policy and there is
nothing to fix on your side — use Route B or C instead.

| | Route | Needs | Data lands in | Effort |
|---|---|---|---|---|
| **A** | Service account | Google Cloud Platform access | The sheet, automatically | ~20 min |
| **B** | **Apps Script Web App** | Only the sheet itself | The sheet, automatically | **~10 min** |
| **C** | Email (EmailJS) | Nothing new | Your inbox, pasted in by hand | ~2 min |

**Route B is the one to try if Cloud Platform is blocked.** Apps Script is a
Google *Workspace* service, not a Cloud Platform one, so it usually survives
that block. It writes the same rows to the same sheet — the only difference is
how the app proves who it is.

**Route C always works** but does not scale: each participant arrives as a
separate email that you paste into the sheet by hand, and the
`summary_generated` signal is unavailable because a sent email cannot be
amended. Reasonable for a pilot of a few dozen; painful beyond that.

Jump to [Route B](#route-b--apps-script-web-app-no-cloud-platform-needed) or
[Route C](#route-c--email) if Route A is blocked for you.

---

## Step 2 — Create the service account (10 minutes)

> **Before you start:** some organisations block service-account key creation by
> policy. If step 2d gives you an error about *"Service account key creation is
> disabled"*, that is an MOH Workspace policy, not a mistake you made. Stop there
> and tell me — there is an alternative route that avoids this entirely.

### 2a. Open the console and pick an account

Go to **https://console.cloud.google.com**

Sign in. **Use the same Google account that owns the sheet** (`ppnaim@moh.gov.my`)
— it keeps everything in one place.

If this is your first visit you may be asked to accept terms and pick a country.
You do **not** need to enable billing. Nothing here costs money.

### 2b. Create a project

A "project" is just a container for the robot account.

- At the very top of the page, next to the Google Cloud logo, there is a
  **project dropdown** (it may say *"Select a project"*)
- Click it → a dialog opens → click **NEW PROJECT** (top right of that dialog)
- **Project name:** `fcrc-study`
- Leave Organisation/Location as they are
- Click **CREATE**
- Wait ~15 seconds. A notification appears when it is ready.
- **Click the project dropdown again and select `fcrc-study`.** This matters —
  if the wrong project is selected, the next steps apply to the wrong place.

### 2c. Enable the Google Sheets API

By default a new project cannot talk to Sheets. You have to switch it on.

- Click the **hamburger menu** (☰, top left)
- Go to **APIs & Services** → **Library**
- In the search box type: `Google Sheets API`
- Click the result called **Google Sheets API**
- Click the blue **ENABLE** button
- Wait for it to finish

Skipping this gives a `403` later with a message about the API being disabled.

### 2d. Create the service account

- Hamburger menu → **APIs & Services** → **Credentials**
- At the top, click **+ CREATE CREDENTIALS**
- Choose **Service account** from the dropdown

Then:

- **Service account name:** `fcrc-sheet-writer`
  (the Service account ID fills in automatically — leave it)
- Click **CREATE AND CONTINUE**
- Next screen is *"Grant this service account access to project"* —
  **skip it**, click **CONTINUE**. It needs no project role; its only permission
  comes from sharing the sheet in step 3.
- Next screen is *"Grant users access to this service account"* —
  **skip it**, click **DONE**

You are returned to the Credentials page. Under **Service Accounts** you will
now see an email address ending in `.iam.gserviceaccount.com`.

### 2e. Download the key file

- Click on that service account email to open it
- Click the **KEYS** tab (along the top)
- Click **ADD KEY** → **Create new key**
- Choose **JSON** (it is the default)
- Click **CREATE**

A `.json` file downloads to your computer.

> **Treat this file as a password.** Anyone holding it can read and write your
> sheet. Do not email it, do not put it in the repository, and delete it from
> your Downloads folder once you have pasted the values into Vercel.

### 2f. Open the file and find two values

Open the downloaded `.json` in any text editor (Notepad, TextEdit, VS Code).
It looks like this:

```json
{
  "type": "service_account",
  "project_id": "fcrc-study",
  "private_key_id": "a1b2c3...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhki...long...==\n-----END PRIVATE KEY-----\n",
  "client_email": "fcrc-sheet-writer@fcrc-study.iam.gserviceaccount.com",
  ...
}
```

You need exactly two of these:

| From the JSON | Goes into |
|---|---|
| `client_email` | `GOOGLE_SERVICE_ACCOUNT_EMAIL` |
| `private_key` | `GOOGLE_PRIVATE_KEY` |

**The private key is where people get stuck.** Copy everything between the
quotation marks, exactly as it appears — including every `\n` and both the
`-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` parts. Do not
press Enter to turn the `\n` into real line breaks. Do not reformat it.

---

## Step 3 — Give the robot permission on your sheet (1 minute)

This is the step that actually grants access, and it is much simpler than step 2.

- Open the sheet
- Click the green **Share** button (top right)
- In the *"Add people and groups"* box, paste the **`client_email`** value
  (the one ending `.iam.gserviceaccount.com`)
- Set the role dropdown on the right to **Editor**
- **Untick "Notify people"** — it is a robot, there is no inbox
- Click **Share** (or **Send**)

The service account can now write to this one sheet and nothing else in your
Drive. That is the whole of its access.

---

## Step 4 — Prove it works, before any patient sees it

### Option A — from the live site (no terminal needed)

Do **step 5 first**, then simply use the deployed app:

1. Open the site
2. Accept the consent screen
3. Complete a check through to the results page
4. Watch the sheet — a row should appear within a second or two

On the results page, the *"Prepare the sheet for Klinik Kesihatan"* card shows
the outcome directly:

- **"✅ Anonymous study record saved"** — it worked
- **"⚠ Your study record could not be saved"** — it did not; the reason is in
  **Vercel → your project → Logs**

### Option B — from a terminal (clearer diagnosis)

If you have the repository cloned and Node installed, create a file called
`.env.local` in the project root:

```bash
COLLECTION_ENABLED=true
GOOGLE_SERVICE_ACCOUNT_EMAIL=fcrc-sheet-writer@fcrc-study.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhki...\n-----END PRIVATE KEY-----\n"
SHEETS_SPREADSHEET_ID=1aWzcp4sNKZUuCSqq_qm9EICVndontepq8Gy88-KlCwQ
SHEETS_TAB_NAME=Submissions
```

Then:

```bash
npm install
node scripts/verify-sheet.mjs
```

A pass writes one row marked `FCR-TEST-0000`. **Delete that row** before real
collection starts. A failure names the likely cause in the order worth checking.

---

## Step 5 — Switch it on in Vercel

> Do the variables now if you like, but only set `COLLECTION_ENABLED=true` and
> `VITE_COLLECT_ENABLED=true` once ethics approval is granted — those two are
> what start recording real people.

### 5a. Open the settings

- Go to **https://vercel.com** and sign in
- Click your project (**family-cancer-risk-assistant**)
- Click the **Settings** tab (along the top)
- In the left sidebar, click **Environment Variables**

### 5b. Add each variable

For each row in the table below:

- Type the name into the **Key** box
- Paste the value into the **Value** box
- Leave all three environment checkboxes ticked (Production, Preview, Development)
- Click **Save**
- Repeat for the next one

| Key | Value |
|---|---|
| `COLLECTION_ENABLED` | `true` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the `client_email` from the JSON |
| `GOOGLE_PRIVATE_KEY` | the `private_key` from the JSON, `\n` sequences intact |
| `SHEETS_SPREADSHEET_ID` | `1aWzcp4sNKZUuCSqq_qm9EICVndontepq8Gy88-KlCwQ` |
| `SHEETS_TAB_NAME` | `Submissions` |
| `VITE_COLLECT_ENABLED` | `true` |
| `VITE_NMRR_ID` | your NMRR number, once approved |
| `VITE_DATA_CONTACT` | a monitored email — this is the withdrawal route |

### 5c. Redeploy — this is not optional

Environment variables do **not** apply to a build that already exists. Until you
redeploy, nothing changes and it will look like the variables did nothing.

- Click the **Deployments** tab (along the top)
- Find the most recent deployment (top of the list)
- Click the **⋯** menu on its right
- Click **Redeploy** → confirm **Redeploy**
- Wait for it to go green

`VITE_` variables are compiled into the JavaScript at build time; the other four
are read by the server when a request arrives. That difference is why a redeploy
is required.

---

## Route B — Apps Script Web App (no Cloud Platform needed)

Everything happens inside the sheet. No Cloud Console, no project, no key file,
no private-key formatting.

Do **Step 1** first (tab renamed to `Submissions`, `summary_generated` in AC1).

### B1. Open the script editor

- Open the sheet
- Menu: **Extensions → Apps Script**
- A code editor opens in a new tab, showing a file called `Code.gs`

### B2. Paste the script

- Select everything in `Code.gs` and delete it
- Copy the whole contents of
  [`scripts/apps-script/Code.gs`](scripts/apps-script/Code.gs) from this
  repository and paste it in
- Near the top, change this line to a long random string of your own:

  ```js
  const SECRET = 'CHANGE-ME-to-a-long-random-string';
  ```

  Keep a copy — you will paste the same string into Vercel.
- Click the **save** icon

### B3. Deploy it as a Web App

- Click **Deploy** (top right) → **New deployment**
- Click the **gear icon** next to *"Select type"* → choose **Web app**
- Fill in:
  - **Description:** `fcrc-collector`
  - **Execute as:** `Me`
  - **Who has access:** `Anyone`
- Click **Deploy**

### B4. Authorise it

Google will ask for permission, because the script writes to your sheet.

- Click **Authorize access**, choose your account
- You will see *"Google hasn't verified this app"* — this is expected for a
  script you wrote yourself
- Click **Advanced** → **Go to fcrc-collector (unsafe)**
- Click **Allow**

### B5. Copy the URL

Copy the **Web app URL**. It ends in `/exec`.

Check it works: paste that URL into a browser tab. You should see:

```json
{"ok":true,"service":"fcrc-collector"}
```

If you get a sign-in page instead, *Who has access* is not set to **Anyone** —
go back to Deploy → Manage deployments and fix it.

### B6. Set two variables in Vercel

Follow [Step 5](#step-5--switch-it-on-in-vercel), but instead of the four Google
variables, set these two:

| Key | Value |
|---|---|
| `APPS_SCRIPT_URL` | the `/exec` URL from B5 |
| `APPS_SCRIPT_SECRET` | the same random string you put in `SECRET` |

Plus `COLLECTION_ENABLED`, `VITE_COLLECT_ENABLED`, `VITE_NMRR_ID` and
`VITE_DATA_CONTACT` as in step 5. Then redeploy.

> **On "Who has access: Anyone":** this means anyone holding the URL can POST to
> it, which is why the secret exists — a request without it is rejected and
> nothing is written. Treat the URL and the secret together as a credential, the
> same way you would the service-account key file.

> **If you edit the script later:** Deploy → Manage deployments → pencil icon →
> Version: **New version** → Deploy. Saving the code alone does not update the
> live Web App.

---

## Route C — Email

The fallback that always works. Records arrive in your inbox and you paste them
into the sheet.

This reuses the EmailJS service `/api/feedback` already uses, so there is
nothing new to create. In Vercel, set:

| Key | Value |
|---|---|
| `RESEARCH_TO_EMAIL` | where records should go, e.g. `ppnaim@moh.gov.my` |

plus `COLLECTION_ENABLED`, `VITE_COLLECT_ENABLED`, `VITE_NMRR_ID` and
`VITE_DATA_CONTACT`, and leave all the Google and Apps Script variables unset.
Then redeploy.

### What arrives, and what to do with it

Each email contains a single **tab-separated line**. Google Sheets splits a
pasted tab-separated line across columns automatically, so:

1. Copy the one long line under *"PASTE THIS LINE INTO THE SHEET"*
2. Click the first empty cell in column **A** of the sheet
3. Paste

All 29 columns fill in one action. The email also repeats the same record in a
readable list, so you can check it without decoding anything.

### Limits of this route, stated plainly

- **It does not scale.** One email per participant, each needing a manual paste.
  Fine for tens, unworkable for hundreds.
- **`summary_generated` is always `no`.** A sent email cannot be amended, so the
  "did they generate a clinic sheet?" signal is lost on this route. The app does
  not error — it simply has nowhere to record it.
- **Records sit in a mailbox.** That is a weaker control than a shared sheet
  with defined access, and worth mentioning in the ethics submission if this is
  the route you run with.

Use it to get moving, and switch to Route B when you can — switching is a change
of Vercel variables and a redeploy, with no code change.

---

## Why there are two flags

`COLLECTION_ENABLED` (server) is the one that matters. The server refuses every
write without it, so even a tampered browser cannot store anything.

`VITE_COLLECT_ENABLED` (client) only controls whether the consent screen and the
participant code appear.

**Set both, or neither.** Setting only the client flag shows people a consent
screen and then fails to save their data — the worst of the available states.

---

## If the sheet is still empty

Check in this order. These are ranked by how often each one is the cause.

| # | Check | Symptom if wrong |
|---|---|---|
| 1 | Tab named exactly `Submissions` | 502, "Could not save the record" |
| 2 | Deployment was **redeployed** after setting variables | Nothing happens at all |
| 3 | Sheet shared with the service account as **Editor** | 502 / 403 |
| 4 | `GOOGLE_PRIVATE_KEY` pasted with `\n` intact, in quotes | 500 at the signer |
| 5 | Google Sheets API enabled on the project | 403, "API disabled" |
| 6 | Both flags set to `true` | Consent screen shows but nothing saves |

**Vercel → your project → Logs** shows the actual error from Google. Paste that
error and the cause is usually obvious from the text.

---

## What you should see when it works

- One row per consented participant, appearing when their results render
- `summary_generated` flipping to `yes` if they generate a clinic sheet
- No name, IC, phone or exact age in any column — the server refuses such records
- Nothing at all from participants who decline consent, by design
