import React, { useState, useMemo } from "react";

/**
 * Family Cancer Risk Assistant — Malaysia (Prototype)
 * -----------------------------------------------------
 * Public-facing screening-guidance prototype for the top common cancers.
 *
 * Grounding (RAG-first intent):
 *  - Colorectal recommendations are taken from
 *    CPG Management of Colorectal Carcinoma (2017), Recommendation 1 / Table 4 / Table 5.
 *  - Breast recommendations are taken from
 *    CPG Management of Breast Cancer (3rd Edition, 2021), Recommendation 1.
 *  - Lung recommendations are taken from the Clinical Practice Guidelines for
 *    Peri-operative Management of Resectable Early-Stage NSCLC in Malaysia
 *    (1st Ed., April 2025), Lung Cancer Network Malaysia / MTS / MATCVS / MOS /
 *    College of Surgeons AMM — Section 1 (Screening) Statements 1-3 and
 *    Section 2 (Diagnosis) Statement 1. NOTE: this is a society expert consensus,
 *    NOT a MaHTAS/MOH CPG — carries both a source and a scope-narrowing flag.
 *  - Cervical recommendations are taken from CPG Management of Cervical Cancer
 *    (2nd Ed., 2015), Sections 3-5 — also scope-narrowed (no screening/vaccine).
 *  - Nasopharyngeal (NPC) is anchored to CPG Management of Nasopharyngeal
 *    Carcinoma (2016), MaHTAS/MOH, MOH/P/PAK/326.16(GU) — a genuine KKM CPG
 *    (developed with MSO-HNS and Academy of Medicine Malaysia), so NO society-
 *    consensus caveat. Scope-narrowed: the CPG explicitly does NOT recommend
 *    population screening (§2.3 — EBV serology and nasoendoscopy judged to have
 *    insufficient evidence), so guidance is symptom-triggered referral, not a
 *    screening schedule. Referral timeframe is "as soon as possible" (consensus,
 *    Rec 1), not a fixed week-count. NPC stays level:"info" (no risk tier).
 *
 * Data handling: session-only. No name / IC / phone / contact is ever collected
 * (PDPA-minimised). Nothing is stored or transmitted.
 *
 * This tool supports clinical decision-making. It does not replace a doctor.
 */

/* ------------------------------------------------------------------ */
/* Tiny i18n helper                                                    */
/* ------------------------------------------------------------------ */
const L = (en, bm) => ({ en, bm });
const pick = (v, lang) => (v && typeof v === "object" && "en" in v ? v[lang] : v);

/* ------------------------------------------------------------------ */
/* Branding / attribution — edit here in one place                     */
/* ------------------------------------------------------------------ */
const APP_VERSION = "v1";
const APP_OWNER = L(
  "By Dr Nurul Amiera Asli · National Cancer Institute (IKN), Malaysia",
  "Oleh Dr Nurul Amiera Asli · Institut Kanser Negara (IKN), Malaysia"
);

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

const RELATIONSHIPS = [
  { id: "mother", degree: 1, label: L("Mother", "Ibu") },
  { id: "father", degree: 1, label: L("Father", "Bapa") },
  { id: "sister", degree: 1, label: L("Sister", "Adik/kakak perempuan") },
  { id: "brother", degree: 1, label: L("Brother", "Adik/abang lelaki") },
  { id: "daughter", degree: 1, label: L("Daughter", "Anak perempuan") },
  { id: "son", degree: 1, label: L("Son", "Anak lelaki") },
  { id: "grandmother", degree: 2, label: L("Grandmother", "Nenek") },
  { id: "grandfather", degree: 2, label: L("Grandfather", "Datuk") },
  { id: "aunt", degree: 2, label: L("Aunt", "Emak saudara / Mak cik") },
  { id: "uncle", degree: 2, label: L("Uncle", "Bapa saudara / Pak cik") },
  { id: "niece", degree: 2, label: L("Niece", "Anak saudara perempuan") },
  { id: "nephew", degree: 2, label: L("Nephew", "Anak saudara lelaki") },
];

const CANCER_CHOICES = [
  { id: "colorectal", emoji: "🚽", label: L("Colorectal (bowel)", "Kolorektal (usus)") },
  { id: "breast", emoji: "🎗️", label: L("Breast", "Payudara") },
  { id: "ovarian", emoji: "🌺", label: L("Ovarian", "Ovari") },
  { id: "lung", emoji: "🫁", label: L("Lung", "Paru-paru") },
  { id: "cervical", emoji: "🌸", label: L("Cervical", "Serviks") },
  { id: "npc", emoji: "👃", label: L("Nasopharyngeal (nose/throat)", "Nasofarinks (hidung/tekak)") },
];

const AGE_BANDS = [
  { id: "u50", label: L("Under 50", "Bawah 50") },
  { id: "50s", label: L("50 – 59", "50 – 59") },
  { id: "60p", label: L("60 or older", "60 atau lebih") },
  { id: "unknown", label: L("Not sure", "Tidak pasti") },
];

const GENETIC_FLAGS = [
  { id: "lynch", label: L("Lynch syndrome (HNPCC)", "Sindrom Lynch (HNPCC)") },
  { id: "fap", label: L("FAP / familial polyposis", "FAP / poliposis keluarga") },
  { id: "brca", label: L("BRCA1 or BRCA2", "BRCA1 atau BRCA2") },
  { id: "palb", label: L("PALB2 or TP53", "PALB2 atau TP53") },
  { id: "other_gi", label: L("Peutz-Jeghers, juvenile polyposis or MAP", "Peutz-Jeghers, poliposis juvenil atau MAP") },
];

const OCCUPATIONAL_HAZARDS = [
  { id: "asbestos", label: L("Asbestos (old buildings, shipyard, demolition, brake/pipe work)", "Asbestos (bangunan lama, limbungan kapal, perobohan, kerja brek/paip)") },
  { id: "silica", label: L("Silica / stone dust (quarry, mining, construction, sandblasting)", "Debu silika / batu (kuari, lombong, pembinaan, sandblasting)") },
  { id: "diesel", label: L("Heavy diesel exhaust (driver, mechanic, warehouse, mining)", "Wap diesel berat (pemandu, mekanik, gudang, lombong)") },
  { id: "chemical", label: L("Industrial chemicals or fumes (factory, welding, painting, chemical plant)", "Bahan kimia/wap industri (kilang, kimpalan, mengecat, loji kimia)") },
  { id: "other", label: L("Some other workplace exposure I'm concerned about", "Pendedahan tempat kerja lain yang saya risaukan") },
  { id: "not_sure", label: L("Not sure", "Tidak pasti") },
];

const ETHNICITIES = [
  { id: "malay", label: L("Malay", "Melayu") },
  { id: "chinese", label: L("Chinese", "Cina") },
  { id: "indian", label: L("Indian", "India") },
  { id: "other", label: L("Other", "Lain-lain") },
];

const STATES = [
  "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
  "Perak", "Perlis", "Pulau Pinang", "Sabah", "Sarawak", "Selangor",
  "Terengganu", "W.P. Kuala Lumpur", "W.P. Labuan", "W.P. Putrajaya",
];

/* Risk levels --------------------------------------------------------*/
const RISK = {
  average: {
    key: "average",
    tone: "green",
    label: L("Average risk", "Risiko biasa"),
    blurb: L(
      "Your family history does not raise your risk above the general public.",
      "Sejarah keluarga anda tidak menaikkan risiko melebihi orang awam biasa."
    ),
  },
  moderate: {
    key: "moderate",
    tone: "amber",
    label: L("Moderate risk", "Risiko sederhana"),
    blurb: L(
      "Your family history puts you a step above average. You may need to start screening earlier.",
      "Sejarah keluarga anda menaikkan risiko sedikit. Anda mungkin perlu mula saringan lebih awal."
    ),
  },
  high: {
    key: "high",
    tone: "red",
    label: L("Higher risk", "Risiko tinggi"),
    blurb: L(
      "Your family history is a strong signal. Please speak to a doctor about earlier and closer checks.",
      "Sejarah keluarga anda adalah petunjuk kuat. Sila jumpa doktor untuk pemeriksaan lebih awal dan kerap."
    ),
  },
  info: { key: "info", tone: "teal", label: L("Good to know", "Perlu tahu"), blurb: L("", "") },
};

/* ------------------------------------------------------------------ */
/* Warning signs                                                       */
/* ------------------------------------------------------------------ */
const CONSTITUTIONAL = L(
  "Losing weight without trying, feeling very tired for no reason, fevers that don't go away, or night sweats.",
  "Berat badan turun tanpa sebab, terlalu letih tanpa sebab, demam berpanjangan, atau berpeluh pada waktu malam."
);

const WARNING = {
  colorectal: L(
    "A change in your toilet habits (looser or harder stool), blood in your stool, or feeling tired and pale (low iron).",
    "Perubahan tabiat buang air besar (cirit atau keras), darah dalam najis, atau letih dan pucat (kurang zat besi)."
  ),
  breast: L(
    "A new lump in the breast or armpit, skin dimpling or puckering, or discharge from the nipple.",
    "Ketulan baru pada payudara atau ketiak, kulit berlekuk, atau lelehan dari puting."
  ),
  lung: L(
    "A cough that lasts more than 3 weeks, coughing up blood, or chest pain.",
    "Batuk lebih 3 minggu, batuk berdarah, atau sakit dada."
  ),
  cervical: L(
    "Bleeding after sex, bleeding between periods or after menopause, unusual or persistent vaginal discharge, or ongoing lower-tummy pain.",
    "Pendarahan selepas seks, pendarahan antara haid atau selepas putus haid, lelehan faraj luar biasa atau berterusan, atau sakit bawah perut yang berpanjangan."
  ),
  npc: L(
    "A painless lump in the neck (often the first sign), blood-stained mucus from the nose or nosebleeds, a blocked nose or ear on one side, or hearing loss / ringing in one ear. As the cancer grows it can also cause a lasting one-sided headache, numbness of the face, or double vision.",
    "Ketulan di leher yang tidak sakit (selalu tanda pertama), hingus berdarah atau mimisan, hidung atau telinga tersumbat sebelah, atau hilang pendengaran / berdengung sebelah. Apabila kanser membesar ia juga boleh menyebabkan sakit kepala sebelah yang berpanjangan, kebas muka, atau penglihatan berganda."
  ),
};

/* ------------------------------------------------------------------ */
/* Targeted symptom items (post-results red-flag check)                */
/* Grounded in the WARNING text above, split into tickable items.      */
/* These are SUBACUTE red flags → prompt (≈2-week) review, NOT the     */
/* acute "call 999" set, which stays in the emergency button.          */
/* ------------------------------------------------------------------ */
const SYMPTOMS = {
  colorectal: [
    { id: "crc_bowel", label: L("A lasting change in bowel habit — looser or harder than usual for more than a few weeks", "Perubahan tabiat buang air besar berpanjangan — lebih cair atau keras dari biasa lebih dari beberapa minggu") },
    { id: "crc_blood", label: L("Blood in your stool, or bleeding from the back passage", "Darah dalam najis, atau pendarahan dari dubur") },
    { id: "crc_anaemia", label: L("Feeling unusually tired or looking pale (possible low iron)", "Rasa luar biasa letih atau kelihatan pucat (mungkin kurang zat besi)") },
    { id: "crc_pain", label: L("A lump or ongoing pain in the tummy", "Ketulan atau sakit berterusan di perut") },
  ],
  breast: [
    { id: "br_lump", label: L("A new lump in the breast or armpit", "Ketulan baru pada payudara atau ketiak") },
    { id: "br_skin", label: L("Skin dimpling, puckering or redness on the breast", "Kulit payudara berlekuk, berkedut atau kemerahan") },
    { id: "br_nipple", label: L("Nipple discharge (especially blood-stained), or a newly pulled-in nipple", "Lelehan puting (terutama berdarah), atau puting tertarik ke dalam yang baru") },
  ],
  lung: [
    { id: "lu_cough", label: L("A cough that has lasted more than 3 weeks", "Batuk yang berlarutan lebih dari 3 minggu") },
    { id: "lu_blood", label: L("Coughing up blood", "Batuk berdarah") },
    { id: "lu_chest", label: L("Ongoing chest pain or breathlessness", "Sakit dada berterusan atau sesak nafas") },
  ],
  cervical: [
    { id: "cx_postcoital", label: L("Bleeding after sex", "Pendarahan selepas hubungan seks") },
    { id: "cx_discharge", label: L("Unusual or persistent vaginal discharge", "Lelehan faraj luar biasa atau berterusan") },
    { id: "cx_abnormal", label: L("Bleeding between periods, or any bleeding after menopause", "Pendarahan antara haid, atau sebarang pendarahan selepas putus haid") },
    { id: "cx_pain", label: L("Ongoing pain in the lower tummy or pelvis", "Sakit berterusan di bawah perut atau pelvis") },
  ],
  npc: [
    { id: "npc_neck", label: L("A painless lump in the neck", "Ketulan di leher yang tidak sakit") },
    { id: "npc_nose", label: L("Blood-stained mucus from the nose, or repeated nosebleeds", "Hingus berdarah, atau mimisan berulang") },
    { id: "npc_block", label: L("A blocked nose or ear on one side, or hearing loss / ringing in one ear", "Hidung atau telinga tersumbat sebelah, atau hilang pendengaran / berdengung sebelah") },
  ],
};

const GENERAL_SYMPTOMS = [
  { id: "gen_wtloss", label: L("Losing weight without trying", "Berat badan turun tanpa sebab") },
  { id: "gen_tired", label: L("Feeling very tired for no clear reason", "Terlalu letih tanpa sebab yang jelas") },
  { id: "gen_fever", label: L("Fevers that don't go away", "Demam yang tidak hilang") },
  { id: "gen_sweats", label: L("Drenching night sweats", "Berpeluh lebat pada waktu malam") },
];

/* ------------------------------------------------------------------ */
/* Screening plans (grounded / flagged)                                */
/* ------------------------------------------------------------------ */
// step type: doctor | test | interval | watch | seek
const P = (icon, title, body) => ({ icon, title, body });

const SOURCE_CRC = "CPG Management of Colorectal Carcinoma (2017), Recommendation 1 / Table 4 / Table 5";
const SOURCE_BREAST = "CPG Management of Breast Cancer (3rd Edition, 2021), Recommendation 1";
const SOURCE_LUNG = "Clinical Practice Guidelines for Peri-operative Management of Resectable Early-Stage Non-Small Cell Lung Cancer in Malaysia (1st Edition, April 2025) — Lung Cancer Network Malaysia / Malaysian Thoracic Society / MATCVS / Malaysian Oncological Society / College of Surgeons, AMM — Section 1 (Screening) Statements 1–3, and Section 2 (Diagnosis) Statement 1";
const FLAG_LUNG = L(
  "ℹ️ The screening ages, smoking-duration threshold, family-history rule, choice of scan and 2-week referral timeframe here are anchored to Malaysia's first lung cancer guidelines (2025), an expert consensus by Lung Cancer Network Malaysia and partner societies — not a MaHTAS/MOH CPG. That document covers screening and early-stage NSCLC only; it does not cover small cell lung cancer or advanced disease. It also sets no screening rule based on workplace exposure or second-hand smoke alone, so those parts below are precautionary prompts to talk to a doctor, not guideline eligibility.",
  "ℹ️ Umur saringan, ambang tempoh merokok, peraturan sejarah keluarga, pilihan imbasan dan tempoh rujukan 2 minggu di sini berpaut pada garis panduan kanser paru-paru pertama Malaysia (2025), satu konsensus pakar oleh Lung Cancer Network Malaysia dan persatuan rakan — bukan CPG MaHTAS/KKM. Dokumen itu meliputi saringan dan NSCLC peringkat awal sahaja; ia tidak meliputi kanser paru-paru sel kecil atau penyakit lanjut. Ia juga tidak menetapkan peraturan saringan berdasarkan pendedahan tempat kerja atau asap rokok orang lain sahaja, jadi bahagian tersebut di bawah adalah galakan berjumpa doktor, bukan kelayakan garis panduan."
);
const SOURCE_CERV = "CPG Management of Cervical Cancer (2nd Edition, 2015), MaHTAS/MOH · MOH/P/PAK/294.15(GU) — Sections 3–5 (risk factors, clinical presentation, referral)";
const FLAG_CERV = L(
  "ℹ️ The risk factors, warning signs and referral advice here are anchored to the Malaysian CPG Management of Cervical Cancer (2nd Ed., 2015). That guideline covers diagnosis and treatment — it does not set screening intervals or vaccine policy. The screening schedule and HPV vaccine details below come from Malaysia's national programme, not this CPG, and should be confirmed with your clinic.",
  "ℹ️ Faktor risiko, tanda amaran dan nasihat rujukan di sini berpaut pada CPG Pengurusan Kanser Serviks Malaysia (Edisi ke-2, 2015). Garis panduan itu meliputi diagnosis dan rawatan — ia tidak menetapkan selang saringan atau dasar vaksin. Jadual saringan dan maklumat vaksin HPV di bawah datang daripada program kebangsaan Malaysia, bukan CPG ini, dan perlu disahkan dengan klinik anda."
);
const SOURCE_NPC = "CPG Management of Nasopharyngeal Carcinoma (2016), MaHTAS/MOH · MOH/P/PAK/326.16(GU) — §2.2 (risk factors), §2.3 (screening), §3 / Recommendation 1 (clinical presentation & referral), §4 / Recommendation 2 (investigations)";
const FLAG_NPC = L(
  "ℹ️ The risk factors, warning signs and referral advice here are anchored to the Malaysian CPG Management of Nasopharyngeal Carcinoma (2016). That guideline covers diagnosis, staging, treatment and follow-up — it does NOT recommend a population screening programme: it reviewed EBV blood tests and nasal-camera screening and found insufficient evidence to screen people who have no symptoms (§2.3). So the guidance below is about acting early on warning signs and family history, not a routine screening schedule. The guideline asks for referral to an ENT specialist \"as soon as possible\" rather than a fixed time limit.",
  "ℹ️ Faktor risiko, tanda amaran dan nasihat rujukan di sini berpaut pada CPG Pengurusan Karsinoma Nasofarinks Malaysia (2016). Garis panduan itu meliputi diagnosis, pementasan, rawatan dan susulan — ia TIDAK mengesyorkan program saringan populasi: ia menilai ujian darah EBV dan saringan kamera hidung dan mendapati bukti tidak mencukupi untuk menyaring orang yang tiada simptom (§2.3). Jadi panduan di bawah adalah tentang bertindak awal pada tanda amaran dan sejarah keluarga, bukan jadual saringan rutin. Garis panduan meminta rujukan kepada pakar ENT \"secepat mungkin\" dan bukan had masa yang tetap."
);

/* ------------------------------------------------------------------ */
/* Slogan                                                              */
/* ------------------------------------------------------------------ */
const SLOGAN = L("We are here to help", "Kami di sini untuk membantu");

/* ------------------------------------------------------------------ */
/* National Cancer Registry snapshot (data-visualisation source)       */
/* All figures below are taken verbatim from:                          */
/*   Summary of the Malaysia National Cancer Registry Report           */
/*   2017–2021 (MOH / Institut Kanser Negara), MOH/P/IKN/11.24(AR).     */
/* Facts (rates, %, ratios) are reproduced as-is; nothing is inferred. */
/* ------------------------------------------------------------------ */
const SOURCE_NCR = L(
  "Summary of the Malaysia National Cancer Registry Report 2017–2021, Institut Kanser Negara (IKN), Ministry of Health Malaysia · MOH/P/IKN/11.24(AR)",
  "Ringkasan Laporan Pendaftaran Kanser Kebangsaan Malaysia 2017–2021, Institut Kanser Negara (IKN), Kementerian Kesihatan Malaysia · MOH/P/IKN/11.24(AR)"
);

// Lifetime risk = probability of cancer before age 75 (registry definition).
const NCR_LIFETIME = L("1 in 8", "1 daripada 8");

// Crude number diagnosed per 100,000 population, 2017–2021 (up from 2012–2016).
const NCR_RATE = { maleNow: 107.3, malePrev: 86.1, femaleNow: 120.8, femalePrev: 101.6 };

