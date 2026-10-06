/**
 * collection.js — the research data model, in one auditable file.
 *
 * WHY THIS FILE EXISTS SEPARATELY
 * An ethics committee (MREC, via NMRR) needs to see exactly what leaves the
 * device, without reading a 3,000-line UI component. Everything that is ever
 * transmitted is built by buildResearchRecord() below and nothing else. If a
 * field is not in RESEARCH_FIELDS, it is not collected.
 *
 * GOVERNANCE POSITION
 * The data controller is IKN / KKM, part of the Federal Government. PDPA 2010
 * s.3(1) exempts the Federal and State Governments, so the Act does not bind
 * this collection. What governs it instead: MREC/NMRR ethics approval, MOH
 * data-security and classification directives, and medical confidentiality.
 * PDPA standards are nonetheless applied voluntarily as the design floor —
 * health information is treated as "sensitive personal data" in the PDPA s.4
 * sense throughout, because that is the stricter and more defensible standard.
 *
 * THE PSEUDONYMISATION SPLIT — the core design decision
 * The app produces two outputs with opposite requirements:
 *   1. A printed summary for the patient to bring to Klinik Kesihatan. This
 *      needs their identity. It is rendered in the browser and printed. It is
 *      NEVER transmitted.
 *   2. A research record for analysis. This needs variables, not identity. It
 *      carries a random participant code and no direct identifiers.
 * The only link between the two exists on the paper in the patient's hand.
 * There is no re-identification key on any server, by design. If follow-up or
 * recall is ever required, that is a protocol amendment and a different store
 * — it must not be bolted on here.
 *
 * SMALL-CELL DISCLOSURE RISK
 * Exact age is deliberately NOT collected; it is banded before it leaves the
 * device. A rare cancer plus a specific ethnicity plus a small state can
 * re-identify a person even with no name attached, so the resolution of every
 * quasi-identifier here is kept deliberately coarse.
 */

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

/* Collection is OFF unless explicitly switched on at build time. Ethics
   approval is in progress at the time of writing; nothing may be collected
   until it is granted. The server enforces this independently (see
   api/submit.js) — this flag only controls the UI, and a client cannot talk
   the server into accepting a record. */
export const COLLECTION_ENABLED =
  String(import.meta.env?.VITE_COLLECT_ENABLED ?? "").toLowerCase() === "true";

/* Shown in the participant information sheet. Fill these in from the approval
   letter before go-live; the consent screen renders "pending" until then. */
export const ETHICS = {
  nmrrId: import.meta.env?.VITE_NMRR_ID || "",
  mrecRef: import.meta.env?.VITE_MREC_REF || "",
  controller: import.meta.env?.VITE_DATA_CONTROLLER || "Institut Kanser Negara (IKN), Kementerian Kesihatan Malaysia",
  contactEmail: import.meta.env?.VITE_DATA_CONTACT || "",
  retentionYears: Number(import.meta.env?.VITE_RETENTION_YEARS || 7),
};

/* Bump when the wording of the consent screen changes materially. Stored with
   every record so the analyst can tell which version a participant agreed to. */
export const CONSENT_VERSION = "consent-2026-10-v1";

/* ------------------------------------------------------------------ */
/* Participant code                                                    */
/* ------------------------------------------------------------------ */

/**
 * A random, non-sequential participant code. Printed on the patient's summary
 * and stored with the research record — the only thing tying the two together.
 *
 * Non-sequential on purpose: a running number would leak how many people have
 * taken part and let two records be ordered in time. Crypto RNG, not Math.random,
 * so codes cannot be predicted or replayed.
 */
export function makeParticipantCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 — these are read aloud and hand-copied
  const bytes = new Uint8Array(8);
  (globalThis.crypto || globalThis.msCrypto).getRandomValues(bytes);
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `FCR-${body.slice(0, 4)}-${body.slice(4, 8)}`;
}

