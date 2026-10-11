# Reusing this pattern for another clinical web app

What this project turned out to be, stripped of cancer, so the next one can be
built in days instead of weeks. Copy the prompt in §4 into a fresh Claude Code
session and fill in the placeholders.

Written after building the Family Cancer Risk Assistant end to end, including
the parts that went wrong. §6 is the most valuable section — it is a list of
things that cost real days here.

---

## 1. What the pattern actually is

**A guideline-anchored, bilingual, public-facing clinical decision-support tool
that produces a printable sheet for a clinic visit and a pseudonymised research
record for analysis.**

It generalises to anything with this shape:

- A patient or family member answers questions about themselves
- National clinical guidelines say what should happen for that profile
- The person needs to be told, in plain language, what to do next
- They need something to take to a clinician
- You need the data, de-identified, to see whether any of it works

Diabetes and hypertension risk, maternal and child health, mental health
triage, TB contact tracing, post-stroke follow-up, medication adherence — all
the same shape.

---

## 2. The stack, and why

| Layer | Choice | Reason |
|---|---|---|
| Front end | React 18 + Vite | Two dependencies total. No framework to learn or outgrow. |
| Hosting | Vercel | Git push deploys. Free tier is enough. |
| Server | Vercel serverless functions in `/api` | Only for things that must hide a credential. |
| Styling | One CSS string in the component | No Tailwind, no CSS modules. Everything findable in one place. |
| Data store | Google Sheet | The clinician can open it. That matters more than elegance. |
| i18n | A 5-line `L(en, ms)` helper | No i18n library for two languages. |

**Deliberately absent:** TypeScript, a component library, a state manager, a
test framework, a database, an auth system. Each would have been defensible and
each would have slowed the first working version down. Add them when something
actually hurts.

The whole app is ~4,700 lines, of which 3,400 is one component file. That is
unusual and it was right: a single clinician-reviewable file beats forty files
nobody can hold in their head.

---

## 3. The pipeline

```
                        ┌─────────────────────────────────────┐
                        │  PATIENT'S BROWSER                  │
                        │                                     │
  entry disclaimer ───▶ │  consent screen (only if collecting)│
                        │         │                           │
                        │         ▼                           │
                        │  Step 1  About you                  │
                        │  Step 2  Family / history           │
                        │  Step 3  Known conditions           │
                        │         │                           │
                        │         ▼                           │
                        │  RISK ENGINE (pure functions)       │
                        │  profile + history ──▶ level/plan   │
                        │         │                           │
                        │         ▼                           │
                        │  Step 4  Results, sorted by what    │
                        │          needs acting on            │
                        │         │                           │
                        │    ┌────┴─────┐                     │
                        │    ▼          ▼                     │
                        │  PRINTED    RESEARCH                │
                        │  SHEET      RECORD                  │
                        │  name, IC   code + banded vars      │
                        │  NEVER      │                       │
                        │  SENT       │                       │
                        └─────────────┼───────────────────────┘
                                      │ POST /api/submit
                                      ▼
                        ┌─────────────────────────────────────┐
                        │  SERVER  (the only gate that counts)│
                        │  1. collection enabled?  else 503   │
                        │  2. identifier keys?     else 400   │
                        │  3. allowlist to N fields           │
                        └─────────────┼───────────────────────┘
                                      ▼
                     one of: Sheets API / Apps Script / email
                                      ▼
                            ┌──────────────────┐
                            │  GOOGLE SHEET    │
                            │  one row each    │
                            └──────────────────┘
```

### The two outputs, and why they are split

This is the single most important design decision in the project.

The printed sheet needs the patient's **identity**. The research record needs
their **variables**. Those are opposite requirements, so they are kept apart:
identifiers are rendered in the browser and printed, never transmitted; the
research record carries a random participant code and banded variables.

The only link between them is the code on the paper in the patient's hand.
There is no re-identification key on any server. That also gives you a clean
withdrawal route: a participant quotes their code, you delete that row, and
nobody else can find it.

---

## 4. The prompt

Copy this into a fresh Claude Code session. Replace everything in `<ANGLE
BRACKETS>`.

````
Build a bilingual (English / <SECOND LANGUAGE>) public-facing clinical
decision-support web app: <APP NAME>.

