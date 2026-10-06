# Family Cancer Risk Assistant — Malaysia

A public-facing, bilingual (English / Bahasa Malaysia) family cancer risk screening
prototype for Malaysia, covering colorectal, breast, lung, cervical and
nasopharyngeal (NPC) cancer.

Features a pedigree builder, symptom red-flag checker, GP-summary export, a
short public-level awareness quiz, a CPG-grounded NotebookLM panel for patient
questions, a feedback form, and a landing page with a national registry data
snapshot.

> **This is a research and education prototype. It supports decisions; it does
> not replace a doctor and does not diagnose.**

## Data handling

**Two modes, controlled by a flag.** With collection off (the default) the app
is session-only and stores nothing. With collection on it takes explicit consent
and stores a **pseudonymised** record. The entire data model lives in one
auditable file, [`src/collection.js`](src/collection.js), so an ethics reviewer
does not have to read the UI component to see what leaves the device.

### Governance position

The data controller is **IKN / KKM**, part of the Federal Government. PDPA 2010
**s.3(1) exempts the Federal and State Governments**, so the Act does not legally
bind this collection. What governs it instead:

- **MREC approval via NMRR** — the gate on go-live
- MOH data-security and classification directives
- Medical confidentiality

PDPA standards are nonetheless applied **voluntarily as the design floor**, and
the consent screen says so in those words. Health information is treated as
"sensitive personal data" in the PDPA s.4 sense throughout, because that is the
stricter and more defensible standard. Do not reword this to claim the PDPA
*binds* the collection — it does not, and an ethics reviewer will notice.

### The pseudonymisation split

The app produces two outputs with opposite requirements, and they are kept apart:

| Output | Carries | Leaves the device? |
|---|---|---|
| Printed summary for Klinik Kesihatan | Name, IC (optional), participant code | **No.** Rendered in-browser, printed. Never transmitted. |
| Research record | Participant code + banded variables | Yes, to the Google Sheet |

The only link between the two is the participant code **on the paper in the
patient's hand**. There is no re-identification key on any server, by design.
This is also what makes withdrawal possible: a participant who quotes their code
can have their row deleted, and nobody else can find it.

If follow-up or recall is ever required, that is a protocol amendment and a
different store. Do not bolt a contact field onto this one.

### What is collected

Exactly the 29 fields in `RESEARCH_FIELDS`, and nothing else — it is an
allowlist, not a filter, so a new profile field cannot leak by accident. Exact
age is **banded before it leaves the device**: a rare cancer plus a specific
ethnicity plus a small state is re-identifying even with no name attached, so
every quasi-identifier is kept deliberately coarse.

Never collected: name, IC/MyKad, phone, email, address, exact age, date of
birth, free text, IP address, device identifier. `api/submit.js` **refuses**
a record carrying any of those keys rather than quietly stripping them.

### Enabling collection

**[SETUP-COLLECTION.md](SETUP-COLLECTION.md) is the click-by-click guide** —
service account, sharing, environment variables and how to prove it works. Start
there. The summary below is the rationale behind it.


Two flags, both default off. `VITE_COLLECT_ENABLED` controls the UI;
`COLLECTION_ENABLED` is what actually authorises a write, and the server refuses
every request without it — a tampered front end cannot bypass that gate.

Before go-live:

1. MREC/NMRR approval granted, and the reference set in `VITE_NMRR_ID` /
   `VITE_MREC_REF`. The consent screen shows a visible warning until it is.
2. `VITE_DATA_CONTACT` set to a monitored address — it is the withdrawal route.
3. Sheet created in an **institutional Google Workspace account**, link-sharing
   off, shared only with the service account.
4. Header row pasted into row 1, in this exact order:

```
submitted_at	participant_code	app_version	consent_version	language	age_band	sex	ethnicity	state	ever_sexually_active	smoking	smoked_20y	passive_smoke	occupational_hazards	relatives_encoded	n_relatives	n_first_degree	n_second_degree	any_relative_under_50	genetics	risk_colorectal	risk_breast	risk_lung	risk_cervical	risk_npc	symptoms_flagged	n_symptoms_flagged	any_red_flag	summary_generated
```

5. Service account created with **Editor on that one sheet only** — share the
   sheet with its email address; do not grant Drive-wide scope. The Google
   Sheets API must be enabled on that Cloud project.
6. Retention period agreed and `VITE_RETENTION_YEARS` set to match what the
   consent screen promises.
7. **Check the tab name.** `SHEETS_TAB_NAME` defaults to `Submissions` and must
   match the tab exactly, or the append fails with a 502. A sheet created by
   importing a CSV gets a tab called **`Untitled`** regardless of the file name
   — rename the tab, or set `SHEETS_TAB_NAME=Untitled`. This is the single most
   common reason the pipeline looks broken when everything else is correct.