/* ------------------------------------------------------------------ */
/* Coarsening helpers — applied BEFORE anything leaves the device       */
/* ------------------------------------------------------------------ */

/** Exact age never leaves the browser. Bands match the screening thresholds
    the guidelines actually use, so nothing analytically useful is lost. */
export function ageBand(age) {
  const a = Number(age);
  if (!a || Number.isNaN(a)) return "unknown";
  if (a < 30) return "u30";
  if (a < 40) return "30-39";
  if (a < 45) return "40-44";
  if (a < 50) return "45-49";
  if (a < 60) return "50-59";
  if (a < 70) return "60-69";
  if (a < 75) return "70-74";
  return "75p";
}

/** Relatives collapse to a compact, order-stable string plus derived counts.
    Free text is impossible here — every component is a fixed vocabulary id. */
function encodeRelatives(relatives) {
  return (relatives || [])
    .map((r) => [r.relationship, r.cancer, r.ageBand || "unknown", r.side || "na"].join(":"))
    .sort()
    .join("|");
}

/* ------------------------------------------------------------------ */
/* The record                                                          */
/* ------------------------------------------------------------------ */

/**
 * The complete list of fields that may ever be transmitted, in sheet-column
 * order. The server validates against this exact list and drops anything else,
 * so adding a field here is a deliberate, reviewable act — and one that needs
 * an ethics amendment, not just a commit.
 */
export const RESEARCH_FIELDS = [
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

/**
 * Build the research record. This is an allowlist, not a filter: it names each
 * field explicitly rather than copying an object and deleting the sensitive
 * parts, so a new profile field cannot leak by accident.
 *
 * Deliberately absent, and to stay absent: name, IC/MyKad, phone, email,
 * address, exact age, date of birth, free-text of any kind, IP address,
 * device identifier.
 */
export function buildResearchRecord({
  participantCode,
  profile,
  relatives,
  genetics,
  results,
  symptoms,
  lang,
  appVersion,
}) {
  const riskOf = (id) => (results.find((r) => r.id === id) || {}).level || "n/a";
  const flagged = Object.keys(symptoms || {}).filter((k) => symptoms[k]);
  const rels = relatives || [];

  return {
    submitted_at: new Date().toISOString(),
    participant_code: participantCode,
    app_version: appVersion,
    consent_version: CONSENT_VERSION,
    language: lang,

    age_band: ageBand(profile.age),
    sex: profile.sex || "unset",
    ethnicity: profile.ethnicity || "unset",
    state: profile.state || "unset",
    ever_sexually_active: profile.everSex || "unset",
    smoking: profile.smoke || "unset",
    smoked_20y: profile.smoke20y ? "yes" : "no",
    passive_smoke: profile.passiveSmoke || "unset",
    occupational_hazards: (profile.occupationalHazards || []).join(";") || "none",

    relatives_encoded: encodeRelatives(rels),
    n_relatives: rels.length,
    n_first_degree: rels.filter((r) => r.degree === 1).length,
    n_second_degree: rels.filter((r) => r.degree === 2).length,
    any_relative_under_50: rels.some((r) => r.ageBand === "u50") ? "yes" : "no",
    genetics: (genetics || []).join(";") || "none",

    risk_colorectal: riskOf("colorectal"),
    risk_breast: riskOf("breast"),
    risk_lung: riskOf("lung"),
    risk_cervical: riskOf("cervical"),
    risk_npc: riskOf("npc"),

    symptoms_flagged: flagged.join(";") || "none",
    n_symptoms_flagged: flagged.length,
    any_red_flag: flagged.length > 0 ? "yes" : "no",
  };
}

/**
 * Post the record. Returns { ok } or { ok:false, error } — the caller shows the
 * participant what happened rather than failing silently, because a person who
 * consented is entitled to know whether their record was actually saved.
 */
export async function submitResearchRecord(record) {
  try {
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: "network" };
  }
}
