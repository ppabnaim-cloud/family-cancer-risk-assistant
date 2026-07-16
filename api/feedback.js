/**
 * /api/feedback — receives the anonymous feasibility-study feedback form and
 * forwards it as an email via EmailJS.
 *
 * Runs server-side so the EmailJS private key is never exposed in the browser.
 *
 * Required environment variables (Vercel → Settings → Environment Variables):
 *   EMAILJS_SERVICE_ID     e.g. service_xxxxxxx
 *   EMAILJS_TEMPLATE_ID    e.g. template_xxxxxxx
 *   EMAILJS_PUBLIC_KEY     your EmailJS Public Key  (aka User ID)
 *   EMAILJS_PRIVATE_KEY    your EmailJS Private Key (required for API calls
 *                          made outside a browser — EmailJS rejects them
 *                          otherwise)
 *   FEEDBACK_TO_EMAIL      optional. Defaults to amieraasli@gmail.com.
 *                          Only takes effect if your EmailJS template's
 *                          "To Email" field is set to {{to_email}}.
 *
 * NOTE ON PDPA: the form collects no name, IC, contact detail or health data.
 * Do not add any here.
 */

const RATING_LABELS = {
  easy: "Easy to use",
  clear: "Language was clear",
  understood: "Understood result & next step",
  useful: "Was useful to me",
  intent: "Intends to discuss with a doctor",
};

const ROLE_LABELS = {
  public: "Member of the public",
  patient: "Patient or caregiver",
  hcw: "Healthcare worker",
  na: "Prefer not to say",
  unset: "Not stated",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    EMAILJS_SERVICE_ID,
    EMAILJS_TEMPLATE_ID,
    EMAILJS_PUBLIC_KEY,
    EMAILJS_PRIVATE_KEY,
    FEEDBACK_TO_EMAIL,
  } = process.env;

  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY || !EMAILJS_PRIVATE_KEY) {
    console.error("EmailJS environment variables are missing");
    return res.status(500).json({ error: "Server is not configured for feedback." });
  }

  try {
    const { language, role, ratings, comment, riskProfile, version, submittedAt } = req.body || {};

    // Render the Likert ratings into a readable block rather than raw JSON,
    // so the email is usable without decoding anything.
    const ratingLines = Object.entries(ratings || {})
      .map(([id, val]) => `  ${RATING_LABELS[id] || id}: ${val} / 5`)
      .join("\n");

    const summary = [
      `Submitted:     ${submittedAt || new Date().toISOString()}`,
      `App version:   ${version || "unknown"}`,
      `Language used: ${language === "bm" ? "Bahasa Malaysia" : "English"}`,
      `Respondent:    ${ROLE_LABELS[role] || role || "Not stated"}`,
      "",
      "Ratings (1 = strongly disagree, 5 = strongly agree):",
      ratingLines || "  (none given)",
      "",
      "Comment:",
      comment ? `  ${comment}` : "  (none)",
      "",
      "Risk levels produced (no personal data):",
      `  ${riskProfile || "n/a"}`,
    ].join("\n");

    const payload = {
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PRIVATE_KEY,
      template_params: {
        to_email: FEEDBACK_TO_EMAIL || "amieraasli@gmail.com",
        subject: "Family Cancer Risk Assistant — new feedback",
        summary,
        // Individual fields too, in case the template prefers them separately.
        language: language === "bm" ? "Bahasa Malaysia" : "English",
        role: ROLE_LABELS[role] || role || "Not stated",
        comment: comment || "(none)",
        risk_profile: riskProfile || "n/a",
        submitted_at: submittedAt || new Date().toISOString(),
        app_version: version || "unknown",
      },
    };

    const upstream = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error("EmailJS error:", upstream.status, detail);
      return res.status(502).json({ error: "Could not send feedback." });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("/api/feedback failed:", err);
    return res.status(500).json({ error: "Unexpected error." });
  }
}