PURPOSE
<One paragraph: who uses it, what they put in, what they get out.>
Example: "A patient or family member answers questions about <INPUTS>. The app
tells them their <RISK/STATUS>, what to do next, and produces a printable sheet
to bring to <CLINIC TYPE>."

STACK — keep it this small on purpose
- React 18 + Vite. Dependencies: react, react-dom, @vitejs/plugin-react, vite.
  Nothing else without asking me first.
- Deployed on Vercel. Serverless functions in /api, only where a credential
  must stay off the client.
- All styling as one CSS template string inside the main component. No Tailwind,
  no CSS modules, no component library.
- No TypeScript, no state manager, no test framework for v1.
- The main component may be a single large file. Prefer that over many small
  files: a clinician has to be able to review it.

NON-NEGOTIABLE RULES

1. EVERY clinical statement is anchored or flagged.
   Each module carries either a named source (`SOURCE_X`, the exact guideline,
   edition, year and section) rendered in the output, or an explicit flag
   saying no guideline backs it. Never silently guess a threshold, an age, an
   interval or a referral timeframe. If a guideline does not cover something,
   say so in the output.
   Where a source is a society consensus rather than a ministry guideline, say
   which it is — never blur the two.

2. EVERY user-facing string goes through `const L = (en, xx) => ({ en, xx })`
   and `pick(v, lang)`. Clinical text included, not just UI chrome.

3. Separate the risk engine from the presentation.
   Pure functions take (profile, history, conditions) and return
   { id, level, steps[], source, flag, icd }. No JSX in them. They must be
   testable and reviewable on their own, and a clinician must be able to read
   them without reading any UI code.

4. Results are sorted by what needs acting on — reported warning sign first,
   then highest risk to lowest. Items with nothing to act on start folded, not
   deleted. Never remove clinical content to reduce clutter; fold it.

5. The app never promises something it is not doing. If data collection is
   switched off, the privacy copy says nothing is stored. If it is on, the same
   copy says what is stored. One flag changes both; there is no state where
   they disagree.

BUILD IN THIS ORDER — stop after each and show me
Phase 1  Risk engine + the source constants. No UI. Show me the functions
         and the exact guideline citation for each threshold.
Phase 2  The question flow (stepper) and the results screen.
Phase 3  The printable clinic summary.
Phase 4  Research collection (see below).
Phase 5  Feedback form.

RESEARCH COLLECTION — build it like this

- Put the ENTIRE data model in one file, src/collection.js, so an ethics
  reviewer can see what leaves the device without reading the UI.
- Pseudonymised only. A random participant code (crypto RNG, not Math.random,
  alphabet excluding I/O/0/1 because it gets read aloud). Band every
  quasi-identifier BEFORE it leaves the browser — exact age never goes.
- Identifiers for the printed sheet live in browser memory and are never
  transmitted. Say so on screen, next to the fields.
- The outgoing record is an ALLOWLIST of named fields, never an object with
  sensitive keys deleted — a new field must not be able to leak by accident.
- The server refuses any record containing name, IC, phone, email, address,
  date of birth or exact age, rather than stripping them. Loud, not quiet.
- TWO FLAGS: a client flag controls the UI, a server flag authorises the write.
  The server flag is authoritative, so "ethics approval pending" is an
  enforceable state and not a UI convention. Both default to OFF.
- Consent is asked ONCE, before any question is answered, and only when
  collection is on. DECLINING MUST BE A FIRST-CLASS OUTCOME: the clinical tool
  and the printable summary behave identically either way. This is an ethics
  requirement, not a courtesy.
- Submit automatically when results render, not behind a button. A button loses
  everyone who consented and did not press it, and you cannot count what you
  lost. Show a visible status line so it is not covert.

GOVERNANCE — get this right before writing code
Ask me who the data controller is, because it changes the legal frame:
- A government body in Malaysia is EXEMPT from PDPA 2010 under s.3(1). What
  binds it instead is research ethics approval (MREC via NMRR), ministry data
  directives and medical confidentiality. Do NOT write "stored in accordance
  with PDPA" for a government controller — it is inaccurate. Write that PDPA
  standards are applied voluntarily as the minimum, which is both true and
  stronger.
