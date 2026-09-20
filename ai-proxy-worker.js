/**
 * ClinicalTrials India Finder — AI proxy
 * ──────────────────────────────────────────────────────────
 * The site is a static page on GitHub Pages, so it has nowhere
 * to hide an API key. This Worker is that hiding place: the
 * browser calls the Worker, the Worker calls Anthropic, and the
 * key never leaves Cloudflare.
 *
 * Deploy (about ten minutes, free tier is enough):
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. wrangler deploy ai-proxy-worker.js --name ct-india-ai
 *   4. wrangler secret put ANTHROPIC_API_KEY      (paste the key)
 *   5. Put the Worker URL into CONFIG.aiEndpoint in index.html
 *
 * Change ALLOWED_ORIGIN before deploying, or anyone can spend
 * your Anthropic credit from their own page.
 */

const ALLOWED_ORIGIN = "https://manudh7676-web.github.io";
const MODEL = "claude-sonnet-4-6";

const LANG_NAME = { en: "English", hi: "Hindi", kn: "Kannada" };

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);

    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers });
    if (origin !== ALLOWED_ORIGIN) return new Response("Forbidden", { status: 403, headers });

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Bad request" }, 400, headers);
    }

    const lang = LANG_NAME[body.lang] || "English";
    const title = String(body.title || "").slice(0, 400);
    const summary = String(body.summary || "").slice(0, 3000);
    const criteria = String(body.criteria || "").slice(0, 3000);
    if (!title) return json({ error: "Nothing to explain" }, 400, headers);

    const prompt = [
      `You are explaining a clinical trial to a patient or their family member in India.`,
      `They may have no medical background. Write in ${lang}, at roughly a 10th-standard reading level.`,
      ``,
      `Write four short paragraphs, no headings, no bullet points, no markdown:`,
      `1. What this study is trying to find out, in one or two plain sentences.`,
      `2. What taking part would actually involve for the patient.`,
      `3. Who this study is looking for, and who it is not for.`,
      `4. Two or three specific questions to ask the trial doctor before agreeing.`,
      ``,
      `Rules you must follow:`,
      `- Use only the information given below. If something is not stated, say it is not stated.`,
      `- Do not say whether this person is eligible. Only the trial doctor decides that.`,
      `- Do not recommend joining or not joining.`,
      `- Do not add a disclaimer at the end; the page already shows one.`,
      ``,
      `TRIAL TITLE: ${title}`,
      ``,
      `SUMMARY FROM THE REGISTRY: ${summary || "(none given)"}`,
      ``,
      `ELIGIBILITY POINTS: ${criteria || "(none given)"}`
    ].join("\n");

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 900,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!res.ok) {
        return json({ error: "Upstream error", status: res.status }, 502, headers);
      }

      const data = await res.json();
      const text = (data.content || [])
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("\n")
        .trim();

      return json({ text }, 200, headers);
    } catch (err) {
      return json({ error: "Could not reach the model" }, 502, headers);
    }
  }
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, "Content-Type": "application/json" }
  });
}
