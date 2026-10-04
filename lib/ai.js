// Optional external AI service: Google Gemini (free tier) for AI prioritisation.
// Setup: set GEMINI_API_KEY (and optionally GEMINI_MODEL) in a local .env file
// or environment variable. Never commit the key (.env is git-ignored).
// Without a key, or if the API call fails, callers MUST fall back to local rules.
const { guessPriority } = require("./plan");

const API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

async function aiPrioritise(activities) {
  const fallback = () => ({
    provider: "fallback-local-rules",
    ranking: activities.map((a) => {
      const g = guessPriority(a.text);
      return { id: a.id, priority: g.priority, reason: g.reason };
    }),
  });
  if (!API_KEY) return fallback();

  const prompt =
    "You are a daily planning assistant. Rank these activities by priority. " +
    'Reply with ONLY a JSON array like [{"id":1,"priority":"high|medium|can-wait","reason":"short reason"}]. ' +
    "Priorities allowed: high, medium, can-wait. Activities: " +
    JSON.stringify(activities.map((a) => ({ id: a.id, text: a.text })));

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) return { ...fallback(), provider: "fallback-api-error-" + res.status };
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const ranking = JSON.parse(text).filter((r) =>
      ["high", "medium", "can-wait"].includes(r.priority)
    );
    if (!ranking.length) return fallback();
    return { provider: "gemini", ranking };
  } catch {
    return fallback();
  }
}

module.exports = { aiPrioritise };