### Verifying the pipeline

```bash
COLLECTION_ENABLED=true node scripts/verify-sheet.mjs
```

Calls the real `api/submit.js` handler, so a pass means the production code path
works — ethics gate, identifier allowlist, service-account JWT and append. It
writes one row marked `participant_code = FCR-TEST-0000` and
`consent_version = PIPELINE-TEST`; **delete it before real collection begins.**

Run this against the sheet while the deployed site still has collection off.
Testing the plumbing with synthetic data needs no ethics approval; collecting
from real patients does.

### The study sheet

Created in the institutional account `ppnaim@moh.gov.my`:
[Family Cancer Risk Check — Study Data (pseudonymised)](https://docs.google.com/spreadsheets/d/1aWzcp4sNKZUuCSqq_qm9EICVndontepq8Gy88-KlCwQ/edit)
(`SHEETS_SPREADSHEET_ID=1aWzcp4sNKZUuCSqq_qm9EICVndontepq8Gy88-KlCwQ`). Header row is in place for the first 28 columns. **Two manual steps remain:**
rename the tab per step 7 below, and type `summary_generated` into cell **AC1**
(added after the sheet was created).

### The `summary_generated` flag

Every consented participant gets a row when their results render, so the
denominator is complete. `summary_generated` then flips from `no` to `yes` in
place if they go on to produce a clinic sheet — the study's "did they act?"
signal.

It is deliberately *not* the trigger for the submission itself. Tying collection
to the print button would have silently dropped every participant who consented
but never printed, which is a biased sample and a quiet one: you would see only
the motivated subset and have no way to know what you were missing.

The update path (`{ markSummary: { participant_code } }`) carries the code and
nothing else. It finds the row by that code and sets one cell, so the endpoint
cannot introduce new data. A code that does not match the format is refused; a
code with no row yet returns 404 and is ignored by the client, since the
submission may still be in flight.

### A standing caution on Google Sheets

Sheets is defensible for a **pseudonymised feasibility dataset** and little
beyond it. It gives no row-level read audit trail, one mis-click on "Anyone with
the link" is a disclosure, the service-account key grants full read/write to
whoever holds it, and the data sits on foreign infrastructure. If the dataset
ever becomes identifiable, it needs a different store — not tighter sharing
settings on this one.

### Known limitation: no rate limiting

`/api/submit` is a public endpoint with no rate limit — adding a real one needs
a KV/Redis store this project does not have. Cross-origin browser POSTs are
blocked by preflight (the endpoint sends no CORS headers), but a direct scripted
POST could flood the sheet with junk rows and pollute the dataset.

For a feasibility study at modest N this is a monitoring problem, not a
build-stopper: watch the row count, and treat a burst of rows sharing a
timestamp minute as suspect. If the study scales up, put a rate limit or a
CAPTCHA in front of it before it matters.

### Feedback form

Separate and unchanged: `/api/feedback` carries no personal or health data.

## Guideline grounding

Every module is either anchored to a named source or carries an explicit flag
saying no guideline backs it. The app never silently guesses.

| Module | Anchoring |
|---|---|
| **Colorectal** | CPG Management of Colorectal Carcinoma (2017) — Rec 1 / Table 4 / Table 5 |
| **Breast** | CPG Management of Breast Cancer (3rd Ed., 2021) — Rec 1 |
| **Lung** | CPG for Peri-operative Management of Resectable Early-Stage NSCLC in Malaysia (1st Ed., April 2025) — Section 1 (Screening) Statements 1–3, Section 2 (Diagnosis) Statement 1 |
| **Cervical** | CPG Management of Cervical Cancer (2nd Ed., 2015), MOH/P/PAK/294.15(GU) — §§3–5 |
| **NPC** | No CPG supplied — flagged provisional |

### Two important scope caveats

**Lung.** Despite its title, the 2025 lung document is an **expert consensus by
Lung Cancer Network Malaysia** with the Malaysian Thoracic Society, MATCVS, the
Malaysian Oncological Society and the College of Surgeons AMM — **not a
MaHTAS/MOH CPG**. Its own abstract states no local CPG existed for lung cancer
care in Malaysia. It covers screening and early-stage NSCLC only, and sets no
screening rule for occupational exposure or second-hand smoke. The app carries
both a source and a scope-narrowing flag, and must never present it as a KKM CPG.

**Cervical.** The 2015 CPG explicitly excludes screening and pre-invasive
disease and contains no HPV vaccine recommendation. Risk factors, warning signs
and referral timeframe are attributed to the CPG; screening intervals and the
HPV vaccine are attributed to Malaysia's **national programme**, not the CPG.

## Public awareness quiz

`PublicQuiz` is a short (8-question) quiz pitched at a level the general public
can answer — one idea per question, everyday wording, no jargon in the stem.
Every answer, explanation and cited source is drawn from the **same anchored
constants** as the result cards (`SOURCE_CRC`, `SOURCE_BREAST`, `SOURCE_LUNG`,
`SOURCE_CERV`, `SOURCE_NPC`), so the quiz can never contradict the plan the app
gives. Add a question by appending to the `QUIZ` array with a `src` pointing at
one of those constants — never at a figure invented for the quiz.

It is labelled throughout as awareness only: not a risk assessment, not medical
advice, and no inference is drawn from the score.

## Ask the CPGs — NotebookLM panel

The earlier free-text AI chat panel (`CpgChat` → `/api/chat`, Anthropic Messages
API with web search) has been **removed** — component, endpoint and
`ANTHROPIC_API_KEY` alike — and replaced by `CpgNotebook`: an embedded link to
a Google NotebookLM notebook whose only sources are the Malaysian CPGs behind
this app. NotebookLM answers strictly from its uploaded sources and cites the
passage used, so a patient cannot be told something the guidelines do not say —
that closed-source grounding is the reason for the swap.

| Constant | Purpose |
|---|---|
| `CPG_NOTEBOOK_URL` | The notebook the panel opens |
| `QUIZ_NOTEBOOK_URL` | The companion NotebookLM quiz artifact, linked from the quiz result |
| `CPG_NOTEBOOK_IFRAME` | `false`. Google blocks third-party framing of NotebookLM (`X-Frame-Options` / `frame-ancestors`), so the panel opens the notebook in a new tab. The `<iframe>` path is wired and ready — flip to `true` if NotebookLM ever permits embedding. |

The panel states its limits plainly: NotebookLM is a Google product outside this
app, it is still AI-generated, it cannot see anything the patient entered here,
and a Google sign-in may be required.

Deleting `/api/chat` was deliberate: it was a metered LLM proxy with no caller
left, and leaving it deployed would have carried a running API cost. The app now
has exactly one serverless function, `/api/feedback`. **Remove `ANTHROPIC_API_KEY`
from Vercel → Settings → Environment Variables** as well — the code no longer
reads it.

## Local development

```bash
npm install
npm run dev
```

`npm run dev` serves the front end only — the `/api/*` serverless functions will
not run. To test the feedback form end to end:

```bash
cp .env.example .env.local   # then fill in real values
npx vercel dev
```

## Environment variables

Set in **Vercel → Settings → Environment Variables** (and `.env.local` for
`vercel dev`). Never commit real values.

See `.env.example` for the collection variables; the table below covers the rest.

| Variable | Purpose |
|---|---|
| `EMAILJS_SERVICE_ID` | Feedback email |
| `EMAILJS_TEMPLATE_ID` | Feedback email |
| `EMAILJS_PUBLIC_KEY` | EmailJS Public Key (User ID) |
| `EMAILJS_PRIVATE_KEY` | EmailJS Private Key — **required** for server-side sends |
| `FEEDBACK_TO_EMAIL` | Optional. Only applies if the EmailJS template's *To Email* is `{{to_email}}` |

## Deploy

Push to `main`; Vercel builds automatically. Framework preset: **Vite**.
Build command `npm run build`, output directory `dist`.

## Development conventions

- Every module gets a `SOURCE_X` cited in its result card, or a `FLAG_X`
  disclaimer if no guideline backs it — never silently guess. A module may carry
  **both** a source and a scope-narrowing flag (lung and cervical both do).
- `L(en, bm)` wrapper for every user-facing string — clinical text included, not
  just UI chrome.
- Privacy copy (`PRIVACY_HUB`, `PRIVACY_GATE`, `PRIVACY_REASON`) switches with
  `COLLECTION_ENABLED`. The app must never promise something it is not doing —
  never hard-code "nothing is saved" back into a site that collects.
- Adding a field to `RESEARCH_FIELDS` needs an **ethics amendment**, not just a
  commit, and must be changed in `src/collection.js` **and** `api/submit.js`.
- New profile fields go in the `useState` init **and** `reset()` **and** (if
  clinically relevant) the `GpSummary` printable doc — all three.
- Quiz answers cite a `SOURCE_X` constant, never a free-standing figure.
- Prefer reusing an existing field or UI pattern over adding a near-duplicate.
- Copyright: CPG and registry documents carry attribution-only licences —
  paraphrase rather than quote verbatim. Factual figures (ages, intervals,
  percentages, ratios) may be stated directly.

## Credits

By Dr Nurul Amiera Asli · National Cancer Institute (IKN), Malaysia.
