// netlify/functions/generate-narration.js
// Creates HeyGen narration videos (v2 endpoint) and checks status.
// Auto-detects the avatar ID type (standard avatar vs photo avatar) and
// retries the other type if HeyGen rejects the first — so you don't have to
// know which kind you picked.
//
// Env: HEYGEN_API_KEY (Netlify)
// POST { script, avatarId, voiceId } -> { video_id }
// GET  ?video_id=abc                 -> { status, video_url, error }

const CREATE_URL = 'https://api.heygen.com/v2/video/generate';
const STATUS_URL = (id) => `https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(id)}`;

const pick = (o, ...paths) => {
  for (const p of paths) { const v = p.split('.').reduce((x,k)=> x==null?x:x[k], o); if (v!=null) return v; }
  return null;
};
// 32-hex ids are HeyGen photo/talking-photo avatars; name-style ids are standard avatars.
const looksLikePhoto = (id) => /^[0-9a-f]{32}$/i.test(id);

function characterFor(kind, avatarId) {
  return kind === 'talking_photo'
    ? { type: 'talking_photo', talking_photo_id: avatarId }
    : { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' };
}

async function createVideo(key, character, script, voiceId) {
  const r = await fetch(CREATE_URL, {
    method: 'POST',
    headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_inputs: [{ character, voice: { type: 'text', input_text: script, voice_id: voiceId } }],
      dimension: { width: 1280, height: 720 },
    }),
  });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, video_id: pick(d, 'data.video_id', 'video_id'), raw: d };
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': process.env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (!process.env.HEYGEN_API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'HEYGEN_API_KEY not set' }) };
  const key = process.env.HEYGEN_API_KEY;

  try {
    if (event.httpMethod === 'GET') {
      const id = (event.queryStringParameters || {}).video_id;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'video_id required' }) };
      const d = await (await fetch(STATUS_URL(id), { headers: { 'X-Api-Key': key } })).json();
      return { statusCode: 200, headers, body: JSON.stringify({
        status: pick(d, 'data.status', 'status'),
        video_url: pick(d, 'data.video_url', 'video_url'),
        error: pick(d, 'data.error', 'error', 'message'),
      }) };
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      const script = String(b.script || '').slice(0, 1500);
      const avatarId = String(b.avatarId || '').trim();
      const voiceId = String(b.voiceId || '').trim();
      if (!script || !avatarId || !voiceId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'script, avatarId and voiceId are required' }) };

      // Try the most likely type first, then the other if HeyGen rejects it.
      const order = looksLikePhoto(avatarId) ? ['talking_photo', 'avatar'] : ['avatar', 'talking_photo'];
      let last = null;
      for (const kind of order) {
        const res = await createVideo(key, characterFor(kind, avatarId), script, voiceId);
        if (res.video_id) return { statusCode: 200, headers, body: JSON.stringify({ video_id: res.video_id, used: kind }) };
        last = res;
      }
      return { statusCode: 200, headers, body: JSON.stringify({ error: 'HeyGen rejected this avatar ID as both an avatar and a photo avatar', raw: last && last.raw }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