- A non-government controller IS bound by PDPA in full: health data is
  sensitive personal data, explicit consent required, DPO and breach
  notification duties since the 2024 amendments.
Ask me whether the clinical logic is described in the ethics submission. If it
is, any change to a computed output may need a protocol amendment, and you must
tell me before changing one.

DESTINATION — ask me which, and expect the first to be blocked
(a) Google Sheets API via a service account. Best, but needs Google Cloud
    Platform access, which government Workspace tenants often disable.
(b) Apps Script Web App deployed from the sheet. Apps Script is a WORKSPACE
    service, not Cloud Platform, so it usually survives that block. Same sheet,
    no Cloud Console, no key file. Protect it with a shared secret, because a
    Web App set to "Anyone" is reachable by URL alone.
(c) Email fallback, carrying a tab-separated line that pastes into a sheet in
    one action. Always works, does not scale.
Build the server so it picks whichever is configured, and write a setup()
function in the Apps Script that prepares the sheet itself rather than making
me rename tabs and type headers by hand.

WHAT I EXPECT FROM YOU
- Run the app in a browser and verify changes before telling me they work.
- Tell me when something I asked for is wrong, and why, before building it.
- Check claims against the code rather than agreeing with my description of it.
- Never merge without asking me.
````

---

## 5. What to change per domain

| Keep as-is | Rewrite per domain |
|---|---|
| `L()` / `pick()` i18n | The question flow |
| Stepper, entry gate, modal patterns | The risk engine and its sources |
| `collection.js` structure and the allowlist | The field list |
| `api/submit.js` and all three destinations | — |
| The Apps Script and its `setup()` | The column list (3 places) |
| Printable summary layout | Its clinical content |
| Consent screen structure | Study-specific wording |
| Mode-aware privacy copy | — |

The column list lives in **three** places — `src/collection.js`,
`api/submit.js` and the Apps Script. Keep them identical and in the same order,
and have a check that fails loudly when they drift.

---

## 6. Traps — the expensive lessons

Ranked by how much time each cost.

1. **Google Cloud Platform is often blocked for government Workspace users.**
   `console.cloud.google.com` answers *"you do not have access"*. It is an
   organisation policy and nothing can be done from the user's side. **Try
   Apps Script first** — it is a different service and usually works.

2. **A sheet created by importing a CSV gets a tab called `Untitled`**,
   whatever the file is named. Every API write then fails with an opaque 502
   while everything else looks perfect. Have the Apps Script `setup()` rename
   it rather than asking a human to.

3. **Vercel environment variables do nothing until you redeploy.** `VITE_`
   values are compiled in at build time. This looks exactly like "the variables
   did not save".

4. **`VITE_` variables are public.** They are compiled into the JavaScript
   bundle that anyone can read. Never put a secret in one, and mark them Config
   rather than Secret so you are not hiding them from yourself.

5. **A service-account private key must keep its `\n` sequences**, copied
   verbatim from the JSON including the BEGIN/END lines, wrapped in quotes.
   Reformatting it into real line breaks fails at the signer with a useless
   error.

6. **Don't capture a field you cannot set.** A "did they print the summary?"
   flag recorded when the results render is always "no", which is worse than
   not having it, because an analyst will believe it. Either give it a
   mechanism to be updated later, or leave it out.

7. **Ask who the data controller is before writing any privacy copy.** Getting
   the legal frame wrong means rewriting every consent string.

8. **Order the results page by urgency from the start.** A fixed order means a
   patient with a strong family history of one condition reads two irrelevant
   cards before reaching the one that matters.

---

## 7. Verify like this

No test framework was used. What was used instead, and worked:

- **Playwright driving the real app** for every user-facing change. Assert on
  what the user sees, and on what the network does — the strongest assertion in
  this project was *"type a name into the local field and confirm it appears in
  no outbound payload"*.
- **Direct handler tests** for the serverless functions: import the handler,
  call it with a mock req/res, assert the status. No server needed. This caught
  every gate failure.
- **A drift check** that the field list is identical across all three places.
- **A one-click self-test inside the Apps Script** (`testPost()`), so the
  person setting it up can prove the pipeline without a terminal.

A test that bypasses the real handler proves nothing about what you are about
to deploy.