// Top 10 cancers, 2017–2021, as % of all cancers (both sexes).
const NCR_TOP10 = [
  { name: L("Breast", "Payudara"), pct: 17.6 },
  { name: L("Colorectal", "Kolorektal"), pct: 14.1 },
  { name: L("Lung, trachea & bronchus", "Paru-paru, trakea & bronkus"), pct: 10.1 },
  { name: L("Lymphoma", "Limfoma"), pct: 5.2 },
  { name: L("Liver", "Hati"), pct: 4.9 },
  { name: L("Prostate", "Prostat"), pct: 3.8 },
  { name: L("Leukaemia", "Leukemia"), pct: 3.7 },
  { name: L("Nasopharynx", "Nasofarinks"), pct: 3.1 },
  { name: L("Corpus uteri", "Korpus uteri"), pct: 3.0 },
  { name: L("Ovary", "Ovari"), pct: 2.8 },
];

// Top 5 by sex, age-standardised rate (ASR, world) per 100,000, 2017–2021.
const NCR_MALE5 = [
  { name: L("Colorectal", "Kolorektal"), asr: 18.8 },
  { name: L("Lung, trachea & bronchus", "Paru-paru, trakea & bronkus"), asr: 16.0 },
  { name: L("Prostate", "Prostat"), asr: 9.3 },
  { name: L("Liver", "Hati"), asr: 8.4 },
  { name: L("Lymphoma", "Limfoma"), asr: 6.9 },
];
const NCR_FEMALE5 = [
  { name: L("Breast", "Payudara"), asr: 38.9 },
  { name: L("Colorectal", "Kolorektal"), asr: 13.7 },
  { name: L("Lung, trachea & bronchus", "Paru-paru, trakea & bronkus"), asr: 7.4 },
  { name: L("Corpus uteri", "Korpus uteri"), asr: 6.7 },
  { name: L("Ovary", "Ovari"), asr: 6.2 },
];

// Lifetime risk by ethnicity, 2017–2021 (all cancers, before age 75).
const NCR_ETH = {
  male: [
    { eth: L("Chinese", "Cina"), risk: L("1 in 6", "1 drpd 6") },
    { eth: L("Indian", "India"), risk: L("1 in 9", "1 drpd 9") },
    { eth: L("Malay", "Melayu"), risk: L("1 in 11", "1 drpd 11") },
  ],
  female: [
    { eth: L("Chinese", "Cina"), risk: L("1 in 7", "1 drpd 7") },
    { eth: L("Indian", "India"), risk: L("1 in 7", "1 drpd 7") },
    { eth: L("Malay", "Melayu"), risk: L("1 in 9", "1 drpd 9") },
  ],
};

// Smoking-linked signal from the registry: lung cancer is caught very late.
// Late stage = Stage 3 & 4 at diagnosis, males, 2017–2021.
const NCR_LATESTAGE = [
  { name: L("Lung (male)", "Paru-paru (lelaki)"), late: 95.4 },
  { name: L("Colorectal (male)", "Kolorektal (lelaki)"), late: 74.9 },
  { name: L("Prostate", "Prostat"), late: 67.0 },
];

// NOTE ON FAMILY HISTORY:
// The registry summary does NOT report the proportion of cancers with a
// strong family history, so we do not fabricate a Malaysian figure here.
// Instead we flag this honestly and point users to why family history matters.
const NCR_FAMHX_FLAG = L(
  "The national registry does not publish how many cancers run in families. Internationally, roughly 5–10% of cancers are linked to a strong inherited family history — and these are exactly the ones early screening can catch. This app helps you find out if yours might be one of them.",
  "Pendaftaran kebangsaan tidak menerbitkan berapa banyak kanser yang menurun dalam keluarga. Di peringkat antarabangsa, kira-kira 5–10% kanser dikaitkan dengan sejarah keluarga yang kuat — dan inilah yang boleh dikesan awal melalui saringan. Aplikasi ini membantu anda mengetahui sama ada kanser keluarga anda tergolong dalamnya."
);

/* ------------------------------------------------------------------ */
/* Risk engines                                                        */
/* ------------------------------------------------------------------ */
function relCancer(relatives, cancerId) {
  return relatives.filter((r) => r.cancer === cancerId);
}
function hasYoung(list) {
  return list.some((r) => r.ageBand === "u50");
}

function colorectalRisk(relatives, genetics) {
  const crc = relCancer(relatives, "colorectal");
  const syndrome = ["lynch", "fap", "other_gi"].some((g) => genetics.includes(g));
  if (syndrome || hasYoung(crc)) return "high";
  const fdr = crc.filter((r) => r.degree === 1);
  if (fdr.length >= 1) return "moderate";
  return "average";
}

function breastRisk(relatives, genetics) {
  const carrier = ["brca", "palb"].some((g) => genetics.includes(g));
  const bo = relatives.filter((r) => r.cancer === "breast" || r.cancer === "ovarian");
  const fdrBO = bo.filter((r) => r.degree === 1);
  if (carrier) return "high";
  if (fdrBO.length >= 2 || hasYoung(bo) || (fdrBO.length >= 1 && bo.length >= 2)) return "high";
  if (fdrBO.length >= 1) return "moderate";
  return "average";
}

function lungRisk(profile, relatives) {
  const lung = relCancer(relatives, "lung");
  const fdrLung = lung.filter((r) => r.degree === 1).length >= 1;
  const hazards = profile.occupationalHazards || [];
  const asbestos = hazards.includes("asbestos");
  const otherHazard = hazards.some((h) => ["silica", "diesel", "chemical", "other"].includes(h));
  const passive = profile.passiveSmoke && profile.passiveSmoke !== "no";
  const activeSmoker = profile.smoke && profile.smoke !== "never";

  const age = Number(profile.age) || 0;
  // CPG (2025) Section 1, Statement 1: screening should be OFFERED to individuals aged
  // 45–75 with a tobacco smoking history of >= 20 years (current or former smokers).
  // The panel deliberately dropped absolute pack-years in favour of smoking duration.
  if (activeSmoker && profile.smoke20y && age >= 45 && age <= 75) return "high";
  // CPG (2025) Section 1, Statement 2: screening is RECOMMENDED in high-risk non-smokers
  // aged > 40 with a significant family history (e.g. first-degree relative) of lung cancer.
  if (fdrLung && age > 40) return "high";
  // Same history but outside the guideline's age window — still worth a conversation,
  // but the guideline does not make them screening-eligible.
  if (profile.smoke20y) return "moderate";
  // NOT from the CPG: the 2025 consensus sets no screening criterion based on
  // occupational exposure. Asbestos + smoking is retained at high as a precautionary
  // prompt only, and is called out as such in FLAG_LUNG.
  if (asbestos && activeSmoker) return "high";
  // Asbestos exposure alone is still a recognised independent carcinogen —
  // flagged as moderate here so it always prompts an occupational-health conversation,
  // even without any smoking history.
  if (asbestos) return "moderate";
  if (activeSmoker || fdrLung || passive || otherHazard) return "moderate";
  return "average";
}

/* ------------------------------------------------------------------ */
/* Build per-cancer results                                            */
/* ------------------------------------------------------------------ */
function buildColorectal(relatives, genetics) {
  const level = colorectalRisk(relatives, genetics);
  const crc = relCancer(relatives, "colorectal");
  const youngest = crc.reduce((min, r) => {
    const v = r.ageBand === "u50" ? 45 : r.ageBand === "50s" ? 55 : r.ageBand === "60p" ? 65 : 60;
    return Math.min(min, v);
  }, 99);
  let steps = [];
  if (level === "average") {
    steps = [
      P("🩺", L("See a doctor?", "Jumpa doktor?"), L("Not urgently. Join routine screening at your clinic.", "Tidak segera. Sertai saringan rutin di klinik.")),
      P("🔬", L("Which test", "Ujian mana"), L("A simple stool test (iFOBT) — done at home or the clinic. If it is positive, you'll be referred for a colonoscopy.", "Ujian najis mudah (iFOBT) — di rumah atau klinik. Jika positif, anda akan dirujuk untuk kolonoskopi.")),
      P("📅", L("When & how often", "Bila & berapa kerap"), L("Start at age 50. Repeat every year up to age 75.", "Mula umur 50. Ulang setiap tahun hingga umur 75.")),
    ];
  } else if (level === "moderate") {
    steps = [
      P("🩺", L("See a doctor?", "Jumpa doktor?"), L("Yes — tell them about your family history so they can plan earlier checks.", "Ya — beritahu sejarah keluarga supaya pemeriksaan lebih awal dirancang.")),
      P("🔬", L("Which test", "Ujian mana"), L("Colonoscopy (a camera check of the bowel), not just the stool test.", "Kolonoskopi (pemeriksaan kamera usus), bukan sekadar ujian najis.")),
      P("📅", L("When & how often", "Bila & berapa kerap"), L("If your relative was under 60: start at 40, or 10 years before their age, whichever is earlier — repeat every 3–5 years. If 60 or older: start at 40, repeat every 10 years. Stop at 75.", "Jika saudara bawah 60: mula umur 40, atau 10 tahun lebih awal, mana lebih awal — ulang 3–5 tahun. Jika 60+: mula umur 40, ulang 10 tahun. Berhenti umur 75.")),
    ];
  } else {
    steps = [
      P("🩺", L("See a doctor?", "Jumpa doktor?"), L("Yes, soon. Ask about a referral to genetic counselling and a colorectal specialist.", "Ya, segera. Tanya tentang rujukan kaunseling genetik dan pakar kolorektal.")),
      P("🔬", L("Which test", "Ujian mana"), L("Colonoscopy, and possibly genetic testing for inherited syndromes.", "Kolonoskopi, dan mungkin ujian genetik untuk sindrom keturunan.")),
      P("📅", L("When & how often", "Bila & berapa kerap"), youngest < 99
        ? L(`Start at 40, or 10 years before the youngest case in your family — repeat every 3–5 years.`, "Mula umur 40, atau 10 tahun sebelum kes termuda dalam keluarga — ulang 3–5 tahun.")
        : L("Start earlier than the general public — your doctor will set the schedule based on the syndrome.", "Mula lebih awal daripada orang awam — doktor akan tetapkan jadual mengikut sindrom.")),
    ];
  }
  steps.push(P("👀", L("Watch for", "Perhatikan"), WARNING.colorectal));
  steps.push(P("🚨", L("Seek help now if", "Dapatkan bantuan segera jika"), L("There is heavy bleeding from the back passage, or severe tummy pain.", "Ada pendarahan banyak dari dubur, atau sakit perut yang teruk.")));
  return { id: "colorectal", level, steps, source: SOURCE_CRC, flag: null, icd: "ICD-11 2B90–2B93 [to be confirmed from reference]" };
}

function buildBreast(relatives, genetics) {
  const level = breastRisk(relatives, genetics);
  const carrier = ["brca", "palb"].some((g) => genetics.includes(g));
  let plan;
  if (carrier) {
    plan = L(
      "Because a gene change (e.g. BRCA1/2, PALB2) runs in the family: yearly MRI from 30–49, yearly mammogram from 40–69, then a mammogram every 2 years from 70. Ask for genetic counselling.",
      "Kerana perubahan gen (cth. BRCA1/2, PALB2) dalam keluarga: MRI setiap tahun 30–49, mamogram setiap tahun 40–69, kemudian mamogram setiap 2 tahun dari 70. Minta kaunseling genetik."
    );
  } else if (level === "high") {
    plan = L(
      "Mammogram may start from 30–39, done yearly from 40–59, then every 2 years from 60. Discuss the plan with a breast clinic.",
      "Mamogram boleh mula 30–39, setiap tahun 40–59, kemudian setiap 2 tahun dari 60. Bincang pelan dengan klinik payudara."
    );
  } else if (level === "moderate") {
    plan = L(
      "Mammogram yearly from 40–49, yearly or every 2 years from 50–59, then every 2 years from 60.",
      "Mamogram setiap tahun 40–49, setiap tahun atau 2 tahun 50–59, kemudian setiap 2 tahun dari 60."
    );
  } else {
    plan = L(
      "Mammogram every 2 years from 50 to 74. Between 40–49 you may choose yearly mammogram after discussing it with your doctor.",
      "Mamogram setiap 2 tahun dari 50 hingga 74. Antara 40–49 anda boleh pilih mamogram setiap tahun selepas berbincang dengan doktor."
    );
  }
  const steps = [
    P("🩺", L("See a doctor?", "Jumpa doktor?"), level === "average"
      ? L("Not urgently. Have a clinical breast exam from age 35 and get to know your normal breasts.", "Tidak segera. Buat pemeriksaan payudara klinikal dari umur 35 dan kenali payudara anda.")
      : L("Yes — a breast clinic can set an earlier, personalised plan.", "Ya — klinik payudara boleh tetapkan pelan lebih awal dan peribadi.")),
    P("🔬", L("Which test", "Ujian mana"), L("Mammogram (breast X-ray). Ultrasound is only an add-on when something is found, not a screening test on its own.", "Mamogram (X-ray payudara). Ultrabunyi hanya tambahan bila ada penemuan, bukan ujian saringan bersendirian.")),
    P("📅", L("When & how often", "Bila & berapa kerap"), plan),
    P("👀", L("Watch for", "Perhatikan"), WARNING.breast),
    P("🚨", L("Seek help now if", "Dapatkan bantuan segera jika"), L("There is a rapidly growing lump, breast skin breaking down, or severe pain — see a doctor early (within 2 weeks for those over 35 with symptoms).", "Ada ketulan membesar cepat, kulit payudara pecah, atau sakit teruk — jumpa doktor awal (dalam 2 minggu bagi umur 35+ bersimptom).")),
  ];
  return { id: "breast", level, steps, source: SOURCE_BREAST, flag: null, icd: "ICD-11 2C60–2C6Y [to be confirmed from reference]" };
}

function buildLung(profile, relatives) {
  const level = lungRisk(profile, relatives);
  const hazards = profile.occupationalHazards || [];
  const asbestos = hazards.includes("asbestos");
  const otherHazard = hazards.some((h) => ["silica", "diesel", "chemical", "other"].includes(h));
  const passive = profile.passiveSmoke && profile.passiveSmoke !== "no";
  const activeSmoker = profile.smoke && profile.smoke !== "never";
  const age = Number(profile.age) || 0;

  const lung = relCancer(relatives, "lung");
  const fdrLung = lung.filter((r) => r.degree === 1).length >= 1;
  // Reuse the colorectal age-band → proxy-age pattern. CPG Statement 2: with a family
  // history, screening starts at 40 OR at the age the youngest affected relative was
  // diagnosed, whichever comes first.
  const youngestLung = lung.reduce((min, r) => {
    const v = r.ageBand === "u50" ? 45 : r.ageBand === "50s" ? 55 : r.ageBand === "60p" ? 65 : 99;
    return Math.min(min, v);
  }, 99);
  const famStart = youngestLung < 99 ? Math.min(40, youngestLung) : 40;
  // Eligibility routes, kept separate so the copy can say WHY.
  const smokerRoute = activeSmoker && profile.smoke20y && age >= 45 && age <= 75;
  const familyRoute = fdrLung && age > 40;

  let steps;
  if (level === "high") {
    let doctor;
    if (familyRoute && smokerRoute) {
      doctor = L("Yes. You meet both screening routes in Malaysia's 2025 lung cancer guidelines: a first-degree relative with lung cancer, and 20+ years of smoking between ages 45–75. Ask about low-dose CT screening and about stopping smoking.", "Ya. Anda memenuhi kedua-dua laluan saringan dalam garis panduan kanser paru-paru Malaysia 2025: saudara terdekat dengan kanser paru-paru, dan 20+ tahun merokok pada umur 45–75. Tanya tentang saringan CT dos rendah dan berhenti merokok.");
    } else if (familyRoute) {
      doctor = L("Yes. Malaysia's 2025 lung cancer guidelines recommend screening for people over 40 who have a close relative (parent, brother, sister, or child) with lung cancer — even if you have never smoked. This is the single strongest risk factor in non-smokers.", "Ya. Garis panduan kanser paru-paru Malaysia 2025 mengesyorkan saringan bagi mereka berumur lebih 40 tahun yang mempunyai saudara terdekat (ibu, bapa, adik-beradik, atau anak) dengan kanser paru-paru — walaupun anda tidak pernah merokok. Ini faktor risiko paling kuat dalam bukan perokok.");
    } else if (smokerRoute) {
      doctor = L("Yes. Malaysia's 2025 lung cancer guidelines say screening should be offered to people aged 45–75 who have smoked for 20 years or more, whether you still smoke or have stopped. Ask about low-dose CT screening — and about help to stop smoking, which should be discussed before screening starts.", "Ya. Garis panduan kanser paru-paru Malaysia 2025 menyatakan saringan patut ditawarkan kepada mereka berumur 45–75 tahun yang telah merokok 20 tahun atau lebih, sama ada masih merokok atau sudah berhenti. Tanya tentang saringan CT dos rendah — dan bantuan berhenti merokok, yang patut dibincang sebelum saringan bermula.");
    } else {
      doctor = L("Yes. The combination of smoking and asbestos exposure raises lung cancer risk far more than either alone. Ask about lung screening and an occupational health review. Note: the 2025 guidelines do not set a screening rule for workplace exposure, so your doctor will decide.", "Ya. Gabungan merokok dan pendedahan asbestos menaikkan risiko kanser paru-paru jauh lebih tinggi berbanding sendirian. Tanya tentang saringan paru-paru dan penilaian kesihatan pekerjaan. Nota: garis panduan 2025 tidak menetapkan peraturan saringan untuk pendedahan tempat kerja, jadi doktor akan tentukan.");
    }
    steps = [
      P("🩺", L("See a doctor?", "Jumpa doktor?"), doctor),
      P("🔬", L("Which test", "Ujian mana"), L("A low-dose CT scan of the chest (LDCT). The 2025 guidelines call this the gold standard for lung cancer screening. A normal chest X-ray is not equivalent, though it still has a role in clinics without a CT scanner.", "Imbasan CT dos rendah pada dada (LDCT). Garis panduan 2025 menyebutnya piawaian emas untuk saringan kanser paru-paru. X-ray dada biasa bukan setara, walaupun ia masih berperanan di klinik tanpa mesin CT.")),
      P("📅", L("When & how often", "Bila & berapa kerap"), familyRoute
        ? L(`Yearly if a clear scan. With a family history, screening starts at age ${famStart} — or at the age your youngest affected relative was diagnosed, whichever comes first.`, `Setiap tahun jika imbasan bersih. Dengan sejarah keluarga, saringan bermula umur ${famStart} — atau pada umur saudara termuda anda didiagnos, yang mana lebih awal.`)
        : L("Yearly if the scan is clear. If a small spot is found, your doctor may repeat the scan sooner (often at 3, 6, or 12 months depending on what it looks like).", "Setiap tahun jika imbasan bersih. Jika ada bintik kecil, doktor mungkin ulang imbasan lebih awal (selalunya 3, 6, atau 12 bulan bergantung pada rupanya).")),
      P("💬", L("Before you screen", "Sebelum anda saring"), L("The guidelines ask that you first discuss the benefits, limits and harms of screening with a healthcare professional, so the choice is yours and informed. If you still smoke, cessation counselling should be offered alongside — screening does not replace stopping.", "Garis panduan meminta anda berbincang dahulu tentang manfaat, had dan mudarat saringan dengan profesional kesihatan, supaya pilihan itu milik anda dan berasas. Jika anda masih merokok, kaunseling berhenti merokok patut ditawarkan bersama — saringan tidak menggantikan berhenti.")),
    ];
  } else if (level === "moderate") {
    let doctor;
    if (asbestos) {
      doctor = L("Yes — mention your asbestos or workplace exposure specifically, even without symptoms. This may also be a notifiable occupational exposure (ask your workplace or SOCSO/NIOSH about this).", "Ya — nyatakan pendedahan asbestos atau tempat kerja anda secara khusus, walaupun tiada simptom. Ini mungkin juga pendedahan pekerjaan yang perlu dilaporkan (tanya majikan atau SOCSO/NIOSH).");
    } else if (profile.smoke20y && age < 45) {
      doctor = L("Yes, for help to stop smoking. You have smoked 20+ years, but Malaysia's 2025 guidelines start offering screening from age 45 — so a scan is not routine for you yet. That age will come; stopping now is the thing that changes it.", "Ya, untuk bantuan berhenti merokok. Anda telah merokok 20+ tahun, tetapi garis panduan Malaysia 2025 mula menawarkan saringan dari umur 45 — jadi imbasan belum rutin untuk anda. Umur itu akan tiba; berhenti sekarang yang mengubahnya.");
    } else if (profile.smoke20y && age > 75) {
      doctor = L("Yes. You have smoked 20+ years. Malaysia's 2025 guidelines set the screening range at 45–75, so a routine scan is not automatic above 75 — but your doctor can weigh your overall health and decide with you.", "Ya. Anda telah merokok 20+ tahun. Garis panduan Malaysia 2025 menetapkan julat saringan 45–75, jadi imbasan rutin tidak automatik selepas 75 — tetapi doktor boleh menimbang kesihatan keseluruhan anda dan tentukan bersama anda.");
    } else {
      doctor = L("Yes, for advice on stopping smoking, reducing exposure, and watching for symptoms.", "Ya, untuk nasihat berhenti merokok, kurangkan pendedahan, dan memerhati simptom.");
    }
    steps = [
      P("🩺", L("See a doctor?", "Jumpa doktor?"), doctor),
      P("🔬", L("Which test", "Ujian mana"), L("No routine scan. Malaysia's 2025 guidelines offer low-dose CT screening to people aged 45–75 who smoked 20+ years, and to people over 40 with a close relative who had lung cancer. If neither fits you, your doctor decides case by case.", "Tiada imbasan rutin. Garis panduan Malaysia 2025 menawarkan saringan CT dos rendah kepada mereka berumur 45–75 tahun yang merokok 20+ tahun, dan mereka berumur lebih 40 tahun dengan saudara terdekat yang menghidap kanser paru-paru. Jika kedua-duanya tidak sesuai, doktor tentukan kes demi kes.")),
      P("📅", L("When & how often", "Bila & berapa kerap"), L("Stay symptom-aware and follow your doctor's advice.", "Peka pada simptom dan ikut nasihat doktor.")),
    ];
  } else {
    steps = [
      P("🩺", L("See a doctor?", "Jumpa doktor?"), L("Not routinely. Malaysia's 2025 lung cancer guidelines do not screen non-smokers who have no close relative with lung cancer.", "Tidak rutin. Garis panduan kanser paru-paru Malaysia 2025 tidak menyaring bukan perokok yang tiada saudara terdekat dengan kanser paru-paru.")),
      P("🔬", L("Which test", "Ujian mana"), L("None routinely. Avoid smoking and second-hand smoke, and use proper protection if you work around dust, fumes, or chemicals.", "Tiada rutin. Elakkan rokok dan asap rokok, dan gunakan perlindungan sewajarnya jika bekerja berhampiran debu, wap, atau bahan kimia.")),
      P("📅", L("When & how often", "Bila & berapa kerap"), L("Just stay alert to the warning signs below.", "Peka pada tanda amaran di bawah.")),
    ];
  }
  if (asbestos || otherHazard) {
    steps.push(P("🏭", L("About your workplace exposure", "Tentang pendedahan tempat kerja anda"), L(
      "Occupational exposures (like asbestos, silica dust, diesel exhaust, or industrial chemicals/fumes) can raise lung cancer risk on their own, and add to the risk from smoking rather than simply replacing it. Mention this history to your doctor even if you've never smoked.",
      "Pendedahan pekerjaan (seperti asbestos, debu silika, wap diesel, atau bahan kimia/wap industri) boleh menaikkan risiko kanser paru-paru dengan sendirinya, dan ditambah kepada risiko merokok, bukan menggantikannya. Nyatakan sejarah ini kepada doktor walaupun anda tidak pernah merokok."
    )));
  }
  if (passive && !activeSmoker) {
    steps.push(P("🚬", L("About second-hand smoke", "Tentang asap rokok orang lain"), L(
      "Regular exposure to someone else's smoke — at home, in a car, or from smoke that clings to clothing/hair — still counts as exposure, even without you smoking directly. It's worth mentioning to your doctor.",
      "Pendedahan kerap kepada asap rokok orang lain — di rumah, dalam kereta, atau asap yang melekat pada pakaian/rambut — masih dikira sebagai pendedahan, walaupun anda sendiri tidak merokok. Ia patut dinyatakan kepada doktor."
    )));
  }
  if (!activeSmoker) {
    steps.push(P("💡", L("Lung cancer is not only a smoker's disease", "Kanser paru-paru bukan penyakit perokok sahaja"), L(
      "Malaysia's 2025 guidelines note that in one local study 60.3% of women with lung cancer had never smoked, and never-smokers made up a higher share of patients under 40. Besides family history, recognised risks in non-smokers include second-hand smoke, past TB or chronic lung disease, air pollution (PM2.5), asbestos, silica, radon, and indoor smoke from charcoal, wood fires, or high-heat wok cooking with unrefined oil.",
      "Garis panduan Malaysia 2025 mencatatkan bahawa dalam satu kajian tempatan, 60.3% wanita dengan kanser paru-paru tidak pernah merokok, dan bukan perokok merangkumi bahagian lebih besar pesakit bawah 40 tahun. Selain sejarah keluarga, risiko yang diiktiraf dalam bukan perokok termasuk asap rokok orang lain, TB lampau atau penyakit paru-paru kronik, pencemaran udara (PM2.5), asbestos, silika, radon, dan asap dalam rumah daripada arang, kayu api, atau memasak wok bersuhu tinggi dengan minyak tidak ditapis."
    )));
  }
  steps.push(P("👀", L("Watch for", "Perhatikan"), WARNING.lung));
  steps.push(P("⏱️", L("If lung cancer is suspected", "Jika kanser paru-paru disyaki"), L(
    "Malaysia's 2025 guidelines say anyone with suspected lung cancer should be seen by a lung specialist (respiratory physician, thoracic surgeon, or oncologist) within 2 weeks of first presenting. If you are told your chest X-ray or scan is abnormal, it is reasonable to ask when your specialist appointment is.",
    "Garis panduan Malaysia 2025 menyatakan sesiapa yang disyaki kanser paru-paru patut dilihat oleh pakar paru-paru (pakar perubatan respiratori, pakar bedah toraks, atau pakar onkologi) dalam masa 2 minggu selepas kali pertama hadir. Jika anda diberitahu X-ray atau imbasan dada anda tidak normal, wajar anda bertanya bila temujanji pakar anda."
  )));
  steps.push(P("🚨", L("Seek help now if", "Dapatkan bantuan segera jika"), L("You cough up a lot of blood or suddenly cannot breathe properly.", "Anda batuk darah banyak atau tiba-tiba sukar bernafas.")));
  return { id: "lung", level, steps, source: SOURCE_LUNG, flag: FLAG_LUNG, icd: "ICD-11 2C25 [to be confirmed from reference]" };
}

