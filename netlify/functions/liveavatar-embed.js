// netlify/functions/liveavatar-embed.js
// Mints a LiveAvatar embed URL (server-side) so the LiveAvatar API key never
// reaches the browser. The returned URL is a ready-to-use iframe src.
//
// Env (Netlify): LIVEAVATAR_API_KEY  (get it at app.liveavatar.com/developers —
//   this is SEPARATE from your HeyGen key)
//
// POST { avatarId, contextId, sandbox } -> { url }
//
// NOTE: The embed uses LiveAvatar FULL mode — HeyGen's own LLM answers, steered
// by the "context" you configure in the LiveAvatar dashboard, with HeyGen's
// moderation. It does NOT run this app's coded child-safety guardrails. Keep
// sandbox=true (free, no credits) for testing; live sessions cost credits.

const EMBED_URL = 'https://api.liveavatar.com/v2/embeddings';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': process.env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!process.env.LIVEAVATAR_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'LIVEAVATAR_API_KEY not set (get it at app.liveavatar.com/developers)' }) };
  }

  try {
    const b = JSON.parse(event.body || '{}');
    const payload = {
      avatar_id: String(b.avatarId || '').trim(),
      context_id: String(b.contextId || '').trim(),
      is_sandbox: b.sandbox !== false, // default to free sandbox mode
    };
    if (!payload.avatar_id || !payload.context_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'avatarId and contextId are required' }) };
    }
    const r = await fetch(EMBED_URL, {
      method: 'POST',
      headers: { 'X-API-KEY': process.env.LIVEAVATAR_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    const url = d && d.data && d.data.url;
    if (!url) return { statusCode: r.status || 502, headers, body: JSON.stringify({ error: d.message || 'LiveAvatar did not return a URL', raw: d }) };
    return { statusCode: 200, headers, body: JSON.stringify({ url, sandbox: payload.is_sandbox }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
