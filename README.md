# Family Cancer Risk Assistant — Malaysia

A public-facing, bilingual (English / Bahasa Malaysia) family cancer risk screening
prototype for Malaysia, covering colorectal, breast, lung, cervical and
nasopharyngeal (NPC) cancer.

Features a pedigree builder, symptom red-flag checker, GP-summary export, an
AI guideline Q&A panel, a feedback form, and a landing page with a national
registry data snapshot.

> **This is a research and education prototype. It supports decisions; it does
> not replace a doctor and does not diagnose.**

## Data handling

Session-only. No name, IC, phone number or contact detail is ever collected
(PDPA-minimised). Nothing is stored or transmitted except the anonymous
feedback form, which carries no personal or health data.

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

## Local development

```bash
npm install
npm run dev
```

`npm run dev` serves the front end only — the `/api/*` serverless functions will
not run. To test the chat and feedback form end to end:

```bash
cp .env.example .env.local   # then fill in real values
npx vercel dev
```

## Environment variables

Set in **Vercel → Settings → Environment Variables** (and `.env.local` for
`vercel dev`). Never commit real values.

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Powers the CPG Q&A chat panel via `/api/chat` |
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
- New profile fields go in the `useState` init **and** `reset()` **and** (if
  clinically relevant) the `CpgChat` context string **and** the `GpSummary`
  printable doc — all four.
- Prefer reusing an existing field or UI pattern over adding a near-duplicate.
- Copyright: CPG and registry documents carry attribution-only licences —
  paraphrase rather than quote verbatim. Factual figures (ages, intervals,
  percentages, ratios) may be stated directly.

## Credits

By Dr Nurul Amiera Asli · National Cancer Institute (IKN), Malaysia.