function buildCervical(profile) {
  const eligible = profile.sex === "female" && profile.everSex === "yes";
  const smoker = profile.smoke === "current" || profile.smoke === "past";
  const steps = [
    P("🩺", L("See a doctor?", "Jumpa doktor?"), eligible
      ? L("Yes — book a Pap smear at your Klinik Kesihatan / KKIA. Cervical cancer is the second most common cancer in Malaysian women, and screening catches changes long before they turn into cancer.", "Ya — buat temu janji Pap smear di Klinik Kesihatan / KKIA. Kanser serviks ialah kanser kedua paling biasa dalam kalangan wanita Malaysia, dan saringan mengesan perubahan lama sebelum ia menjadi kanser.")
      : L("Screening is for women who have ever been sexually active, roughly ages 21–65.", "Saringan untuk wanita yang pernah aktif secara seksual, lebih kurang umur 21–65.")),
    P("⚠️", L("What raises the risk", "Apa yang menaikkan risiko"), L(
      smoker
        ? "Nearly all cervical cancer is caused by long-lasting infection with the HPV virus, which spreads through sexual contact. Other factors the guideline lists include many sexual partners, first intercourse or first birth before age 17, many full-term pregnancies, long-term (over 10 years) use of the oral contraceptive pill, and smoking — which applies to you."
        : "Nearly all cervical cancer is caused by long-lasting infection with the HPV virus, which spreads through sexual contact. Other factors the guideline lists include many sexual partners, first intercourse or first birth before age 17, many full-term pregnancies, long-term (over 10 years) use of the oral contraceptive pill, and smoking.",
      smoker
        ? "Hampir semua kanser serviks disebabkan jangkitan berpanjangan virus HPV, yang merebak melalui hubungan seks. Faktor lain yang disenaraikan garis panduan termasuk ramai pasangan seks, hubungan seks atau kelahiran pertama sebelum umur 17, banyak kehamilan cukup bulan, penggunaan pil perancang jangka panjang (lebih 10 tahun), dan merokok — yang berkaitan dengan anda."
        : "Hampir semua kanser serviks disebabkan jangkitan berpanjangan virus HPV, yang merebak melalui hubungan seks. Faktor lain yang disenaraikan garis panduan termasuk ramai pasangan seks, hubungan seks atau kelahiran pertama sebelum umur 17, banyak kehamilan cukup bulan, penggunaan pil perancang jangka panjang (lebih 10 tahun), dan merokok."
    )),
    P("🔬", L("Which test", "Ujian mana"), L("A Pap smear, or an HPV test where available.", "Pap smear, atau ujian HPV di mana tersedia.")),
    P("📅", L("When & how often", "Bila & berapa kerap"), L("Under the national programme, commonly every 3 years for a Pap smear, or every 5 years for an HPV test. Confirm the current interval with your clinic.", "Di bawah program kebangsaan, lazimnya setiap 3 tahun untuk Pap smear, atau setiap 5 tahun untuk ujian HPV. Sahkan selang semasa dengan klinik.")),
    P("💉", L("The HPV vaccine — the main way to prevent it", "Vaksin HPV — cara utama untuk mencegahnya"), L(
      "Because HPV causes almost all cervical cancer, a vaccine given before exposure to the virus prevents most cases. In Malaysia it is offered free to schoolgirls (around 13 years old) and works best before any sexual activity. Older women can ask a clinic about catch-up vaccination. Important: the vaccine does not replace screening — even vaccinated women still need Pap or HPV tests.",
      "Kerana HPV menyebabkan hampir semua kanser serviks, vaksin yang diberi sebelum terdedah kepada virus mencegah kebanyakan kes. Di Malaysia ia diberi percuma kepada pelajar perempuan sekolah (sekitar umur 13 tahun) dan paling berkesan sebelum sebarang aktiviti seksual. Wanita lebih dewasa boleh bertanya klinik tentang vaksinasi susulan. Penting: vaksin tidak menggantikan saringan — wanita yang divaksin masih perlu ujian Pap atau HPV."
    )),
    P("👀", L("Watch for", "Perhatikan"), WARNING.cervical),
    P("📞", L("See a doctor within 2 weeks if", "Jumpa doktor dalam 2 minggu jika"), L("You bleed after sex (especially if over 40), bleed between periods, or have vaginal discharge that will not settle — the guideline flags these for prompt referral.", "Anda berdarah selepas seks (terutama jika berumur lebih 40), berdarah antara haid, atau ada lelehan faraj yang tidak reda — garis panduan menandakan ini untuk rujukan segera.")),
    P("🚨", L("Seek help now if", "Dapatkan bantuan segera jika"), L("There is heavy or non-stop vaginal bleeding.", "Ada pendarahan faraj yang banyak atau tidak berhenti.")),
  ];
  return { id: "cervical", level: "info", steps, source: SOURCE_CERV, flag: FLAG_CERV, icd: "ICD-11 2C77 [to be confirmed from reference]" };
}

