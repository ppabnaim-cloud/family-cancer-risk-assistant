/**
 * /api/chat — server-side proxy to the Anthropic Messages API.
 *
 * Why a proxy: the API key must NEVER reach the browser. The client posts the
 * conversation here; this function attaches the key from the Vercel environment
 * and forwards the request.
 *
 * Required environment variable (Vercel → Settings → Environment Variables):
 *   ANTHROPIC_API_KEY
 */

const ALLOWED_MODELS = new Set(["claude-sonnet-4-6"]);
const MAX_TOKENS_CAP = 1500;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set");
    return res.status(500).json({ error: "Server is not configured for the chat feature." });
  }

  try {
    const { model, max_tokens, system, messages, tools } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages is required" });
    }

    // Pin the model server-side. The client may request a model, but only from
    // an allow-list — this stops an open proxy to arbitrary/expensive models.
    const safeModel = ALLOWED_MODELS.has(model) ? model : "claude-sonnet-4-6";
    const safeMaxTokens = Math.min(Number(max_tokens) || 1000, MAX_TOKENS_CAP);

    const body = {
      model: safeModel,
      max_tokens: safeMaxTokens,
      messages,
    };
    if (system) body.system = system;
    if (Array.isArray(tools) && tools.length) body.tools = tools;

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      // Log the detail server-side; return something plain to the user.
      console.error("Anthropic API error:", upstream.status, JSON.stringify(data));
      return res.status(upstream.status).json({
        error: "The guideline assistant is unavailable right now.",
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("/api/chat failed:", err);
    return res.status(500).json({ error: "Unexpected error." });
  }
}
