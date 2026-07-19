// netlify/functions/generate-narration.js
// Creates HeyGen avatar narration videos from a script, and checks render status.
// Server-side only — the HeyGen key never reaches the browser.
//
// Env var (set in Netlify, NOT in the repo):
//   HEYGEN_API_KEY   your HeyGen API key
//   ALLOW_ORIGIN     your site origin (optional; used for the browser admin tool)
//
// Usage from the admin page:
//   POST { script, avatarId, voiceId }      -> { video_id }
//   GET  ?video_id=abc123                    -> { status, video_url, error }
//
// NOTE: HeyGen rendering is asynchronous (seconds to minutes). The admin tool
// submits a script, then polls this endpoint until status is completed/failed.
// Field names below follow the HeyGen v3 API; confirm against docs.heygen.com
// if HeyGen changes response shapes.

const CREATE_URL = 'https://api.heygen.com/v3/videos';
const STATUS_URL = (id) => `https://api.heygen.com/v3/videos/${encodeURIComponent(id)}`;

function pick(obj, ...paths) {
  for (const p of paths) {
    const v = p.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
    if (v != null) return v;
  }
  return null;
}

exports.handler = async (event) => {
  const origin = process.env.ALLOW_ORIGIN || '*';
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  if (!process.env.HEYGEN_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'HEYGEN_API_KEY not set in Netlify env' }) };
  }
  const key = process.env.HEYGEN_API_KEY;

  try {
    // ---- status check ----
    if (event.httpMethod === 'GET') {
      const id = (event.queryStringParameters || {}).video_id;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'video_id required' }) };
      const r = await fetch(STATUS_URL(id), { headers: { 'X-Api-Key': key } });
      const d = await r.json();
      const status = pick(d, 'status', 'data.status');
      const video_url = pick(d, 'video_url', 'data.video_url');
      const error = pick(d, 'failure_message', 'error', 'data.error');
      return { statusCode: 200, headers, body: JSON.stringify({ status, video_url, error, raw: d }) };
    }

    // ---- create ----
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const script = String(body.script || '').slice(0, 1500);
      const avatarId = String(body.avatarId || '').trim();
      const voiceId = String(body.voiceId || '').trim();
      if (!script || !avatarId || !voiceId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'script, avatarId and voiceId are required' }) };
      }
      const r = await fetch(CREATE_URL, {
        method: 'POST',
        headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'avatar',
          avatar_id: avatarId,
          engine: { type: 'avatar_v' },
          voice_id: voiceId,
          script,
        }),
      });
      const d = await r.json();
      if (!r.ok) return { statusCode: r.status, headers, body: JSON.stringify({ error: 'HeyGen error', raw: d }) };
      const video_id = pick(d, 'video_id', 'data.video_id', 'id', 'data.id');
      return { statusCode: 200, headers, body: JSON.stringify({ video_id, raw: d }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