function buildNPC(profile, relatives) {
  const npcFdr = relCancer(relatives, "npc").filter((r) => r.degree === 1).length >= 1;
  const steps = [
    P("🩺", L("See a doctor?", "Jumpa doktor?"), L(
      "There is no routine screening for this cancer — Malaysia's guideline reviewed screening people with no symptoms and found the evidence too weak to recommend it. What matters is acting fast on the warning signs below: the guideline says anyone who has them should be referred to an ENT (ear, nose & throat) specialist as soon as possible, because NPC is often found late.",
      "Tiada saringan rutin untuk kanser ini — garis panduan Malaysia menilai saringan orang tanpa simptom dan mendapati buktinya terlalu lemah untuk disyorkan. Yang penting ialah bertindak cepat pada tanda amaran di bawah: garis panduan menyatakan sesiapa yang mengalaminya patut dirujuk kepada pakar ENT (telinga, hidung & tekak) secepat mungkin, kerana NPC selalu dijumpai lewat."
    )),
    P("⚠️", L("What raises the risk", "Apa yang menaikkan risiko"), npcFdr
      ? L(
          "The guideline lists infection with the Epstein-Barr virus (EBV), a first-degree relative who had NPC, eating salted fish (especially from childhood), smoking, and long exposure to wood-cooking smoke. Because a close relative had NPC, your own risk is higher — the guideline puts it at roughly 3 to 8 times that of someone with no family history. Tell your doctor about this family history.",
          "Garis panduan menyenaraikan jangkitan virus Epstein-Barr (EBV), saudara terdekat yang menghidap NPC, makan ikan masin (terutama sejak kecil), merokok, dan pendedahan lama kepada asap memasak kayu. Kerana saudara terdekat menghidap NPC, risiko anda lebih tinggi — garis panduan menganggarkannya kira-kira 3 hingga 8 kali ganda berbanding seseorang tanpa sejarah keluarga. Beritahu doktor tentang sejarah keluarga ini."
        )
      : L(
          "The guideline lists infection with the Epstein-Barr virus (EBV), a first-degree relative who had NPC, eating salted fish (especially from childhood), smoking, and long exposure to wood-cooking smoke. A first-degree relative with NPC raises the risk roughly 3 to 8 times — worth telling your doctor if that applies to you.",
          "Garis panduan menyenaraikan jangkitan virus Epstein-Barr (EBV), saudara terdekat yang menghidap NPC, makan ikan masin (terutama sejak kecil), merokok, dan pendedahan lama kepada asap memasak kayu. Saudara terdekat dengan NPC menaikkan risiko kira-kira 3 hingga 8 kali — patut diberitahu kepada doktor jika ia berkaitan dengan anda."
        )),
    P("🔬", L("Which test", "Ujian mana"), L(
      "An ENT specialist looks at the back of the nose with a thin camera (nasoendoscopy). If anything suspicious is seen, the diagnosis is confirmed with a small tissue sample (biopsy). If you have a neck lump, they may take cells from it with a fine needle (FNAC). Note: an EBV blood test is used as a research/screening tool in the guideline — it is not a stand-alone way to diagnose NPC.",
      "Pakar ENT melihat bahagian belakang hidung dengan kamera halus (nasoendoskopi). Jika ada yang mencurigakan, diagnosis disahkan dengan sampel tisu kecil (biopsi). Jika anda ada ketulan leher, mereka mungkin mengambil sel darinya dengan jarum halus (FNAC). Nota: ujian darah EBV digunakan sebagai alat penyelidikan/saringan dalam garis panduan — ia bukan cara berdiri sendiri untuk mendiagnosis NPC."
    )),
    P("📅", L("When & how often", "Bila & berapa kerap"), npcFdr
      ? L("There is no fixed schedule. Because a close relative had NPC, mention it to your doctor and get checked promptly — do not wait — if any warning sign appears.", "Tiada jadual tetap. Kerana saudara terdekat menghidap NPC, beritahu doktor dan buat pemeriksaan segera — jangan tunggu — jika ada tanda amaran.")
      : L("There is no fixed schedule — this is driven by symptoms, not a routine. See a doctor promptly if any warning sign below appears.", "Tiada jadual tetap — berdasarkan simptom, bukan rutin. Jumpa doktor segera jika ada tanda amaran di bawah.")),
    P("👀", L("Watch for", "Perhatikan"), WARNING.npc),
    P("🚨", L("Seek help now if", "Dapatkan bantuan segera jika"), L("There is heavy nosebleeding, or trouble breathing or swallowing.", "Ada mimisan banyak, atau sukar bernafas atau menelan.")),
  ];
  return { id: "npc", level: "info", steps, source: SOURCE_NPC, flag: FLAG_NPC, icd: "ICD-11 2B6B [to be confirmed from reference]" };
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
.fcra * { box-sizing: border-box; }
.fcra {
  --bg:#eef3f1; --surface:#ffffff; --ink:#12211f; --muted:#5c6b69; --line:#dbe4e2;
  --teal:#0d7d76; --teal-d:#0a5f5a; --teal-soft:#e2f0ee;
  --amber:#c07a1e; --amber-soft:#fbeed7;
  --red:#c23a3a; --red-soft:#f8e2e2;
  --green:#2b8d61; --green-soft:#dcf0e6;
  --accent:#e6a12f;
  font-family:'Plus Jakarta Sans', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  color:var(--ink);
  background: linear-gradient(135deg, #fde2e4 0%, #fff1cf 25%, #e2f0ee 50%, #dbe8fb 75%, #ece1f7 100%);
  background-attachment: fixed;
  min-height:100%;
  line-height:1.5; -webkit-font-smoothing:antialiased;
}
.fcra .wrap { max-width:760px; margin:0 auto; padding:20px 16px 96px; }
.fcra .card { background:var(--surface); border:1px solid var(--line); border-radius:20px; padding:22px; box-shadow:0 1px 2px rgba(18,33,31,.04); }
.fcra .card + .card { margin-top:16px; }
.fcra h1 { font-size:26px; font-weight:800; margin:0 0 6px; letter-spacing:-.02em; }
.fcra h2 { font-size:20px; font-weight:700; margin:0 0 10px; letter-spacing:-.01em; }
.fcra h3 { font-size:16px; font-weight:700; margin:0; }
.fcra p { margin:0 0 10px; color:var(--ink); }
.fcra .muted { color:var(--muted); }
.fcra .small { font-size:13px; }
.fcra .eyebrow { font-size:12px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--teal); margin:0 0 8px; }

.fcra .brandbar { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
.fcra .brandmark { width:44px; height:44px; border-radius:13px; background:var(--teal); color:#fff; display:grid; place-items:center; font-size:22px; flex:none; }
.fcra .brandbar .t { font-weight:800; font-size:17px; line-height:1.15; }
.fcra .brandbar .s { font-size:12px; color:var(--muted); }
.fcra .langtoggle { margin-left:auto; display:flex; border:1px solid var(--line); border-radius:999px; overflow:hidden; }
.fcra .langtoggle button { border:0; background:transparent; padding:7px 13px; font:inherit; font-weight:700; font-size:13px; cursor:pointer; color:var(--muted); }
.fcra .langtoggle button[aria-pressed="true"] { background:var(--teal); color:#fff; }

.fcra .emg { display:flex; align-items:center; gap:12px; width:100%; text-align:left; border:1px solid var(--red); background:var(--red-soft); color:#7a1f1f; border-radius:16px; padding:14px 16px; font:inherit; font-weight:700; cursor:pointer; }
.fcra .emg .ico { font-size:22px; }
.fcra .emg .go { margin-left:auto; font-weight:800; }

.fcra .steps-nav { display:flex; gap:8px; margin:18px 0 4px; }
.fcra .steps-nav .dot { flex:1; height:6px; border-radius:99px; background:var(--line); }
.fcra .steps-nav .dot.on { background:var(--teal); }
.fcra .steps-nav .dot.done { background:var(--teal-d); }

.fcra label.field { display:block; margin-bottom:16px; }
.fcra label.field > span { display:block; font-weight:700; font-size:14px; margin-bottom:7px; }
.fcra input[type=number], .fcra select {
  width:100%; font:inherit; padding:13px 14px; border:1px solid var(--line); border-radius:13px; background:#fff; color:var(--ink);
}
.fcra input:focus-visible, .fcra select:focus-visible, .fcra button:focus-visible { outline:3px solid #8fd0c9; outline-offset:2px; }

.fcra .chips { display:flex; flex-wrap:wrap; gap:8px; }
.fcra .chip { border:1.5px solid var(--line); background:#fff; border-radius:999px; padding:11px 15px; font:inherit; font-weight:600; font-size:14px; cursor:pointer; color:var(--ink); display:flex; align-items:center; gap:7px; }
.fcra .chip[aria-pressed="true"] { border-color:var(--teal); background:var(--teal-soft); color:var(--teal-d); }

.fcra .btn { border:0; border-radius:14px; padding:14px 20px; font:inherit; font-weight:700; font-size:15px; cursor:pointer; }
.fcra .btn.primary { background:var(--teal); color:#fff; }
.fcra .btn.primary:hover { background:var(--teal-d); }
.fcra .btn.ghost { background:#fff; border:1.5px solid var(--line); color:var(--ink); }
.fcra .btn.block { width:100%; }
.fcra .row { display:flex; gap:12px; flex-wrap:wrap; }
.fcra .row .btn { flex:1; min-width:130px; }

.fcra .relcard { border:1px solid var(--line); border-radius:14px; padding:12px 14px; display:flex; align-items:center; gap:12px; margin-bottom:10px; }
.fcra .relcard .em { font-size:22px; }
.fcra .relcard .info { flex:1; }
.fcra .relcard .info b { display:block; font-size:14px; }
.fcra .relcard .info span { font-size:12.5px; color:var(--muted); }
.fcra .relcard .rm { border:0; background:var(--red-soft); color:#8a2222; border-radius:10px; padding:7px 11px; font:inherit; font-weight:700; cursor:pointer; font-size:13px; }
.fcra .deg { font-size:11px; font-weight:700; padding:2px 8px; border-radius:99px; background:var(--teal-soft); color:var(--teal-d); }

.fcra .adder { border:1.5px dashed var(--line); border-radius:16px; padding:16px; margin-top:6px; }

.fcra .result { border-radius:20px; overflow:hidden; border:1px solid var(--line); margin-bottom:16px; background:#fff; }
.fcra .result .head { padding:18px 20px; display:flex; align-items:center; gap:14px; }
.fcra .result .head .em { font-size:30px; }
.fcra .result .head .nm { font-weight:800; font-size:19px; }
.fcra .badge { margin-left:auto; padding:7px 13px; border-radius:999px; font-weight:800; font-size:13px; white-space:nowrap; }
.fcra .tone-green .head { background:var(--green-soft); } .fcra .tone-green .badge { background:var(--green); color:#fff; }
.fcra .tone-amber .head { background:var(--amber-soft); } .fcra .tone-amber .badge { background:var(--amber); color:#fff; }
.fcra .tone-red .head { background:var(--red-soft); } .fcra .tone-red .badge { background:var(--red); color:#fff; }
.fcra .tone-teal .head { background:var(--teal-soft); } .fcra .tone-teal .badge { background:var(--teal); color:#fff; }
.fcra .result .body { padding:6px 20px 18px; }
.fcra .blurb { font-size:14.5px; color:var(--muted); margin:10px 0 14px; }

.fcra .meter { display:flex; gap:6px; margin:2px 0 16px; }
.fcra .meter .seg { flex:1; text-align:center; font-size:11px; font-weight:700; color:var(--muted); }
.fcra .meter .bar { height:8px; border-radius:99px; background:var(--line); margin-bottom:5px; }
.fcra .meter .seg.a .bar { background:var(--green); } .fcra .meter .seg.a { color:var(--green); }
.fcra .meter .seg.m .bar { background:var(--amber); } .fcra .meter .seg.m { color:var(--amber); }
.fcra .meter .seg.h .bar { background:var(--red); } .fcra .meter .seg.h { color:var(--red); }

.fcra .step { display:flex; gap:13px; padding:13px 0; border-top:1px solid var(--line); }
.fcra .step:first-child { border-top:0; }
.fcra .step .si { font-size:20px; flex:none; width:26px; text-align:center; }
.fcra .step .sc b { display:block; font-size:13px; letter-spacing:.02em; color:var(--muted); text-transform:uppercase; font-weight:700; margin-bottom:2px; }
.fcra .step.seek { background:var(--red-soft); margin:8px -20px -18px; padding:14px 20px; border-radius:0 0 20px 20px; }
.fcra .step.seek .sc b { color:#8a2222; }

.fcra .flag { background:#fff8ec; border:1px solid #f0d79a; border-radius:12px; padding:11px 13px; font-size:13px; color:#6b4e12; margin:6px 0 12px; }
.fcra .src { font-size:12px; color:var(--muted); border-top:1px dashed var(--line); padding-top:10px; margin-top:12px; }
.fcra .src .icd { display:block; margin-top:3px; }
.fcra .draft { font-size:12px; font-style:italic; color:var(--muted); margin-top:6px; }

.fcra .notice { background:var(--teal-soft); border:1px solid #b9ded9; border-radius:16px; padding:16px 18px; }
.fcra .notice h3 { margin-bottom:6px; }
.fcra .disclaimer { display:flex; gap:10px; align-items:flex-start; font-size:12.5px; color:var(--muted); margin-top:18px; padding-top:14px; border-top:1px solid var(--line); }

/* Slogan / hero tagline */
.fcra .slogan { display:inline-flex; align-items:center; gap:8px; background:var(--teal); color:#fff; font-weight:800; font-size:14px; letter-spacing:.01em; padding:8px 15px; border-radius:999px; margin:0 0 14px; }
.fcra .slogan .dot { width:8px; height:8px; border-radius:99px; background:#8fd0c9; }

/* "Why use this app" reasons */
.fcra .reasons { display:grid; gap:12px; margin-top:6px; }
.fcra .reason { display:flex; gap:13px; align-items:flex-start; background:#fff; border:1px solid var(--line); border-radius:14px; padding:14px 16px; }
.fcra .reason .rico { font-size:22px; line-height:1; flex:none; width:30px; text-align:center; }
.fcra .reason b { display:block; font-size:14.5px; margin-bottom:2px; }
.fcra .reason span { font-size:13px; color:var(--muted); }

/* Registry data-visualisation */
.fcra .statgrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin:4px 0 6px; }
.fcra .stat { background:var(--teal-soft); border:1px solid #b9ded9; border-radius:16px; padding:15px 16px; }
.fcra .stat .big { font-size:30px; font-weight:800; letter-spacing:-.02em; color:var(--teal-d); line-height:1.05; }
.fcra .stat .cap { font-size:12.5px; color:var(--muted); margin-top:4px; }
.fcra .stat.accent { background:var(--amber-soft); border-color:#f0d79a; }
.fcra .stat.accent .big { color:var(--amber); }

.fcra .vizhead { font-size:13px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); margin:20px 0 10px; }
.fcra .bars { display:grid; gap:8px; }
.fcra .bar-row { display:grid; grid-template-columns:minmax(96px,34%) 1fr auto; align-items:center; gap:10px; }
.fcra .bar-row .lab { font-size:13px; font-weight:600; }
.fcra .bar-track { display:block; background:var(--line); border-radius:99px; height:16px; overflow:hidden; }
.fcra .bar-fill { display:block; height:100%; border-radius:99px; background:var(--teal); }
.fcra .bar-fill.f-pink { background:#c65a8e; }
.fcra .bar-fill.f-blue { background:#2f6fb0; }
.fcra .bar-fill.f-red { background:var(--red); }
.fcra .bar-row .val { font-size:12.5px; font-weight:800; color:var(--muted); min-width:40px; text-align:right; }

.fcra .split { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
@media (max-width:560px){ .fcra .split { grid-template-columns:1fr; } }
.fcra .split h4 { margin:0 0 8px; font-size:14px; font-weight:800; }
.fcra .split .m { color:#2f6fb0; } .fcra .split .f { color:#c65a8e; }

.fcra .ethrow { display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-top:1px solid var(--line); font-size:13.5px; }
.fcra .ethrow:first-of-type { border-top:0; }
.fcra .ethrow b { font-weight:800; }

.fcra .srcline { font-size:11.5px; color:var(--muted); border-top:1px dashed var(--line); padding-top:10px; margin-top:16px; }

.fcra .modal-bg { position:fixed; inset:0; background:rgba(10,20,19,.55); display:grid; place-items:center; padding:18px; z-index:50; }
.fcra .modal { background:#fff; border-radius:20px; max-width:440px; width:100%; padding:24px; }
.fcra .modal h2 { color:var(--red); }
.fcra ul.plain { margin:0 0 14px; padding-left:20px; } .fcra ul.plain li { margin-bottom:6px; }

.fcra .cpg-chat { background:var(--surface); }
.fcra .cpg-messages { display:flex; flex-direction:column; gap:10px; padding:4px 0; }
.fcra .cpg-msg { display:flex; gap:10px; align-items:flex-start; }
.fcra .cpg-role { font-size:18px; flex:none; margin-top:2px; }
.fcra .cpg-bubble { font-size:13.5px; line-height:1.55; padding:10px 14px; border-radius:14px; max-width:92%; white-space:pre-wrap; }
.fcra .cpg-user .cpg-bubble { background:var(--teal-soft); color:var(--ink); margin-left:auto; border-bottom-right-radius:4px; }
.fcra .cpg-assistant .cpg-bubble { background:#f6f8f7; color:var(--ink); border-bottom-left-radius:4px; }
.fcra .cpg-loading { color:var(--muted); font-style:italic; }

@media (max-width:480px){ .fcra h1{font-size:22px;} .fcra .wrap{padding:16px 12px 96px;} }
@media (prefers-reduced-motion: reduce){ .fcra *{ transition:none !important; } }

/* --- Labelled numbered stepper --------------------------------------*/
.fcra .stepper { display:flex; gap:2px; margin:16px 0 8px; overflow-x:auto; padding-bottom:4px; }
.fcra .stnode { flex:1 1 0; min-width:78px; display:flex; flex-direction:column; align-items:center; gap:6px; border:0; background:transparent; font:inherit; cursor:default; padding:2px 2px 4px; position:relative; }
.fcra .stnode:not(:first-child)::before { content:""; position:absolute; top:16px; left:-50%; width:100%; height:2px; background:var(--line); z-index:0; }
.fcra .stnode.on::before, .fcra .stnode.done::before { background:var(--teal); }
.fcra .stnum { width:30px; height:30px; border-radius:999px; background:var(--line); color:var(--muted); display:grid; place-items:center; font-weight:800; font-size:13px; position:relative; z-index:1; transition:background .15s; }
.fcra .stnode.on .stnum { background:var(--teal); color:#fff; box-shadow:0 0 0 4px var(--teal-soft); }
.fcra .stnode.done .stnum { background:var(--teal-d); color:#fff; }
.fcra .stnode.done { cursor:pointer; }
.fcra .stlab { font-size:11px; font-weight:700; color:var(--muted); text-align:center; line-height:1.2; max-width:88px; }
.fcra .stnode.on .stlab { color:var(--teal-d); }
.fcra .stnode.done .stlab { color:var(--ink); }

/* --- Entry disclaimer gate ------------------------------------------*/
.fcra .gate-bg { position:fixed; inset:0; background:rgba(8,17,16,.66); display:grid; place-items:center; padding:18px; z-index:100; overflow-y:auto; }
.fcra .gate { background:#fff; border-radius:18px; border-top:5px solid var(--accent); max-width:520px; width:100%; padding:26px 26px 24px; box-shadow:0 22px 60px rgba(0,0,0,.32); }
.fcra .gate-tag { display:inline-flex; align-items:center; gap:6px; background:var(--accent); color:#3a2a05; font-weight:800; font-size:12px; letter-spacing:.05em; padding:7px 12px; border-radius:8px; margin-bottom:16px; }
.fcra .gate-title { font-size:25px; font-weight:800; margin:0 0 4px; letter-spacing:-.02em; }
.fcra .gate-v { color:var(--teal); font-size:15px; font-weight:800; }
.fcra .gate-by { color:var(--teal-d); font-weight:700; font-size:13px; margin:0 0 16px; }
.fcra .gate-p { color:var(--muted); font-size:14px; margin:0 0 12px; line-height:1.55; }
.fcra .gate-p b { color:var(--ink); }
.fcra .gate .btn.primary { background:var(--ink); margin-top:8px; }
.fcra .gate .btn.primary:hover { background:#0a1614; }

/* --- Printable GP summary -------------------------------------------*/
.fcra .summary-bg { position:fixed; inset:0; background:rgba(8,17,16,.66); display:block; z-index:90; overflow-y:auto; padding:18px; }
.fcra .summary-doc { background:#fff; max-width:720px; margin:0 auto; border-radius:16px; padding:30px 34px; box-shadow:0 22px 60px rgba(0,0,0,.3); }
.fcra .summary-doc h1 { font-size:22px; margin:0 0 2px; }
.fcra .summary-doc .meta { font-size:12.5px; color:var(--muted); margin:0 0 16px; }
.fcra .summary-band { background:var(--amber-soft); border:1px solid #f0d79a; border-radius:12px; padding:13px 15px; font-size:13px; color:#6b4e12; margin:0 0 18px; }
.fcra .summary-band b { color:#5a3f0d; }
.fcra .summary-sec { border-top:1px solid var(--line); padding:14px 0; }
.fcra .summary-sec h3 { font-size:14px; text-transform:uppercase; letter-spacing:.04em; color:var(--teal-d); margin:0 0 8px; }
.fcra .summary-kv { display:flex; flex-wrap:wrap; gap:6px 26px; font-size:13.5px; }
.fcra .summary-kv div span { color:var(--muted); }
.fcra .summary-row { display:flex; gap:10px; align-items:baseline; font-size:13.5px; padding:6px 0; border-bottom:1px dashed var(--line); }
.fcra .summary-row:last-child { border-bottom:0; }
.fcra .summary-row .lv { font-weight:800; font-size:11px; padding:3px 9px; border-radius:99px; white-space:nowrap; }
.fcra .lv.green{ background:var(--green-soft); color:#1c6644;} .fcra .lv.amber{ background:var(--amber-soft); color:#8a5a10;}
.fcra .lv.red{ background:var(--red-soft); color:#8a2222;} .fcra .lv.teal{ background:var(--teal-soft); color:var(--teal-d);}
.fcra .summary-row .cn { font-weight:700; min-width:112px; }
.fcra .summary-row .ac { color:var(--ink); flex:1; }
.fcra .gp-box { border:1.5px solid var(--line); border-radius:12px; padding:14px 16px; margin-top:6px; }
.fcra .gp-box .gp-label { font-size:12px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; }
.fcra .gp-line { border-bottom:1px solid var(--line); height:26px; margin-top:12px; }
.fcra .gp-sign { display:flex; gap:24px; margin-top:20px; }
.fcra .gp-sign > div { flex:1; }
.fcra .gp-sign .gp-line { margin-top:26px; }
.fcra .summary-actions { display:flex; gap:12px; max-width:720px; margin:16px auto 0; }
.fcra .summary-actions .btn { flex:1; }

/* --- Symptom check module -------------------------------------------*/
.fcra .symcard { border-top:4px solid var(--teal); }
.fcra .symgroup { margin-top:14px; }
.fcra .symgroup-h { font-size:13px; font-weight:800; color:var(--teal-d); margin-bottom:8px; display:flex; align-items:center; gap:6px; }
.fcra .symlist { display:flex; flex-direction:column; gap:8px; }
.fcra .symitem { display:flex; gap:10px; align-items:flex-start; text-align:left; border:1.5px solid var(--line); background:#fff; border-radius:12px; padding:11px 13px; font:inherit; font-size:14px; cursor:pointer; color:var(--ink); line-height:1.4; }
.fcra .symitem .symbox { font-size:16px; flex:none; line-height:1.3; }
.fcra .symitem.on { border-color:var(--red); background:var(--red-soft); color:#7a1f1f; font-weight:600; }
.fcra .symnone { display:flex; gap:8px; align-items:center; width:100%; text-align:left; margin-top:14px; border:1.5px dashed var(--line); background:#fff; border-radius:12px; padding:11px 13px; font:inherit; font-size:14px; font-weight:600; cursor:pointer; color:var(--muted); }
.fcra .symnone.on { border-color:var(--teal); background:var(--teal-soft); color:var(--teal-d); border-style:solid; }
.fcra .symverdict { margin-top:16px; border-radius:14px; padding:15px 16px; }
.fcra .symverdict.flag-red { background:var(--red-soft); border:1px solid #e6b3b3; }
.fcra .symverdict.flag-teal { background:var(--teal-soft); border:1px solid #b9ded9; }
.fcra .symverdict .sv-h { font-weight:800; font-size:14.5px; margin-bottom:6px; }
.fcra .symverdict.flag-red .sv-h { color:#8a2222; }
.fcra .symverdict.flag-teal .sv-h { color:var(--teal-d); }
.fcra .symverdict .sv-p { font-size:13.5px; color:var(--ink); margin:0 0 8px; }
.fcra .symverdict .sv-list { margin:0 0 8px; padding-left:20px; font-size:13px; }
.fcra .symverdict .sv-list li { margin-bottom:4px; }
.fcra .symverdict .sv-emg { font-size:12.5px; color:var(--muted); margin:0; }
.fcra .linkbtn { border:0; background:none; padding:0; font:inherit; font-size:12.5px; font-weight:800; color:var(--red); text-decoration:underline; cursor:pointer; }

/* --- Urgent strip on a result card ----------------------------------*/
.fcra .urgent-strip { background:var(--red-soft); border:1px solid #e6b3b3; border-radius:12px; padding:11px 13px; margin:10px 0 4px; }
.fcra .urgent-strip b { display:block; font-size:13.5px; color:#8a2222; line-height:1.4; }
.fcra .urgent-strip .us-list { display:block; font-size:12.5px; color:#7a1f1f; margin-top:5px; }

/* --- Feedback (feasibility study) -----------------------------------*/
.fcra .fbcard { border-top:4px solid var(--accent); }
.fcra .fb-likert { margin:8px 0 4px; }
.fcra .fb-stmt { padding:14px 0; border-top:1px solid var(--line); }
.fcra .fb-stmt:first-child { border-top:0; }
.fcra .fb-stmt-label { font-size:14px; font-weight:600; margin-bottom:10px; }
.fcra .fb-scale { display:flex; gap:8px; }
.fcra .fb-dot { flex:1; height:44px; border:1.5px solid var(--line); background:#fff; border-radius:11px; font:inherit; font-weight:700; font-size:15px; cursor:pointer; color:var(--muted); }
.fcra .fb-dot.on { border-color:var(--teal); background:var(--teal); color:#fff; }
.fcra .fb-anchors { display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-top:5px; }
.fcra .fb-textarea { width:100%; font:inherit; padding:12px 14px; border:1px solid var(--line); border-radius:13px; background:#fff; color:var(--ink); resize:vertical; }
.fcra .fb-textarea:focus-visible { outline:3px solid #8fd0c9; outline-offset:2px; }
.fcra .fb-thanks { text-align:center; padding:18px 6px 8px; }
.fcra .fb-thanks .fb-tick { font-size:44px; }
.fcra .fb-thanks h2 { margin:6px 0 4px; }
.fcra .fb-thanks .btn { margin-top:14px; }

@media print {
  body, .fcra { background:#fff !important; }
  .fcra .wrap, .fcra .brandbar, .fcra .emg, .fcra .stepper, .fcra .gate-bg { display:none !important; }
  .fcra .summary-bg { position:static; background:#fff; padding:0; overflow:visible; }
  .fcra .summary-doc { box-shadow:none; border-radius:0; max-width:100%; padding:0; }
  .fcra .summary-actions { display:none !important; }
  .fcra .summary-band { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
}

/* ---- Landing hub ---- */
.fcra .hero { background:linear-gradient(135deg, var(--teal) 0%, var(--teal-d) 100%); border:0; color:#fff; box-shadow:0 10px 30px rgba(10,95,90,.22); }
.fcra .hero .eyebrow { color:#bfe8e3; }
.fcra .hero h1 { color:#fff; }
.fcra .hero p { color:#d7ecea; margin-bottom:16px; }
.fcra .btn.hero-cta { background:#fff; color:var(--teal-d); font-weight:800; font-size:16px; padding:16px; box-shadow:0 6px 18px rgba(0,0,0,.16); }
.fcra .btn.hero-cta:hover { background:#f2fbfa; }
.fcra .hubtiles { display:grid; gap:10px; grid-template-columns:repeat(3,1fr); margin-top:14px; }
.fcra .hubtile { display:flex; flex-direction:column; align-items:flex-start; gap:7px; text-align:left; background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:15px 16px; font:inherit; color:var(--ink); cursor:pointer; transition:border-color .15s, box-shadow .15s, transform .05s; }
.fcra .hubtile:hover { border-color:var(--teal); box-shadow:0 3px 12px rgba(13,125,118,.12); }
.fcra .hubtile:active { transform:translateY(1px); }
.fcra .hubtile .hi { font-size:24px; line-height:1; flex:none; }
.fcra .hubtile .htx { display:flex; flex-direction:column; gap:2px; }
.fcra .hubtile .ht { font-weight:700; font-size:14px; }
.fcra .hubtile .hs { font-size:12px; color:var(--muted); line-height:1.35; }
.fcra .panelhead { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
.fcra .panelhead h2 { margin:0; }
@media (max-width:560px){
  .fcra .hubtiles { grid-template-columns:1fr; }
  .fcra .hubtile { flex-direction:row; align-items:center; }
  .fcra .hubtile .hi { width:28px; text-align:center; }
  .fcra .hubtile .htx { flex:1; }
}
`;

/* ------------------------------------------------------------------ */
/* Small UI atoms                                                      */
/* ------------------------------------------------------------------ */
function Meter({ level, lang }) {
  if (level === "info") return null;
  const order = { average: "a", moderate: "m", high: "h" };
  const active = order[level];
  const segs = [
    { k: "a", t: L("Average", "Biasa") },
    { k: "m", t: L("Moderate", "Sederhana") },
    { k: "h", t: L("Higher", "Tinggi") },
  ];
  return (
    <div className="meter">
      {segs.map((s) => (
        <div key={s.k} className={"seg " + (s.k === active ? s.k : "")}>
          <div className="bar" style={s.k === active ? {} : { opacity: 0.35 }} />
          {pick(s.t, lang)}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cancer colour palette for pedigree                                  */
/* ------------------------------------------------------------------ */
const CANCER_FILL = {
  colorectal: "#c23a3a",
  breast: "#e6a12f",
  ovarian: "#9b59b6",
  lung: "#3498db",
  cervical: "#e91e63",
  npc: "#00897b",
};

/* ------------------------------------------------------------------ */
/* Pedigree — standard clinical-style family tree (SVG)                */
/* ------------------------------------------------------------------ */
function Pedigree({ relatives, profile, lang }) {
  const tr = (v) => pick(v, lang);

  const FEMALE_RELS = ["mother", "sister", "daughter", "grandmother", "aunt", "niece"];
  const sexOf = (relId) => (FEMALE_RELS.includes(relId) ? "F" : "M");

  // Generation mapping (0 = grandparents, 1 = parents/aunts, 2 = proband/siblings, 3 = children)
  const genOf = (relId) => {
    if (["grandmother", "grandfather"].includes(relId)) return 0;
    if (["mother", "father", "aunt", "uncle"].includes(relId)) return 1;
    if (["sister", "brother"].includes(relId)) return 2;
    return 3;
  };

  // Build node list
  const proband = {
    id: "proband", gen: 2, sex: profile.sex === "female" ? "F" : "M",
    label: tr(L("You", "Anda")), isProband: true, cancer: null, side: "center",
  };

  const nodes = relatives.map((r) => ({
    id: r.id, gen: genOf(r.relationship), sex: sexOf(r.relationship),
    label: tr(RELATIONSHIPS.find((rel) => rel.id === r.relationship)?.label || L("?", "?")),
    isProband: false, cancer: r.cancer, side: r.side || "center", relationship: r.relationship,
  }));
  nodes.push(proband);

  // Sort within each gen: maternal left, center, paternal right, then alphabetical
  const sideOrder = { maternal: 0, center: 1, unknown: 1, paternal: 2, "": 1 };
  nodes.sort((a, b) => {
    if (a.gen !== b.gen) return a.gen - b.gen;
    if (a.isProband) return 0;
    if (b.isProband) return 0;
    const sa = sideOrder[a.side] ?? 1;
    const sb = sideOrder[b.side] ?? 1;
    return sa - sb;
  });

  // Group by generation
  const genMap = {};
  nodes.forEach((n) => { (genMap[n.gen] = genMap[n.gen] || []).push(n); });
  const activeGens = Object.keys(genMap).map(Number).sort((a, b) => a - b);

  // Layout constants
  const SYM = 34;
  const GAP_X = 56;
  const GAP_Y = 82;
  const PAD = 36;
  const LEGEND_H = 50;

  const maxPerRow = Math.max(...activeGens.map((g) => genMap[g].length));
  const svgW = Math.max(maxPerRow * (SYM + GAP_X) - GAP_X + PAD * 2, 340);
  const svgH = activeGens.length * GAP_Y + PAD * 2 + LEGEND_H;

  // Assign positions
  const pos = new Map();
  activeGens.forEach((g, gi) => {
    const group = genMap[g];
    const rowW = group.length * SYM + (group.length - 1) * GAP_X;
    const startX = (svgW - rowW) / 2 + SYM / 2;
    const y = PAD + gi * GAP_Y + SYM / 2;
    group.forEach((n, ni) => {
      pos.set(n.id, { x: startX + ni * (SYM + GAP_X), y });
    });
  });

  // Find parent nodes for connection lines
  const motherNode = nodes.find((n) => n.relationship === "mother");
  const fatherNode = nodes.find((n) => n.relationship === "father");
  const probandPos = pos.get("proband");

  // Unique cancers present for legend
  const activeCancers = [...new Set(relatives.map((r) => r.cancer))];

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", maxWidth: svgW, display: "block", margin: "0 auto" }}
      xmlns="http://www.w3.org/2000/svg" role="img"
      aria-label={tr(L("Family pedigree diagram", "Rajah silsilah keluarga"))}>
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#0d7d76" />
        </marker>
      </defs>

      {/* Connection lines */}
      {/* Parents → Proband */}
      {motherNode && probandPos && pos.get(motherNode.id) && (
        <line x1={pos.get(motherNode.id).x} y1={pos.get(motherNode.id).y + SYM / 2 + 2}
          x2={probandPos.x} y2={probandPos.y - SYM / 2 - 2}
          stroke="#bcc9c7" strokeWidth="1.5" strokeDasharray="4,3" />
      )}
      {fatherNode && probandPos && pos.get(fatherNode.id) && (
        <line x1={pos.get(fatherNode.id).x} y1={pos.get(fatherNode.id).y + SYM / 2 + 2}
          x2={probandPos.x} y2={probandPos.y - SYM / 2 - 2}
          stroke="#bcc9c7" strokeWidth="1.5" strokeDasharray="4,3" />
      )}
      {/* Marriage line between parents */}
      {motherNode && fatherNode && pos.get(motherNode.id) && pos.get(fatherNode.id) && (
        <line x1={pos.get(motherNode.id).x + SYM / 2 + 2} y1={pos.get(motherNode.id).y}
          x2={pos.get(fatherNode.id).x - SYM / 2 - 2} y2={pos.get(fatherNode.id).y}
          stroke="#5c6b69" strokeWidth="2" />
      )}
      {/* Siblings — horizontal bracket to proband */}
      {nodes.filter((n) => ["sister", "brother"].includes(n.relationship)).map((sib) => {
        const sp = pos.get(sib.id);
        if (!sp || !probandPos) return null;
        const midY = sp.y - SYM / 2 - 10;
        return (
          <g key={sib.id}>
            <polyline points={`${sp.x},${sp.y - SYM / 2 - 2} ${sp.x},${midY} ${probandPos.x},${midY} ${probandPos.x},${probandPos.y - SYM / 2 - 2}`}
              fill="none" stroke="#bcc9c7" strokeWidth="1.5" strokeDasharray="4,3" />
          </g>
        );
      })}
      {/* Children — line from proband down */}
      {nodes.filter((n) => ["daughter", "son"].includes(n.relationship)).map((ch) => {
        const cp = pos.get(ch.id);
        if (!cp || !probandPos) return null;
        return (
          <line key={ch.id} x1={probandPos.x} y1={probandPos.y + SYM / 2 + 2}
            x2={cp.x} y2={cp.y - SYM / 2 - 2}
            stroke="#bcc9c7" strokeWidth="1.5" strokeDasharray="4,3" />
        );
      })}

      {/* Nodes */}
      {nodes.map((n) => {
        const p = pos.get(n.id);
        if (!p) return null;
        const fill = n.cancer ? (CANCER_FILL[n.cancer] || "#c23a3a") : "#ffffff";
        const stroke = n.isProband ? "#0d7d76" : "#5c6b69";
        const sw = n.isProband ? 3 : 1.5;
        return (
          <g key={n.id}>
            {n.sex === "F" ? (
              <circle cx={p.x} cy={p.y} r={SYM / 2} fill={fill} stroke={stroke} strokeWidth={sw} />
            ) : (
              <rect x={p.x - SYM / 2} y={p.y - SYM / 2} width={SYM} height={SYM} fill={fill} stroke={stroke} strokeWidth={sw} />
            )}
            {/* Proband arrow */}
            {n.isProband && (
              <line x1={p.x - SYM / 2 - 18} y1={p.y + SYM / 2 + 12}
                x2={p.x - SYM / 2 - 3} y2={p.y + 3}
                stroke="#0d7d76" strokeWidth="2" markerEnd="url(#arrowhead)" />
            )}
            {/* Label */}
            <text x={p.x} y={p.y + SYM / 2 + 14} textAnchor="middle" fontSize="10"
              fontFamily="Plus Jakarta Sans, system-ui, sans-serif" fontWeight={n.isProband ? 800 : 600}
              fill={n.isProband ? "#0d7d76" : "#5c6b69"}>{n.label}</text>
          </g>
        );
      })}

      {/* Legend */}
      <g transform={`translate(${PAD}, ${svgH - LEGEND_H + 8})`}>
        <text fontSize="10" fontWeight="700" fill="#5c6b69" fontFamily="Plus Jakarta Sans, system-ui, sans-serif">
          {tr(L("Legend", "Petunjuk"))}:
        </text>
        <circle cx={50} cy={-3} r={6} fill="#fff" stroke="#5c6b69" strokeWidth="1.2" />
        <text x={60} fontSize="9" fill="#5c6b69" fontFamily="Plus Jakarta Sans, system-ui, sans-serif">
          {tr(L("Female", "Perempuan"))}
        </text>
        <rect x={100} y={-9} width={12} height={12} fill="#fff" stroke="#5c6b69" strokeWidth="1.2" />
        <text x={116} fontSize="9" fill="#5c6b69" fontFamily="Plus Jakarta Sans, system-ui, sans-serif">
          {tr(L("Male", "Lelaki"))}
        </text>
        {activeCancers.map((c, i) => {
          const meta = CANCER_CHOICES.find((cc) => cc.id === c);
          return (
            <g key={c} transform={`translate(0, ${18 + i * 16})`}>
              <rect x={50} y={-8} width={10} height={10} rx={2} fill={CANCER_FILL[c] || "#c23a3a"} />
              <text x={66} fontSize="9" fill="#5c6b69" fontFamily="Plus Jakarta Sans, system-ui, sans-serif">
                {meta ? tr(meta.label) : c}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* CPG AI Q&A — uses Anthropic API with web search                     */
/* ------------------------------------------------------------------ */
const CPG_LINKS = [
  { label: "Colorectal Carcinoma (2017)", url: "https://www.acadmed.org.my/index.cfm?menuid=67" },
  { label: "Breast Cancer (3rd Ed, 2021)", url: "https://www.acadmed.org.my/index.cfm?menuid=67" },
  { label: "Early-Stage NSCLC (1st Ed, 2025)", url: "https://www.lungcancer.net.my" },
  { label: "Cervical Cancer", url: "https://www.acadmed.org.my/index.cfm?menuid=67" },
  { label: "AMM CPG Directory", url: "https://www.acadmed.org.my/index.cfm?menuid=67" },
];

function CpgChat({ results, profile, relatives, lang }) {
  const tr = (v) => pick(v, lang);
  const [q, setQ] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const systemPrompt = `You are a clinical guideline assistant for Malaysian healthcare, specialising in cancer screening.
Context: The user has just completed a family cancer risk assessment. Their profile: sex=${profile.sex}, age=${profile.age}, ethnicity=${profile.ethnicity}, state=${profile.state}, smoking=${profile.smoke || "unknown"}${profile.smoke20y ? " (20+ years duration)" : ""}, secondHandSmoke=${profile.passiveSmoke || "unknown"}, occupationalExposures=${(profile.occupationalHazards || []).join(",") || "none reported"}.
Risk results: ${results.map((r) => `${r.id}: ${r.level}`).join(", ")}.
Anchoring per module: ${results.map((r) => `${r.id} → ${r.source ? r.source : "no anchoring CPG (flagged provisional)"}`).join("; ")}.
Note: the Cervical CPG (2nd Ed., 2015) covers diagnosis/treatment only; it does NOT set screening intervals or HPV vaccine policy — those come from Malaysia's national programme, so attribute them accordingly and do not cite the CPG for them.
Note: the lung source is an expert consensus by Lung Cancer Network Malaysia and partner societies (1st Ed., April 2025), NOT a MaHTAS/MOH CPG — Malaysia had no MOH lung cancer CPG when it was written, so describe it as guidelines/consensus rather than a KKM CPG. Its screening rules are: LDCT offered at ages 45-75 with >=20 years smoking duration (pack-years deliberately dropped in favour of duration); LDCT recommended for non-smokers aged >40 with a first-degree relative with lung cancer, starting at 40 or the youngest affected relative's age at diagnosis, whichever is first; LDCT is the gold standard; and suspected lung cancer should reach a lung specialist within 2 weeks. It does NOT set screening rules for occupational exposure or second-hand smoke, and does not cover small cell lung cancer or advanced disease — do not cite it for those.
Note: NPC is anchored to the MOH/MaHTAS CPG Management of Nasopharyngeal Carcinoma (2016, MOH/P/PAK/326.16(GU)) — a genuine KKM/MaHTAS CPG (developed with MSO-HNS and the Academy of Medicine Malaysia), so describe it as a KKM CPG, NOT a society consensus. It covers risk factors, clinical presentation, referral, investigations, staging, treatment and follow-up. It explicitly does NOT recommend population screening — EBV serology and nasoendoscopy screening were judged to have insufficient evidence (§2.3) — so do not describe a routine NPC screening schedule, and do not present the EBV blood test as a stand-alone diagnostic test. Referral for the warning signs is "as soon as possible" (consensus, Recommendation 1), not a fixed week-count. A first-degree relative with NPC is a cited risk factor (relative risk ~3.1 to 8.0) but the CPG sets no family-history screening rule.
Relatives with cancer: ${relatives.map((r) => `${r.relationship} — ${r.cancer}`).join("; ") || "none"}.

INSTRUCTIONS:
- Focus on Malaysian Clinical Practice Guidelines (CPGs) from the Academy of Medicine of Malaysia (AMM) and KKM.
- Use web search to find current CPG recommendations when relevant. Search acadmed.org.my and moh.gov.my for Malaysian guidelines.
- Always state which CPG edition your answer comes from.
- If no Malaysian CPG or local consensus exists for a topic, say so clearly and note that international guidelines need clinician confirmation. Never blur a society consensus into a KKM CPG.
- Keep answers concise (3-5 sentences). Use lay language with medical terms in brackets.
- End every answer with: "This is AI-generated guidance. Please confirm with your doctor."
- Answer in ${lang === "bm" ? "Bahasa Malaysia" : "English"}.`;

  const askCpg = async () => {
    if (!q.trim() || loading) return;
    const userMsg = q.trim();
    setQ("");
    setMessages((m) => [...m, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const apiMessages = [
        ...messages.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text })),
        { role: "user", content: userMsg },
      ];

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: systemPrompt,
          messages: apiMessages,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });

      const data = await response.json();

      // /api/chat returns { error: "..." } on any server-side failure (missing
      // ANTHROPIC_API_KEY, bad model, web search not enabled, etc.). Surface it
      // instead of hiding every failure behind a generic message — otherwise the
      // panel looks identically "broken" for entirely different causes.
      if (!response.ok || data.error) {
        console.error("CpgChat: /api/chat failed", response.status, data);
        const detail = typeof data.error === "string" && data.error
          ? data.error
          : tr(L(`The guideline assistant returned an error (${response.status}). Check that ANTHROPIC_API_KEY is set in Vercel and that a fresh build has run.`, `Pembantu garis panduan memulangkan ralat (${response.status}). Pastikan ANTHROPIC_API_KEY ditetapkan di Vercel dan binaan baharu telah dijalankan.`));
        setMessages((m) => [...m, { role: "assistant", text: detail }]);
        return;
      }

      const answer = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n").trim() || tr(L("The assistant did not return any text. If a web search was running it may have timed out — please try again.", "Pembantu tidak memulangkan sebarang teks. Jika carian web sedang berjalan ia mungkin tamat masa — sila cuba lagi."));
      setMessages((m) => [...m, { role: "assistant", text: answer }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: tr(L("Connection error. Please try again.", "Ralat sambungan. Sila cuba lagi.")) }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card cpg-chat">
      <h3 style={{ marginBottom: 4 }}>💬 {tr(L("Ask about Malaysian guidelines", "Tanya tentang garis panduan Malaysia"))}</h3>
      <p className="muted small" style={{ marginBottom: 10 }}>
        {tr(L(
          "Ask any question about cancer screening guidelines. The AI will search Malaysian CPGs and medical sources.",
          "Tanya apa-apa soalan tentang garis panduan saringan kanser. AI akan mencari CPG Malaysia dan sumber perubatan."
        ))}
      </p>

      {/* Quick-ask chips */}
      <div className="chips" style={{ marginBottom: 12 }}>
        {[
          L("When should I start mammogram?", "Bila patut mula mamogram?"),
          L("What is iFOBT?", "Apa itu iFOBT?"),
          L("Is HPV vaccine free in Malaysia?", "Adakah vaksin HPV percuma di Malaysia?"),
        ].map((suggestion, i) => (
          <button key={i} className="chip" style={{ fontSize: 12, padding: "7px 12px" }}
            onClick={() => { setQ(tr(suggestion)); }}>{tr(suggestion)}</button>
        ))}
      </div>

      {/* Chat history */}
      {messages.length > 0 && (
        <div className="cpg-messages" style={{ maxHeight: 320, overflowY: "auto", marginBottom: 12 }}>
          {messages.map((m, i) => (
            <div key={i} className={`cpg-msg cpg-${m.role}`}>
              <span className="cpg-role">{m.role === "user" ? "🧑" : "🤖"}</span>
              <div className="cpg-bubble">{m.text}</div>
            </div>
          ))}
          {loading && (
            <div className="cpg-msg cpg-assistant">
              <span className="cpg-role">🤖</span>
              <div className="cpg-bubble cpg-loading">{tr(L("Searching guidelines…", "Mencari garis panduan…"))}</div>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div style={{ display: "flex", gap: 8 }}>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && askCpg()}
          placeholder={tr(L("Type your question…", "Taip soalan anda…"))}
          style={{ flex: 1 }} disabled={loading} />
        <button className="btn primary" onClick={askCpg} disabled={!q.trim() || loading}
          style={{ padding: "12px 18px", ...(!q.trim() || loading ? { opacity: .5 } : {}) }}>
          {loading ? "…" : "→"}
        </button>
      </div>

      {/* CPG Reference links */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--line)" }}>
        <p className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
          📚 {tr(L("Malaysian CPG references", "Rujukan CPG Malaysia"))}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {CPG_LINKS.map((lnk, i) => (
            <a key={i} href={lnk.url} target="_blank" rel="noopener noreferrer"
              className="chip" style={{ fontSize: 11, padding: "5px 10px", textDecoration: "none", color: "var(--teal-d)" }}>
              🔗 {lnk.label}
            </a>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 6, fontSize: 11 }}>
          {tr(L(
            "Source: Academy of Medicine of Malaysia (AMM) — acadmed.org.my",
            "Sumber: Akademi Perubatan Malaysia (AMM) — acadmed.org.my"
          ))}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Labelled numbered stepper (clearer journey)                         */
/* ------------------------------------------------------------------ */
const STEP_LABELS = [
  L("About you", "Tentang anda"),
  L("Family history", "Sejarah keluarga"),
  L("Inherited conditions", "Keadaan keturunan"),
  L("Your plan", "Pelan anda"),
  L("Feedback", "Maklum balas"),
];

function Stepper({ step, lang, onJump }) {
  const tr = (v) => pick(v, lang);
  return (
    <nav className="stepper" aria-label={tr(L("Progress", "Kemajuan"))}>
      {STEP_LABELS.map((lab, i) => {
        const n = i + 1;
        const state = step === n ? "on" : step > n ? "done" : "todo";
        const clickable = step > n;
        return (
          <button
            key={n}
            type="button"
            className={"stnode " + state}
            aria-current={step === n ? "step" : undefined}
            disabled={!clickable}
            onClick={() => clickable && onJump(n)}
          >
            <span className="stnum">{step > n ? "✓" : n}</span>
            <span className="stlab">{tr(lab)}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Symptom helpers — shared by the check card, result cards & summary  */
/* ------------------------------------------------------------------ */
// Which assessed cancers have at least one ticked symptom.
function flaggedCancers(results, symptoms) {
  const out = {};
  results.forEach((res) => {
    const items = SYMPTOMS[res.id] || [];
    const hit = items.filter((it) => symptoms[it.id]);
    if (hit.length) out[res.id] = hit;
  });
  return out;
}
function flaggedGeneral(symptoms) {
  return GENERAL_SYMPTOMS.filter((it) => symptoms[it.id]);
}
function anyFlagged(results, symptoms) {
  return Object.keys(flaggedCancers(results, symptoms)).length > 0 ||
    flaggedGeneral(symptoms).length > 0;
}

/* ------------------------------------------------------------------ */
/* Post-results targeted symptom check                                 */
/* Only asks about the cancers the app actually assessed. Positive     */
/* answers escalate the plan; it NEVER gives an all-clear.             */
/* ------------------------------------------------------------------ */
function SymptomCheck({ results, symptoms, setSymptoms, noneChecked, setNoneChecked, cancerMeta, lang, onEmergency }) {
  const tr = (v) => pick(v, lang);

  const toggle = (id) => {
    setNoneChecked(false);
    setSymptoms((s) => ({ ...s, [id]: !s[id] }));
  };
  const markNone = () => {
    setSymptoms({});
    setNoneChecked(true);
  };

  const flaggedC = flaggedCancers(results, symptoms);
  const flaggedG = flaggedGeneral(symptoms);
  const hasFlag = Object.keys(flaggedC).length > 0 || flaggedG.length > 0;

  // Build the group list from the cancers actually shown in results.
  const groups = results
    .map((res) => ({ id: res.id, meta: cancerMeta(res.id), items: SYMPTOMS[res.id] || [] }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="card symcard">
      <p className="eyebrow">{tr(L("Symptom check", "Semakan simptom"))}</p>
      <h3 style={{ marginBottom: 6 }}>🔎 {tr(L("Do you have any warning signs right now?", "Adakah anda ada tanda amaran sekarang?"))}</h3>
      <p className="muted small" style={{ marginBottom: 4 }}>
        {tr(L(
          "These are the warning signs linked to the cancers we just looked at for you. Tick anything you have noticed. This is a prompt to act sooner — it is not a diagnosis.",
          "Ini tanda amaran berkaitan kanser yang baru kami semak untuk anda. Tandakan apa-apa yang anda perasan. Ini galakan untuk bertindak lebih awal — bukan diagnosis."
        ))}
      </p>

      {groups.map((g) => (
        <div className="symgroup" key={g.id}>
          <div className="symgroup-h">{g.meta.emoji} {tr(g.meta.label)}</div>
          <div className="symlist">
            {g.items.map((it) => (
              <button key={it.id} type="button"
                className={"symitem" + (symptoms[it.id] ? " on" : "")}
                aria-pressed={!!symptoms[it.id]}
                onClick={() => toggle(it.id)}>
                <span className="symbox">{symptoms[it.id] ? "☑" : "☐"}</span>
                <span>{tr(it.label)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* General / constitutional signs — always shown */}
      <div className="symgroup">
        <div className="symgroup-h">🩺 {tr(L("General signs (any cancer)", "Tanda umum (mana-mana kanser)"))}</div>
        <div className="symlist">
          {GENERAL_SYMPTOMS.map((it) => (
            <button key={it.id} type="button"
              className={"symitem" + (symptoms[it.id] ? " on" : "")}
              aria-pressed={!!symptoms[it.id]}
              onClick={() => toggle(it.id)}>
              <span className="symbox">{symptoms[it.id] ? "☑" : "☐"}</span>
              <span>{tr(it.label)}</span>
            </button>
          ))}
        </div>
      </div>

      <button type="button"
        className={"symnone" + (noneChecked ? " on" : "")}
        onClick={markNone}>
        {noneChecked ? "☑ " : "☐ "}{tr(L("None of these apply to me right now", "Tiada satu pun berkaitan dengan saya sekarang"))}
      </button>

      {/* Verdict */}
      {hasFlag && (
        <div className="symverdict flag-red">
          <div className="sv-h">⚠ {tr(L("Please see your nearest doctor about these signs", "Sila jumpa doktor berdekatan tentang tanda ini"))}</div>
          <p className="sv-p">
            {tr(L(
              "You have noted one or more warning signs. Please visit your nearest doctor or clinic and mention these signs. Bring your doctor summary.",
              "Anda telah menandakan satu atau lebih tanda amaran. Sila jumpa doktor atau klinik berdekatan dan nyatakan tanda ini. Bawa ringkasan doktor anda."
            ))}
          </p>
          <ul className="sv-list">
            {Object.entries(flaggedC).map(([cid, items]) => (
              <li key={cid}><b>{cancerMeta(cid).emoji} {tr(cancerMeta(cid).label)}:</b> {items.map((it) => tr(it.label)).join("; ")}</li>
            ))}
            {flaggedG.length > 0 && (
              <li><b>🩺 {tr(L("General", "Umum"))}:</b> {flaggedG.map((it) => tr(it.label)).join("; ")}</li>
            )}
          </ul>
          <p className="sv-emg">
            {tr(L(
              "Only call 999 or go to emergency if a symptom is severe or sudden — for example shortness of breath, active bleeding, choking, or chest pain.",
              "Hubungi 999 atau ke kecemasan hanya jika simptom teruk atau mengejut — contohnya sesak nafas, pendarahan aktif, tercekik, atau sakit dada."
            ))}{" "}
            <button type="button" className="linkbtn" onClick={onEmergency}>{tr(L("Emergency guidance", "Panduan kecemasan"))}</button>
          </p>
        </div>
      )}
      {!hasFlag && noneChecked && (
        <div className="symverdict flag-teal">
          <div className="sv-h">✅ {tr(L("No red-flag symptoms reported today", "Tiada simptom amaran dilaporkan hari ini"))}</div>
          <p className="sv-p">
            {tr(L(
              "This does not rule anything out. Continue with the screening plan below, and see a doctor if any of these signs appear later.",
              "Ini tidak menolak apa-apa. Teruskan pelan saringan di bawah, dan jumpa doktor jika mana-mana tanda ini muncul kemudian."
            ))}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback — feasibility-study data capture (step 5)                  */
/* Submits to /api/feedback (serverless), which forwards via EmailJS   */
/* server-side so no keys are exposed in the browser.                  */
/* ------------------------------------------------------------------ */
const FEEDBACK_STATEMENTS = [
  { id: "easy", label: L("The tool was easy to use.", "Alat ini mudah digunakan.") },
  { id: "clear", label: L("The language was clear and easy to understand.", "Bahasanya jelas dan mudah difahami.") },
  { id: "understood", label: L("I understood my result and what to do next.", "Saya faham keputusan saya dan langkah seterusnya.") },
  { id: "useful", label: L("This was useful to me.", "Ini berguna kepada saya.") },
  { id: "intent", label: L("I intend to discuss this with a doctor or take the summary to a clinic.", "Saya berhasrat membincangkannya dengan doktor atau membawa ringkasan ke klinik.") },
];

const FEEDBACK_ROLES = [
  { id: "public", label: L("Member of the public", "Orang awam") },
  { id: "patient", label: L("Patient or caregiver", "Pesakit atau penjaga") },
  { id: "hcw", label: L("Healthcare worker", "Petugas kesihatan") },
  { id: "na", label: L("Prefer not to say", "Tidak mahu nyatakan") },
];

function FeedbackForm({ results, lang, onSkip, onDone }) {
  const tr = (v) => pick(v, lang);
  const [role, setRole] = useState("");
  const [ratings, setRatings] = useState({});
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | done | error

  const setRating = (id, val) => setRatings((r) => ({ ...r, [id]: val }));

  const submit = async () => {
    setStatus("sending");
    // Non-identifying risk summary (levels only) — useful feasibility covariate.
    const riskProfile = results.map((r) => `${r.id}:${r.level}`).join("; ");
    const payload = {
      language: lang,
      role: role || "unset",
      ratings,
      comment: comment.trim().slice(0, 1000),
      riskProfile,
      version: APP_VERSION,
      submittedAt: new Date().toISOString(),
    };
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("bad status");
      setStatus("done");
      if (onDone) onDone();
    } catch (err) {
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div className="card fbcard">
        <div className="fb-thanks">
          <div className="fb-tick">✅</div>
          <h2>{tr(L("Thank you", "Terima kasih"))}</h2>
          <p className="muted">{tr(L(
            "Your feedback has been recorded. It helps us test whether this tool is useful and easy to use.",
            "Maklum balas anda telah direkodkan. Ia membantu kami menguji sama ada alat ini berguna dan mudah digunakan."
          ))}</p>
          <button className="btn primary" onClick={onSkip}>{tr(L("Start over", "Mula semula"))}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card fbcard">
      <p className="eyebrow">{tr(L("Step 5 of 5", "Langkah 5 dari 5"))}</p>
      <h2>🗣️ {tr(L("Your feedback", "Maklum balas anda"))}</h2>
      <p className="muted small">
        {tr(L(
          "This is a research and education prototype. Your feedback helps us test whether it is useful and easy to use. It is anonymous — please do NOT enter any personal or health details.",
          "Ini prototaip penyelidikan dan pendidikan. Maklum balas anda membantu kami menguji sama ada ia berguna dan mudah digunakan. Ia tanpa nama — sila JANGAN masukkan sebarang butiran peribadi atau kesihatan."
        ))}
      </p>

      {/* Role */}
      <label className="field" style={{ marginTop: 12 }}>
        <span>{tr(L("Which best describes you?", "Yang mana paling menggambarkan anda?"))}</span>
        <div className="chips">
          {FEEDBACK_ROLES.map((r) => (
            <button key={r.id} className="chip" aria-pressed={role === r.id}
              onClick={() => setRole(r.id)}>{tr(r.label)}</button>
          ))}
        </div>
      </label>

      {/* Likert statements */}
      <div className="fb-likert">
        {FEEDBACK_STATEMENTS.map((s) => (
          <div className="fb-stmt" key={s.id}>
            <div className="fb-stmt-label">{tr(s.label)}</div>
            <div className="fb-scale" role="group" aria-label={tr(s.label)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button"
                  className={"fb-dot" + (ratings[s.id] === n ? " on" : "")}
                  aria-pressed={ratings[s.id] === n}
                  onClick={() => setRating(s.id, n)}>{n}</button>
              ))}
            </div>
            <div className="fb-anchors">
              <span>{tr(L("Disagree", "Tidak setuju"))}</span>
              <span>{tr(L("Agree", "Setuju"))}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Comment */}
      <label className="field" style={{ marginTop: 6 }}>
        <span>{tr(L("Anything we could improve? (optional)", "Apa yang boleh kami perbaiki? (pilihan)"))}</span>
        <textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          placeholder={tr(L("No names or health details, please.", "Tiada nama atau butiran kesihatan, sila."))}
          className="fb-textarea"
        />
      </label>

      {status === "error" && (
        <div className="flag" style={{ background: "var(--red-soft)", borderColor: "#e6b3b3", color: "#8a2222" }}>
          {tr(L("Sorry — feedback could not be sent. Please try again in a moment.", "Maaf — maklum balas tidak dapat dihantar. Sila cuba lagi sebentar."))}
        </div>
      )}

      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn ghost" onClick={onSkip}>{tr(L("Skip", "Langkau"))}</button>
        <button className="btn primary" onClick={submit} disabled={status === "sending"}
          style={status === "sending" ? { opacity: .6 } : {}}>
          {status === "sending" ? tr(L("Sending…", "Menghantar…")) : tr(L("Send feedback", "Hantar maklum balas"))}
        </button>
      </div>

      <p className="muted small" style={{ marginTop: 12, fontSize: 11.5 }}>
        {tr(L(
          "By sending, you agree that your anonymous feedback may be used to evaluate and improve this prototype.",
          "Dengan menghantar, anda bersetuju maklum balas tanpa nama anda boleh digunakan untuk menilai dan menambah baik prototaip ini."
        ))}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* GP summary — printable sheet the patient brings to their doctor     */
/* ------------------------------------------------------------------ */
function GpSummary({ results, profile, relatives, symptoms, lang, cancerMeta, onClose }) {
  const tr = (v) => pick(v, lang);
  const today = new Date().toLocaleDateString(lang === "bm" ? "ms-MY" : "en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
  const sexLabel = profile.sex === "female" ? tr(L("Female", "Perempuan"))
    : profile.sex === "male" ? tr(L("Male", "Lelaki")) : "—";
  const ethLabel = (ETHNICITIES.find((e) => e.id === profile.ethnicity) || {}).label;

  // one-line recommended action per cancer = the "See a doctor?" step
  const actionOf = (res) => {
    const s = res.steps.find((x) => pick(x.title, "en") === "See a doctor?") || res.steps[0];
    return tr(s.body);
  };

  return (
    <div className="summary-bg" role="dialog" aria-modal="true">
      <div className="summary-doc">
        <h1>🧬 {tr(L("Family Cancer Risk — Summary for your doctor", "Risiko Kanser Keluarga — Ringkasan untuk doktor anda"))}</h1>
        <p className="meta">
          {tr(L("Generated", "Dijana"))}: {today} · {tr(APP_OWNER)} · {APP_VERSION}
        </p>

        {/* Disclaimer — top */}
        <div className="summary-band">
          <b>{tr(L("Please read — this is not a diagnosis.", "Sila baca — ini bukan diagnosis."))}</b>{" "}
          {tr(L(
            "This sheet was generated by a research and educational prototype from information the patient entered themselves. The risk levels and screening suggestions are provisional and are NOT medical advice. They must be reviewed, corrected and acted upon only by a qualified doctor. Clinical responsibility remains entirely with the treating clinician.",
            "Helaian ini dijana oleh prototaip penyelidikan dan pendidikan daripada maklumat yang dimasukkan sendiri oleh pesakit. Tahap risiko dan cadangan saringan adalah sementara dan BUKAN nasihat perubatan. Ia mesti disemak, dibetulkan dan ditindaki hanya oleh doktor yang bertauliah. Tanggungjawab klinikal kekal sepenuhnya pada doktor yang merawat."
          ))}
        </div>

        {/* Profile */}
        <div className="summary-sec">
          <h3>{tr(L("Person (self-reported, no identifiers)", "Individu (dilaporkan sendiri, tanpa pengecam)"))}</h3>
          <div className="summary-kv">
            <div><span>{tr(L("Age", "Umur"))}: </span>{profile.age || "—"}</div>
            <div><span>{tr(L("Sex", "Jantina"))}: </span>{sexLabel}</div>
            <div><span>{tr(L("Ethnicity", "Etnik"))}: </span>{ethLabel ? tr(ethLabel) : "—"}</div>
            <div><span>{tr(L("State", "Negeri"))}: </span>{profile.state || "—"}</div>
            <div><span>{tr(L("Smoking", "Merokok"))}: </span>{
              profile.smoke === "current" ? tr(L("Current", "Sekarang"))
              : profile.smoke === "past" ? tr(L("Past", "Dulu"))
              : profile.smoke === "never" ? tr(L("Never", "Tidak pernah")) : "—"
            }{profile.smoke20y ? tr(L(" (20+ years)", " (20+ tahun)")) : ""}</div>
            <div><span>{tr(L("Second-hand smoke", "Asap rokok orang lain"))}: </span>{
              profile.passiveSmoke === "current" ? tr(L("Currently exposed", "Terdedah sekarang"))
              : profile.passiveSmoke === "past" ? tr(L("Past exposure", "Pernah terdedah"))
              : profile.passiveSmoke === "no" ? tr(L("None reported", "Tiada dilaporkan")) : "—"
            }</div>
            <div><span>{tr(L("Occupational exposure", "Pendedahan pekerjaan"))}: </span>{
              (profile.occupationalHazards || []).length
                ? profile.occupationalHazards.map((id) => tr((OCCUPATIONAL_HAZARDS.find((h) => h.id === id) || {}).label || id)).join("; ")
                : tr(L("None reported", "Tiada dilaporkan"))
            }</div>
          </div>
        </div>

        {/* Family history */}
        <div className="summary-sec">
          <h3>{tr(L("Reported family history", "Sejarah keluarga dilaporkan"))}</h3>
          {relatives.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>{tr(L("No affected relatives reported.", "Tiada saudara terjejas dilaporkan."))}</p>
          ) : (
            <div>
              {relatives.map((r) => {
                const rel = RELATIONSHIPS.find((x) => x.id === r.relationship);
                const c = cancerMeta(r.cancer);
                const ab = AGE_BANDS.find((a) => a.id === r.ageBand);
                return (
                  <div className="summary-row" key={r.id}>
                    <span className="cn">{tr(rel.label)}</span>
                    <span className="ac">
                      {c.emoji} {tr(c.label)}
                      {rel.degree === 2 ? " · " + tr(L("2nd degree", "darjah ke-2")) : " · " + tr(L("1st degree", "darjah ke-1"))}
                      {ab && ab.id !== "unknown" ? " · " + tr(L("dx", "didiagnos")) + " " + tr(ab.label) : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pedigree */}
        {relatives.length > 0 && (
          <div className="summary-sec">
            <h3>{tr(L("Pedigree", "Silsilah"))}</h3>
            <Pedigree relatives={relatives} profile={profile} lang={lang} />
          </div>
        )}

        {/* Risk + suggested action */}
        <div className="summary-sec">
          <h3>{tr(L("Provisional risk & screening prompt", "Risiko sementara & cadangan saringan"))}</h3>
          {results.map((res) => {
            const meta = cancerMeta(res.id);
            const r = RISK[res.level];
            return (
              <div className="summary-row" key={res.id}>
                <span className={"lv " + r.tone}>{tr(r.label)}</span>
                <span className="cn">{meta.emoji} {tr(meta.label)}</span>
                <span className="ac">{actionOf(res)}{res.flag ? " ⚠" : ""}</span>
              </div>
            );
          })}
          <p className="muted small" style={{ marginTop: 10 }}>
            ⚠ {tr(L(
              "Items marked ⚠ have no Malaysian CPG anchored in this prototype — confirm against the current guideline.",
              "Item bertanda ⚠ tiada CPG Malaysia dalam prototaip ini — sahkan dengan garis panduan semasa."
            ))}
          </p>
        </div>

        {/* Reported symptoms (red flags) */}
        {(() => {
          const flaggedC = flaggedCancers(results, symptoms || {});
          const flaggedG = flaggedGeneral(symptoms || {});
          const has = Object.keys(flaggedC).length > 0 || flaggedG.length > 0;
          return (
            <div className="summary-sec">
              <h3>{tr(L("Symptoms reported today", "Simptom dilaporkan hari ini"))}</h3>
              {!has ? (
                <p className="muted small" style={{ margin: 0 }}>
                  {tr(L("No red-flag symptoms reported at the time of assessment (does not exclude disease).", "Tiada simptom amaran dilaporkan semasa penilaian (tidak menolak penyakit)."))}
                </p>
              ) : (
                <div>
                  <p className="small" style={{ margin: "0 0 8px", fontWeight: 700, color: "#8a2222" }}>
                    ⚠ {tr(L("Red-flag symptoms reported — prompt review advised.", "Simptom amaran dilaporkan — semakan segera dinasihatkan."))}
                  </p>
                  {Object.entries(flaggedC).map(([cid, items]) => (
                    <div className="summary-row" key={cid}>
                      <span className="cn">{cancerMeta(cid).emoji} {tr(cancerMeta(cid).label)}</span>
                      <span className="ac">{items.map((it) => tr(it.label)).join("; ")}</span>
                    </div>
                  ))}
                  {flaggedG.length > 0 && (
                    <div className="summary-row">
                      <span className="cn">🩺 {tr(L("General", "Umum"))}</span>
                      <span className="ac">{flaggedG.map((it) => tr(it.label)).join("; ")}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* For the doctor: action + opinion */}
        <div className="summary-sec">
          <h3>{tr(L("For the attending doctor — action & opinion", "Untuk doktor yang merawat — tindakan & pendapat"))}</h3>
          <div className="gp-box">
            <span className="gp-label">{tr(L("Action taken / referral", "Tindakan diambil / rujukan"))}</span>
            <div className="gp-line" /><div className="gp-line" />
            <span className="gp-label" style={{ display: "block", marginTop: 14 }}>{tr(L("Clinical opinion", "Pendapat klinikal"))}</span>
            <div className="gp-line" /><div className="gp-line" />
            <div className="gp-sign">
              <div><span className="gp-label">{tr(L("Doctor's name & stamp", "Nama & cop doktor"))}</span><div className="gp-line" /></div>
              <div><span className="gp-label">{tr(L("Date", "Tarikh"))}</span><div className="gp-line" /></div>
            </div>
          </div>
        </div>

        {/* Disclaimer — repeated at the foot */}
        <div className="summary-band" style={{ marginTop: 18, marginBottom: 0 }}>
          <b>{tr(L("Reminder:", "Peringatan:"))}</b>{" "}
          {tr(L(
            "Not medical advice and not a diagnosis. Generated by a prototype for research and education only. Do not act on this sheet without a qualified doctor's review. In an emergency (heavy bleeding, severe pain, trouble breathing) go to the nearest emergency department or call 999.",
            "Bukan nasihat perubatan dan bukan diagnosis. Dijana oleh prototaip untuk penyelidikan dan pendidikan sahaja. Jangan bertindak atas helaian ini tanpa semakan doktor bertauliah. Dalam kecemasan (pendarahan banyak, sakit teruk, sukar bernafas) pergi ke jabatan kecemasan terdekat atau hubungi 999."
          ))}
        </div>
      </div>

      <div className="summary-actions">
        <button className="btn ghost" onClick={onClose}>← {tr(L("Back", "Kembali"))}</button>
        <button className="btn primary" onClick={() => window.print()}>
          🖨️ {tr(L("Print / Save as PDF", "Cetak / Simpan sebagai PDF"))}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* "Why use this app" — education card                                 */
/* ------------------------------------------------------------------ */
function WhyUse({ lang }) {
  const tr = (v) => pick(v, lang);
  const reasons = [
    {
      ico: "🔎",
      t: L("Early screening, early diagnosis, early detection", "Saringan awal, diagnosis awal, pengesanan awal"),
      b: L(
        "Most cancers in Malaysia are still found late. Knowing your risk early means starting the right test at the right age — when treatment works best.",
        "Kebanyakan kanser di Malaysia masih dikesan lewat. Mengetahui risiko awal bermakna memulakan ujian yang betul pada umur yang betul — ketika rawatan paling berkesan."
      ),
    },
    {
      ico: "👪",
      t: L("Raise awareness in your family", "Tingkatkan kesedaran dalam keluarga"),
      b: L(
        "When one relative has cancer, the rest of the family often shares part of that risk. This tool helps a patient's family understand what it means for them — and what to do.",
        "Apabila seorang saudara mengidap kanser, ahli keluarga lain sering berkongsi sebahagian risiko itu. Alat ini membantu keluarga pesakit memahami maksudnya untuk mereka — dan apa yang perlu dilakukan."
      ),
    },
    {
      ico: "🧭",
      t: L("A clear next step, not just a score", "Langkah seterusnya yang jelas, bukan sekadar skor"),
      b: L(
        "You get a plain answer: whether to see a doctor, which test to ask for, how often, and which warning signs matter — grounded in Malaysian guidelines.",
        "Anda dapat jawapan jelas: perlu jumpa doktor atau tidak, ujian mana, berapa kerap, dan tanda amaran yang penting — berpandukan garis panduan Malaysia."
      ),
    },
    {
      ico: "🔒",
      t: L("Private and free", "Peribadi dan percuma"),
      b: L(
        "No name, no IC, no phone number. Nothing is saved. Use it as often as you like.",
        "Tiada nama, tiada IC, tiada nombor telefon. Tiada apa disimpan. Guna seberapa kerap yang anda mahu."
      ),
    },
  ];
  return (
    <div className="card">
      <p className="eyebrow">{tr(L("Why use this app?", "Kenapa guna aplikasi ini?"))}</p>
      <h2>{tr(L("Cancer in your family isn't a verdict — it's information you can act on.", "Kanser dalam keluarga bukan hukuman — ia maklumat yang boleh anda tindaki."))}</h2>
      <div className="reasons">
        {reasons.map((r, i) => (
          <div className="reason" key={i}>
            <span className="rico">{r.ico}</span>
            <div><b>{tr(r.t)}</b><span>{tr(r.b)}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Registry snapshot — data visualisation from the NCR 2017–2021       */
/* ------------------------------------------------------------------ */
function RegistrySnapshot({ lang }) {
  const tr = (v) => pick(v, lang);
  const top10max = Math.max(...NCR_TOP10.map((d) => d.pct));
  const maleMax = Math.max(...NCR_MALE5.map((d) => d.asr));
  const femMax = Math.max(...NCR_FEMALE5.map((d) => d.asr));

  const BarRow = ({ label, value, unit, max, cls }) => (
    <div className="bar-row">
      <span className="lab">{label}</span>
      <span className="bar-track">
        <span className={"bar-fill " + (cls || "")} style={{ width: Math.max(4, (value / max) * 100) + "%" }} />
      </span>
      <span className="val">{value}{unit}</span>
    </div>
  );

  return (
    <div className="card">
      <p className="eyebrow">{tr(L("The picture in Malaysia", "Gambaran di Malaysia"))}</p>
      <h2>{tr(L("What the national cancer data tells us", "Apa yang data kanser kebangsaan tunjukkan"))}</h2>
      <p className="small muted">
        {tr(L(
          "Latest figures from Malaysia's National Cancer Registry (2017–2021). These are the reasons early awareness matters.",
          "Angka terkini daripada Pendaftaran Kanser Kebangsaan Malaysia (2017–2021). Inilah sebab kesedaran awal penting."
        ))}
      </p>

      {/* Big numbers */}
      <div className="statgrid">
        <div className="stat accent">
          <div className="big">{tr(NCR_LIFETIME)}</div>
          <div className="cap">{tr(L("Malaysians will develop cancer before age 75 — up from 1 in 9–10 the period before.", "rakyat Malaysia akan menghidap kanser sebelum umur 75 — meningkat daripada 1 drpd 9–10 sebelum ini."))}</div>
        </div>
        <div className="stat">
          <div className="big">{NCR_RATE.femaleNow}</div>
          <div className="cap">{tr(L("women per 100,000 diagnosed each year (was ", "wanita per 100,000 didiagnosis setahun (dahulu "))}{NCR_RATE.femalePrev}{")"}</div>
        </div>
        <div className="stat">
          <div className="big">{NCR_RATE.maleNow}</div>
          <div className="cap">{tr(L("men per 100,000 diagnosed each year (was ", "lelaki per 100,000 didiagnosis setahun (dahulu "))}{NCR_RATE.malePrev}{")"}</div>
        </div>
      </div>

      {/* Top 10 */}
      <div className="vizhead">{tr(L("Top 10 cancers — % of all cases", "10 kanser teratas — % daripada semua kes"))}</div>
      <div className="bars">
        {NCR_TOP10.map((d, i) => (
          <BarRow key={i} label={tr(d.name)} value={d.pct} unit="%" max={top10max} cls="f-blue" />
        ))}
      </div>

      {/* Male vs female top 5 */}
      <div className="vizhead">{tr(L("Top 5 by sex — rate per 100,000 (ASR)", "5 teratas ikut jantina — kadar per 100,000 (ASR)"))}</div>
      <div className="split">
        <div>
          <h4 className="m">♂ {tr(L("Men", "Lelaki"))}</h4>
          <div className="bars">
            {NCR_MALE5.map((d, i) => (
              <BarRow key={i} label={tr(d.name)} value={d.asr} unit="" max={maleMax} cls="f-blue" />
            ))}
          </div>
        </div>
        <div>
          <h4 className="f">♀ {tr(L("Women", "Wanita"))}</h4>
          <div className="bars">
            {NCR_FEMALE5.map((d, i) => (
              <BarRow key={i} label={tr(d.name)} value={d.asr} unit="" max={femMax} cls="f-pink" />
            ))}
          </div>
        </div>
      </div>

      {/* Smoking / late-stage signal */}
      <div className="vizhead">{tr(L("Caught too late — % diagnosed at stage 3 or 4", "Dikesan terlalu lewat — % didiagnosis pada peringkat 3 atau 4"))}</div>
      <p className="small muted" style={{ marginTop: -2 }}>
        {tr(L(
          "Lung cancer — strongly driven by smoking — is nearly always found late. This is what early awareness aims to change.",
          "Kanser paru-paru — banyak dikaitkan dengan merokok — hampir selalu dikesan lewat. Inilah yang kesedaran awal cuba ubah."
        ))}
      </p>
      <div className="bars">
        {NCR_LATESTAGE.map((d, i) => (
          <BarRow key={i} label={tr(d.name)} value={d.late} unit="%" max={100} cls="f-red" />
        ))}
      </div>

      {/* Lifetime risk by ethnicity */}
      <div className="vizhead">{tr(L("Lifetime risk by ethnic group (before age 75)", "Risiko seumur hidup ikut kumpulan etnik (sebelum umur 75)"))}</div>
      <div className="split">
        <div>
          <h4 className="m">♂ {tr(L("Men", "Lelaki"))}</h4>
          {NCR_ETH.male.map((e, i) => (
            <div className="ethrow" key={i}><span>{tr(e.eth)}</span><b>{tr(e.risk)}</b></div>
          ))}
        </div>
        <div>
          <h4 className="f">♀ {tr(L("Women", "Wanita"))}</h4>
          {NCR_ETH.female.map((e, i) => (
            <div className="ethrow" key={i}><span>{tr(e.eth)}</span><b>{tr(e.risk)}</b></div>
          ))}
        </div>
      </div>

      {/* Family history — honest flag, no fabricated figure */}
      <div className="flag" style={{ marginTop: 16 }}>
        👪 {tr(NCR_FAMHX_FLAG)}
      </div>

      <div className="srcline">
        {tr(L("Source: ", "Sumber: "))}{tr(SOURCE_NCR)}.{" "}
        {tr(L(
          "Family-history proportion is a general international estimate, not from this registry.",
          "Nisbah sejarah keluarga adalah anggaran antarabangsa umum, bukan daripada pendaftaran ini."
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */
export default function FamilyCancerRiskAssistant() {
  const [lang, setLang] = useState("en");
  const [step, setStep] = useState(0);
  const [showEmg, setShowEmg] = useState(false);
  const [entered, setEntered] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [panel, setPanel] = useState(null); // null | "faq" | "registry" | "chat" — landing-hub sub-views

  const [profile, setProfile] = useState({
    age: "", sex: "", ethnicity: "", state: "", everSex: "", smoke: "", smoke20y: false,
    passiveSmoke: "", occupationalHazards: [],
  });
  const [relatives, setRelatives] = useState([]);
  const [genetics, setGenetics] = useState([]);

  // post-results symptom check
  const [symptoms, setSymptoms] = useState({});
  const [symNoneChecked, setSymNoneChecked] = useState(false);

  // adder state
  const [draft, setDraft] = useState({ relationship: "", cancer: "", ageBand: "", side: "" });

  const tr = (v) => pick(v, lang);

  const draftIs2ndDeg = draft.relationship && RELATIONSHIPS.find((r) => r.id === draft.relationship)?.degree === 2;

  const addRelative = () => {
    if (!draft.relationship || !draft.cancer) return;
    const rel = RELATIONSHIPS.find((r) => r.id === draft.relationship);
    setRelatives((rs) => [
      ...rs,
      { ...draft, id: Date.now() + Math.random(), degree: rel.degree, side: rel.degree === 2 ? (draft.side || "unknown") : "" },
    ]);
    setDraft({ relationship: "", cancer: "", ageBand: "", side: "" });
  };
  const removeRelative = (id) => setRelatives((rs) => rs.filter((r) => r.id !== id));

  const toggleGene = (id) =>
    setGenetics((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));

  const results = useMemo(() => {
    const out = [];
    out.push(buildColorectal(relatives, genetics));
    if (profile.sex !== "male") out.push(buildBreast(relatives, genetics));
    out.push(buildLung(profile, relatives));
    if (profile.sex === "female") out.push(buildCervical(profile));
    out.push(buildNPC(profile, relatives));
    return out;
  }, [relatives, genetics, profile]);

  const cancerMeta = (id) => CANCER_CHOICES.find((c) => c.id === id) ||
    { emoji: "🩺", label: L(id, id) };

  const reset = () => {
    setProfile({ age: "", sex: "", ethnicity: "", state: "", everSex: "", smoke: "", smoke20y: false, passiveSmoke: "", occupationalHazards: [] });
    setRelatives([]); setGenetics([]); setSymptoms({}); setSymNoneChecked(false); setStep(0); setPanel(null);
  };

  const toggleHazard = (id) =>
    setProfile((p) => {
      const has = (p.occupationalHazards || []).includes(id);
      // "not_sure" is exclusive with everything else; picking a specific hazard clears "not_sure".
      if (id === "not_sure") return { ...p, occupationalHazards: has ? [] : ["not_sure"] };
      const cleared = (p.occupationalHazards || []).filter((h) => h !== "not_sure");
      return { ...p, occupationalHazards: has ? cleared.filter((h) => h !== id) : [...cleared, id] };
    });

  const canNext0 = true;
  const canNext1 = profile.age && profile.sex;

  return (
    <div className="fcra">
      <style>{CSS}</style>
      <div className="wrap">
        {/* Brand + language */}
        <div className="brandbar">
          <div className="brandmark">🧬</div>
          <div>
            <div className="t">{tr(L("Family Cancer Risk Check", "Semakan Risiko Kanser Keluarga"))}</div>
            <div className="s">{tr(L("by Dr Nurul Amiera Asli · IKN · Prototype", "oleh Dr Nurul Amiera Asli · IKN · Prototaip"))}</div>
          </div>
          <div className="langtoggle" role="group" aria-label="Language">
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            <button aria-pressed={lang === "bm"} onClick={() => setLang("bm")}>BM</button>
          </div>
        </div>

        {/* Always-visible emergency */}
        <button className="emg" onClick={() => setShowEmg(true)}>
          <span className="ico">🚑</span>
          <span>{tr(L("Having a serious symptom right now?", "Ada simptom serius sekarang?"))}</span>
          <span className="go">{tr(L("Tap here", "Tekan sini"))} →</span>
        </button>

        {/* Progress — clear numbered + labelled journey */}
        {step > 0 && (
          <Stepper step={step} lang={lang} onJump={(n) => setStep(n)} />
        )}

        {/* STEP 0 — Landing hub */}
        {step === 0 && panel === null && (
          <>
            {/* PRIMARY — the journey (visually dominant) */}
            <div className="card hero">
              <p className="eyebrow">{tr(L("Start here", "Mula di sini"))}</p>
              <h1>{tr(L("Understand your family cancer risk — and your next step.", "Fahami risiko kanser keluarga anda — dan langkah seterusnya."))}</h1>
              <p>
                {tr(L(
                  "Answer a few simple questions about your family. You'll get your risk level and a clear next step: whether to see a doctor, which test to ask for, how often, and what warning signs to watch.",
                  "Jawab beberapa soalan mudah tentang keluarga anda. Anda akan dapat tahap risiko dan langkah seterusnya yang jelas: perlu jumpa doktor atau tidak, ujian mana, berapa kerap, dan tanda amaran untuk diperhatikan."
                ))}
              </p>
              <button className="btn hero-cta block" onClick={() => setStep(1)}>
                {tr(L("Start the check", "Mula semakan"))} →
              </button>
            </div>

            {/* SECONDARY — three tiles */}
            <div className="hubtiles">
              <button className="hubtile" onClick={() => setPanel("faq")}>
                <span className="hi">👪</span>
                <span className="htx">
                  <span className="ht">{tr(L("Why use this?", "Kenapa guna ini?"))}</span>
                  <span className="hs">{tr(L("Why a strong family history matters", "Kenapa sejarah keluarga yang kuat penting"))}</span>
                </span>
              </button>
              <button className="hubtile" onClick={() => setPanel("registry")}>
                <span className="hi">📊</span>
                <span className="htx">
                  <span className="ht">{tr(L("Cancer in Malaysia", "Kanser di Malaysia"))}</span>
                  <span className="hs">{tr(L("National Cancer Registry snapshot", "Ringkasan Pendaftaran Kanser Kebangsaan"))}</span>
                </span>
              </button>
              <button className="hubtile" onClick={() => setPanel("chat")}>
                <span className="hi">💬</span>
                <span className="htx">
                  <span className="ht">{tr(L("Ask the guidelines", "Tanya garis panduan"))}</span>
                  <span className="hs">{tr(L("Chat about Malaysian cancer CPGs", "Bualan tentang CPG kanser Malaysia"))}</span>
                </span>
              </button>
            </div>

            {/* Trust line */}
            <div className="card" style={{ marginTop: 16 }}>
              <div className="flag" style={{ margin: 0 }}>
                {tr(L(
                  "🔒 Private & free — we ask only age, sex, ethnicity and state. No name, IC or phone number. Nothing is saved; it disappears when you close this page.",
                  "🔒 Peribadi & percuma — kami tanya umur, jantina, etnik dan negeri sahaja. Tiada nama, IC atau nombor telefon. Tiada apa disimpan; semuanya hilang bila anda tutup halaman ini."
                ))}
              </div>
              <div className="disclaimer">
                <span>ℹ️</span>
                <span>{tr(L(
                  "Anchored to Malaysian CPGs. It supports decisions — it does not replace a doctor and does not diagnose.",
                  "Berpaut pada CPG Malaysia. Ia menyokong keputusan — tidak menggantikan doktor dan tidak membuat diagnosis."
                ))}</span>
              </div>
            </div>
          </>
        )}

        {/* STEP 0 — FAQ panel */}
        {step === 0 && panel === "faq" && (
          <>
            <div className="panelhead">
              <button className="btn ghost" onClick={() => setPanel(null)}>← {tr(L("Back", "Kembali"))}</button>
            </div>
            <div className="card">
              <p className="eyebrow">{tr(L("FAQ", "Soalan lazim"))}</p>
              <h2>{tr(L("Why should I use this if cancer runs in my family?", "Kenapa saya perlu guna ini jika kanser ada dalam keluarga saya?"))}</h2>
              <p className="muted">
                {tr(L(
                  "A strong family history — several close relatives, or relatives diagnosed young — can mean you carry a higher inherited risk. That often changes when you should start screening and which test you need, sometimes years earlier than the general public. This tool turns that family history into a clear, guideline-based plan.",
                  "Sejarah keluarga yang kuat — beberapa saudara terdekat, atau saudara yang didiagnos pada usia muda — boleh bermakna anda membawa risiko warisan yang lebih tinggi. Ini sering mengubah bila anda patut mula saringan dan ujian mana yang diperlukan, kadangkala bertahun lebih awal daripada orang awam. Alat ini menukar sejarah keluarga itu kepada pelan yang jelas dan berpandukan garis panduan."
                ))}
              </p>
            </div>
            <WhyUse lang={lang} />
            <div className="card">
              <button className="btn primary block" onClick={() => { setPanel(null); setStep(1); }}>
                {tr(L("Start the check", "Mula semakan"))} →
              </button>
            </div>
          </>
        )}

        {/* STEP 0 — Registry panel */}
        {step === 0 && panel === "registry" && (
          <>
            <div className="panelhead">
              <button className="btn ghost" onClick={() => setPanel(null)}>← {tr(L("Back", "Kembali"))}</button>
            </div>
            <RegistrySnapshot lang={lang} />
          </>
        )}

        {/* STEP 0 — Guideline chat panel */}
        {step === 0 && panel === "chat" && (
          <>
            <div className="panelhead">
              <button className="btn ghost" onClick={() => setPanel(null)}>← {tr(L("Back", "Kembali"))}</button>
            </div>
            <CpgChat results={results} profile={profile} relatives={relatives} lang={lang} />
          </>
        )}

        {/* STEP 1 — About you */}
        {step === 1 && (
          <div className="card">
            <p className="eyebrow">{tr(L("Step 1 of 5", "Langkah 1 dari 5"))}</p>
            <h2>👤 {tr(L("About you", "Tentang anda"))}</h2>
            <p className="muted small">{tr(L("No name or IC — these details just help tailor the advice.", "Tiada nama atau IC — butiran ini hanya membantu menyesuaikan nasihat."))}</p>

            <label className="field">
              <span>{tr(L("Your age", "Umur anda"))}</span>
              <input type="number" min="1" max="120" value={profile.age}
                onChange={(e) => setProfile({ ...profile, age: e.target.value })}
                placeholder={tr(L("e.g. 45", "cth. 45"))} />
            </label>

            <label className="field">
              <span>{tr(L("Sex", "Jantina"))}</span>
              <div className="chips">
                {[["female", L("Female", "Perempuan")], ["male", L("Male", "Lelaki")]].map(([v, lab]) => (
                  <button key={v} className="chip" aria-pressed={profile.sex === v}
                    onClick={() => setProfile({ ...profile, sex: v })}>{tr(lab)}</button>
                ))}
              </div>
            </label>

            <label className="field">
              <span>{tr(L("Ethnicity", "Etnik"))}</span>
              <div className="chips">
                {ETHNICITIES.map((e) => (
                  <button key={e.id} className="chip" aria-pressed={profile.ethnicity === e.id}
                    onClick={() => setProfile({ ...profile, ethnicity: e.id })}>{tr(e.label)}</button>
                ))}
              </div>
            </label>

            <label className="field">
              <span>{tr(L("State", "Negeri"))}</span>
              <select value={profile.state} onChange={(e) => setProfile({ ...profile, state: e.target.value })}>
                <option value="">{tr(L("Select…", "Pilih…"))}</option>
                {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>

            <label className="field">
              <span>{tr(L("Do you smoke, or did you smoke in the past?", "Adakah anda merokok, atau pernah merokok?"))}</span>
              <div className="chips">
                {[["never", L("Never", "Tidak pernah")], ["past", L("In the past", "Dulu")], ["current", L("Currently", "Sekarang")]].map(([v, lab]) => (
                  <button key={v} className="chip" aria-pressed={profile.smoke === v}
                    onClick={() => setProfile({ ...profile, smoke: v, smoke20y: v === "never" ? false : profile.smoke20y })}>{tr(lab)}</button>
                ))}
              </div>
            </label>

            {profile.smoke && profile.smoke !== "never" && (
              <label className="field">
                <span>{tr(L("Have you smoked for 20 years or more in total?", "Adakah anda telah merokok selama 20 tahun atau lebih secara keseluruhan?"))}</span>
                <p className="muted small" style={{ margin: "2px 0 8px" }}>{tr(L("Count the years you smoked, not how many sticks a day. Malaysia's 2025 lung cancer guidelines use smoking duration, not pack-years, because long-duration smoking is common here.", "Kira tahun anda merokok, bukan berapa batang sehari. Garis panduan kanser paru-paru Malaysia 2025 menggunakan tempoh merokok, bukan pack-year, kerana merokok jangka panjang biasa di sini."))}</p>
                <div className="chips">
                  <button className="chip" aria-pressed={profile.smoke20y === true} onClick={() => setProfile({ ...profile, smoke20y: true })}>{tr(L("Yes", "Ya"))}</button>
                  <button className="chip" aria-pressed={profile.smoke20y === false} onClick={() => setProfile({ ...profile, smoke20y: false })}>{tr(L("No", "Tidak"))}</button>
                </div>
              </label>
            )}

            <label className="field">
              <span>{tr(L("Has anyone you live(d) with smoked regularly — at home, in a shared car, or you've noticed the smell on their clothing/hair? (second-hand smoke)", "Adakah sesiapa yang tinggal bersama anda merokok secara kerap — di rumah, dalam kereta yang dikongsi, atau anda perasan bau pada pakaian/rambut mereka? (asap rokok orang lain)"))}</span>
              <p className="muted small" style={{ margin: "2px 0 8px" }}>{tr(L("This counts even if you've never seen them smoke directly.", "Ini masih dikira walaupun anda tidak pernah nampak mereka merokok secara langsung."))}</p>
              <div className="chips">
                {[["no", L("No", "Tidak")], ["past", L("In the past (e.g. childhood home)", "Dulu (cth. rumah semasa kecil)")], ["current", L("Currently", "Sekarang")]].map(([v, lab]) => (
                  <button key={v} className="chip" aria-pressed={profile.passiveSmoke === v}
                    onClick={() => setProfile({ ...profile, passiveSmoke: v })}>{tr(lab)}</button>
                ))}
              </div>
            </label>

            <label className="field">
              <span>{tr(L("Have you ever worked somewhere with these exposures? (select all that apply)", "Pernahkah anda bekerja di tempat dengan pendedahan ini? (pilih semua yang berkenaan)"))}</span>
              <div className="chips">
                {OCCUPATIONAL_HAZARDS.map((h) => (
                  <button key={h.id} className="chip" aria-pressed={(profile.occupationalHazards || []).includes(h.id)}
                    onClick={() => toggleHazard(h.id)}>{tr(h.label)}</button>
                ))}
              </div>
            </label>

            {profile.sex === "female" && (
              <label className="field">
                <span>{tr(L("Have you ever been sexually active? (for cervical screening only)", "Pernahkah anda aktif secara seksual? (untuk saringan serviks sahaja)"))}</span>
                <div className="chips">
                  {[["yes", L("Yes", "Ya")], ["no", L("No", "Tidak")], ["skip", L("Prefer not to say", "Tidak mahu nyatakan")]].map(([v, lab]) => (
                    <button key={v} className="chip" aria-pressed={profile.everSex === v}
                      onClick={() => setProfile({ ...profile, everSex: v })}>{tr(lab)}</button>
                  ))}
                </div>
              </label>
            )}

            <div className="row">
              <button className="btn ghost" onClick={() => setStep(0)}>← {tr(L("Back", "Kembali"))}</button>
              <button className="btn primary" disabled={!canNext1} style={!canNext1 ? { opacity: .5 } : {}}
                onClick={() => canNext1 && setStep(2)}>{tr(L("Next", "Seterusnya"))} →</button>
            </div>
          </div>
        )}

        {/* STEP 2 — Family history */}
        {step === 2 && (
          <div className="card">
            <p className="eyebrow">{tr(L("Step 2 of 5", "Langkah 2 dari 5"))}</p>
            <h2>🌳 {tr(L("Your family history", "Sejarah keluarga anda"))}</h2>
            <p className="muted small">
              {tr(L(
                "Add any relative who has had cancer. Close relatives (parents, siblings, children) matter more than distant ones — that is why we ask who it was.",
                "Tambah mana-mana saudara yang pernah mengidap kanser. Saudara terdekat (ibu bapa, adik-beradik, anak) lebih penting daripada saudara jauh — sebab itu kami tanya siapa."
              ))}
            </p>

            {relatives.length > 0 && (
              <div style={{ margin: "8px 0 14px" }}>
                {relatives.map((r) => {
                  const rel = RELATIONSHIPS.find((x) => x.id === r.relationship);
                  const c = cancerMeta(r.cancer);
                  const ab = AGE_BANDS.find((a) => a.id === r.ageBand);
                  return (
                    <div className="relcard" key={r.id}>
                      <span className="em">{c.emoji}</span>
                      <div className="info">
                        <b>{tr(rel.label)} <span className="deg">{rel.degree === 1 ? tr(L("Close", "Terdekat")) : tr(L("Distant", "Jauh"))}</span></b>
                        <span>{tr(c.label)}{ab && ab.id !== "unknown" ? " · " + tr(L("diagnosed", "didiagnos")) + " " + tr(ab.label) : ""}</span>
                      </div>
                      <button className="rm" onClick={() => removeRelative(r.id)}>{tr(L("Remove", "Buang"))}</button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="adder">
              <label className="field">
                <span>{tr(L("Who was it?", "Siapa?"))}</span>
                <select value={draft.relationship} onChange={(e) => setDraft({ ...draft, relationship: e.target.value })}>
                  <option value="">{tr(L("Choose relative…", "Pilih saudara…"))}</option>
                  <optgroup label={tr(L("Close relatives", "Saudara terdekat"))}>
                    {RELATIONSHIPS.filter((r) => r.degree === 1).map((r) => <option key={r.id} value={r.id}>{tr(r.label)}</option>)}
                  </optgroup>
                  <optgroup label={tr(L("More distant relatives", "Saudara lebih jauh"))}>
                    {RELATIONSHIPS.filter((r) => r.degree === 2).map((r) => <option key={r.id} value={r.id}>{tr(r.label)}</option>)}
                  </optgroup>
                </select>
              </label>

              <label className="field">
                <span>{tr(L("Which cancer?", "Kanser apa?"))}</span>
                <div className="chips">
                  {CANCER_CHOICES.map((c) => (
                    <button key={c.id} className="chip" aria-pressed={draft.cancer === c.id}
                      onClick={() => setDraft({ ...draft, cancer: c.id })}>{c.emoji} {tr(c.label)}</button>
                  ))}
                </div>
              </label>

              <label className="field" style={{ marginBottom: 12 }}>
                <span>{tr(L("How old were they when diagnosed?", "Berapa umur mereka semasa didiagnos?"))}</span>
                <div className="chips">
                  {AGE_BANDS.map((a) => (
                    <button key={a.id} className="chip" aria-pressed={draft.ageBand === a.id}
                      onClick={() => setDraft({ ...draft, ageBand: a.id })}>{tr(a.label)}</button>
                  ))}
                </div>
              </label>

              {draftIs2ndDeg && (
                <label className="field" style={{ marginBottom: 12 }}>
                  <span>{tr(L("Which side of the family?", "Sebelah keluarga mana?"))}</span>
                  <div className="chips">
                    {[
                      { id: "maternal", label: L("Mother's side", "Sebelah ibu") },
                      { id: "paternal", label: L("Father's side", "Sebelah bapa") },
                      { id: "unknown", label: L("Not sure", "Tidak pasti") },
                    ].map((s) => (
                      <button key={s.id} className="chip" aria-pressed={draft.side === s.id}
                        onClick={() => setDraft({ ...draft, side: s.id })}>{tr(s.label)}</button>
                    ))}
                  </div>
                </label>
              )}

              <button className="btn ghost block" disabled={!draft.relationship || !draft.cancer}
                style={!draft.relationship || !draft.cancer ? { opacity: .5 } : {}}
                onClick={addRelative}>+ {tr(L("Add this relative", "Tambah saudara ini"))}</button>
            </div>

            <p className="muted small" style={{ marginTop: 14 }}>
              {tr(L("No cancer in the family? That's fine — just continue.", "Tiada kanser dalam keluarga? Tidak mengapa — teruskan sahaja."))}
            </p>

            <div className="row">
              <button className="btn ghost" onClick={() => setStep(1)}>← {tr(L("Back", "Kembali"))}</button>
              <button className="btn primary" onClick={() => setStep(3)}>{tr(L("Next", "Seterusnya"))} →</button>
            </div>
          </div>
        )}

        {/* STEP 3 — Genetics */}
        {step === 3 && (
          <div className="card">
            <p className="eyebrow">{tr(L("Step 3 of 5", "Langkah 3 dari 5"))}</p>
            <h2>🧬 {tr(L("Known inherited conditions", "Keadaan keturunan yang diketahui"))}</h2>
            <p className="muted small">
              {tr(L(
                "Only tick these if a doctor has already told your family about them. If you're not sure, leave them all unticked.",
                "Tanda hanya jika doktor pernah memberitahu keluarga anda tentangnya. Jika tidak pasti, biarkan kosong."
              ))}
            </p>
            <div className="chips" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
              {GENETIC_FLAGS.map((g) => (
                <button key={g.id} className="chip" aria-pressed={genetics.includes(g.id)}
                  style={{ justifyContent: "flex-start" }} onClick={() => toggleGene(g.id)}>
                  <span>{genetics.includes(g.id) ? "☑" : "☐"}</span> {tr(g.label)}
                </button>
              ))}
            </div>
            <div className="row" style={{ marginTop: 18 }}>
              <button className="btn ghost" onClick={() => setStep(2)}>← {tr(L("Back", "Kembali"))}</button>
              <button className="btn primary" onClick={() => setStep(4)}>{tr(L("See my results", "Lihat keputusan"))} →</button>
            </div>
          </div>
        )}

        {/* STEP 4 — Results */}
        {step === 4 && (
          <>
            <div className="card">
              <p className="eyebrow">{tr(L("Your results", "Keputusan anda"))}</p>
              <h2>✅ {tr(L("Here's your personalised plan", "Ini pelan peribadi anda"))}</h2>
              <p className="muted small">
                {tr(L(
                  "For each cancer below: your risk level, whether to see a doctor, which test to ask for, how often, and the signs to watch. Bring this to your doctor.",
                  "Bagi setiap kanser di bawah: tahap risiko, perlu jumpa doktor, ujian mana, berapa kerap, dan tanda untuk diperhatikan. Bawa ini kepada doktor anda."
                ))}
              </p>
              <button className="btn primary block" style={{ marginTop: 6 }} onClick={() => setShowSummary(true)}>
                🖨️ {tr(L("Generate a summary for my doctor (GP)", "Jana ringkasan untuk doktor (GP) saya"))}
              </button>
              <div className="disclaimer">
                <span>ℹ️</span>
                <span>{tr(L(
                  "The summary is a printable sheet you can take to any GP for action and opinion. It is not medical advice and not a diagnosis.",
                  "Ringkasan ialah helaian boleh cetak untuk dibawa ke mana-mana GP untuk tindakan dan pendapat. Ia bukan nasihat perubatan dan bukan diagnosis."
                ))}</span>
              </div>
            </div>

            {/* Family pedigree */}
            {relatives.length > 0 && (
              <div className="card">
                <h3 style={{ marginBottom: 10 }}>🏠 {tr(L("Your family pedigree", "Silsilah keluarga anda"))}</h3>
                <p className="muted small" style={{ marginBottom: 12 }}>
                  {tr(L(
                    "Standard clinical pedigree based on the relatives you entered. Filled shapes = diagnosed with cancer. Bring this to your doctor.",
                    "Silsilah klinikal berdasarkan saudara yang dimasukkan. Bentuk berisi = didiagnos kanser. Bawa ini kepada doktor."
                  ))}
                </p>
                <Pedigree relatives={relatives} profile={profile} lang={lang} />
              </div>
            )}

            {/* Post-results targeted symptom check */}
            <SymptomCheck
              results={results}
              symptoms={symptoms}
              setSymptoms={setSymptoms}
              noneChecked={symNoneChecked}
              setNoneChecked={setSymNoneChecked}
              cancerMeta={cancerMeta}
              lang={lang}
              onEmergency={() => setShowEmg(true)}
            />

            {results.map((res) => {
              const meta = cancerMeta(res.id);
              const r = RISK[res.level];
              const symHits = (SYMPTOMS[res.id] || []).filter((it) => symptoms[it.id]);
              return (
                <div className={"result tone-" + r.tone} key={res.id}>
                  <div className="head">
                    <span className="em">{meta.emoji}</span>
                    <span className="nm">{tr(meta.label)}</span>
                    <span className="badge">{tr(r.label)}</span>
                  </div>
                  <div className="body">
                    {symHits.length > 0 && (
                      <div className="urgent-strip">
                        <b>⚠ {tr(L("You reported a warning sign for this — please see your nearest doctor and mention it.", "Anda melaporkan tanda amaran untuk ini — sila jumpa doktor berdekatan dan nyatakannya."))}</b>
                        <span className="us-list">{symHits.map((it) => tr(it.label)).join("; ")}</span>
                      </div>
                    )}
                    <Meter level={res.level} lang={lang} />
                    {res.level !== "info" && <p className="blurb">{tr(r.blurb)}</p>}
                    {res.flag && <div className="flag">{tr(res.flag)}</div>}
                    {res.steps.map((s, i) => {
                      const isSeek = i === res.steps.length - 1;
                      return (
                        <div className={"step" + (isSeek ? " seek" : "")} key={i}>
                          <span className="si">{s.icon}</span>
                          <div className="sc">
                            <b>{tr(s.title)}</b>
                            <span>{tr(s.body)}</span>
                          </div>
                        </div>
                      );
                    })}
                    <div className="src">
                      📚 {tr(L("Source", "Sumber"))}: {res.source || tr(L("No anchoring CPG retrieved for this prototype — review against the current guideline before any action.", "Tiada CPG rujukan untuk prototaip ini — semak dengan garis panduan semasa sebelum sebarang tindakan."))}
                      <span className="icd">🏷️ {res.icd}</span>
                    </div>
                    <p className="draft">{tr(L(
                      "All outputs are draft recommendations pending clinician sign-off.",
                      "Semua keputusan adalah cadangan draf menunggu pengesahan klinisian."
                    ))}</p>
                  </div>
                </div>
              );
            })}

            <div className="card">
              <h3 style={{ marginBottom: 8 }}>🩺 {tr(L("Also watch for these in anyone", "Perhatikan juga tanda umum ini"))}</h3>
              <p className="small muted">{tr(CONSTITUTIONAL)}</p>
            </div>

            {/* AI CPG Q&A */}
            <CpgChat results={results} profile={profile} relatives={relatives} lang={lang} />

            <div className="card">
              <div className="row">
                <button className="btn ghost" onClick={reset}>{tr(L("Start over", "Mula semula"))}</button>
                <button className="btn primary" onClick={() => setStep(5)}>{tr(L("Give feedback", "Beri maklum balas"))} →</button>
              </div>
              <div className="disclaimer">
                <span>ℹ️</span>
                <span>{tr(L(
                  "This tool supports clinical decision-making. It does not replace professional medical consultation. It flags risk; it does not confirm a diagnosis.",
                  "Alat ini menyokong pembuatan keputusan klinikal. Ia tidak menggantikan konsultasi perubatan profesional. Ia menandakan risiko; ia tidak mengesahkan diagnosis."
                ))}</span>
              </div>
            </div>
          </>
        )}

        {/* STEP 5 — Feedback (feasibility study) */}
        {step === 5 && (
          <>
            <FeedbackForm
              results={results}
              lang={lang}
              onSkip={reset}
              onDone={() => {}}
            />
            <div className="card">
              <div className="row">
                <button className="btn ghost" onClick={() => setStep(4)}>← {tr(L("Back to my plan", "Kembali ke pelan saya"))}</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Entry disclaimer gate */}
      {!entered && (
        <div className="gate-bg">
          <div className="gate">
            <span className="gate-tag">⚠ {tr(L("DEMO · RESEARCH & EDUCATIONAL PROTOTYPE", "DEMO · PROTOTAIP PENYELIDIKAN & PENDIDIKAN"))}</span>
            <div className="gate-title">
              {tr(L("Family Cancer Risk Check", "Semakan Risiko Kanser Keluarga"))} <span className="gate-v">{APP_VERSION}</span>
            </div>
            <p className="gate-by">{tr(APP_OWNER)}</p>
            <p className="gate-p">
              {tr(L(
                "This tool is under active development. Every risk estimate and screening suggestion it produces is provisional and must be reviewed by a qualified doctor before any action is taken.",
                "Alat ini sedang dalam pembangunan aktif. Setiap anggaran risiko dan cadangan saringan yang dihasilkan adalah sementara dan mesti disemak oleh doktor bertauliah sebelum sebarang tindakan diambil."
              ))}
            </p>
            <p className="gate-p">
              {tr(L(
                "Do NOT enter patient-identifiable data (full name, IC number, phone). Nothing you enter is stored or transmitted — it stays in your browser and disappears when you close the page.",
                "JANGAN masukkan data pengenalan pesakit (nama penuh, nombor IC, telefon). Tiada apa yang dimasukkan disimpan atau dihantar — ia kekal dalam pelayar anda dan hilang bila halaman ditutup."
              ))}
            </p>
            <p className="gate-p">
              <b>{tr(L("This is not medical advice.", "Ini bukan nasihat perubatan."))}</b>{" "}
              {tr(L(
                "It does not diagnose. Clinical responsibility remains entirely with the treating doctor.",
                "Ia tidak membuat diagnosis. Tanggungjawab klinikal kekal sepenuhnya pada doktor yang merawat."
              ))}
            </p>
            <button className="btn primary block" onClick={() => setEntered(true)}>
              {tr(L("I understand — enter the tool", "Saya faham — masuk ke alat"))}
            </button>
          </div>
        </div>
      )}

      {/* GP summary overlay */}
      {showSummary && (
        <GpSummary
          results={results}
          profile={profile}
          relatives={relatives}
          symptoms={symptoms}
          lang={lang}
          cancerMeta={cancerMeta}
          onClose={() => setShowSummary(false)}
        />
      )}

      {/* Emergency modal */}
      {showEmg && (
        <div className="modal-bg" onClick={() => setShowEmg(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>🚨 {tr(L("Get help now", "Dapatkan bantuan sekarang"))}</h2>
            <p>{tr(L("Do NOT wait for screening if you have any of these:", "JANGAN tunggu saringan jika anda ada mana-mana ini:"))}</p>
            <ul className="plain">
              <li>{tr(L("Heavy or non-stop bleeding", "Pendarahan banyak atau tidak berhenti"))}</li>
              <li>{tr(L("Severe pain", "Sakit yang teruk"))}</li>
              <li>{tr(L("Trouble breathing, choking, or swallowing", "Sukar bernafas, tercekik, atau menelan"))}</li>
            </ul>
            <p style={{ fontWeight: 700 }}>
              {tr(L("Go to the nearest emergency department, or call 999.", "Pergi ke jabatan kecemasan terdekat, atau hubungi 999."))}
            </p>
            <button className="btn primary block" onClick={() => setShowEmg(false)}>{tr(L("Close", "Tutup"))}</button>
          </div>
        </div>
      )}
    </div>
  );
}
