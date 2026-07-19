// netlify/functions/heygen-list.js
// Returns HeyGen avatars and voices so the admin picker can show them.
// Server-side only — the HeyGen key never reaches the browser.
//
// Env var: HEYGEN_API_KEY  (set in Netlify)
// Usage:   GET /.netlify/functions/heygen-list  ->  { avatars:[...], voices:[...] }

const AVATARS_URL = 'https://api.heygen.com/v2/avatars';
const VOICES_URL  = 'https://api.heygen.com/v2/voices';

const arr = (d, ...keys) => {
  for (const k of keys) {
    const v = k.split('.').reduce((o, p) => (o == null ? o : o[p]), d);
    if (Array.isArray(v)) return v;
  }
  return [];
};

exports.handler = async (event) => {
  const origin = process.env.ALLOW_ORIGIN || '*';
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (!process.env.HEYGEN_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'HEYGEN_API_KEY not set in Netlify env' }) };
  }
  const key = { 'X-Api-Key': process.env.HEYGEN_API_KEY };

  try {
    const [aRes, vRes] = await Promise.all([
      fetch(AVATARS_URL, { headers: key }).then(r => r.json()),
      fetch(VOICES_URL,  { headers: key }).then(r => r.json()),
    ]);

    const avatars = arr(aRes, 'data.avatars', 'avatars').map(a => ({
      id: a.avatar_id || a.id,
      name: a.avatar_name || a.name || a.id,
      gender: a.gender || '',
      preview: a.preview_image_url || a.preview_image || '',
      default_voice_id: a.default_voice_id || '',
      premium: !!a.premium,
    })).filter(a => a.id);

    const voices = arr(vRes, 'data.voices', 'voices').map(v => ({
      id: v.voice_id || v.id,
      name: v.name || v.display_name || v.voice_id,
      gender: v.gender || '',
      lang: v.language || v.locale || v.lang || '',
      preview: v.preview_audio || v.sample || '',
    })).filter(v => v.id);

    return { statusCode: 200, headers, body: JSON.stringify({ avatars, voices }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
