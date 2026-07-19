// netlify/functions/heygen-list.js
// Returns HeyGen avatars and voices for the admin picker.
// Hardened: per-request timeouts, never throws a bare 502, and a ?ping=1
// mode to confirm the function itself runs.
//
// Env var: HEYGEN_API_KEY (set in Netlify)
// GET /.netlify/functions/heygen-list?ping=1  -> { ok, node }  (no HeyGen call)
// GET /.netlify/functions/heygen-list         -> { avatars:[...], voices:[...], diag }

const AVATARS_URL = 'https://api.heygen.com/v2/avatars';
const VOICES_URL  = 'https://api.heygen.com/v2/voices';

function arr(d, ...keys){
  for (const k of keys){
    const v = k.split('.').reduce((o,p)=> (o==null? o : o[p]), d);
    if (Array.isArray(v)) return v;
  }
  return [];
}

async function getWithTimeout(url, apiKey, ms){
  const ctrl = new AbortController();
  const t = setTimeout(()=> ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'X-Api-Key': apiKey }, signal: ctrl.signal });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch(_) {}
    return { ok: r.ok, status: r.status, json, snippet: json ? null : text.slice(0,200) };
  } catch (e) {
    return { ok:false, status:0, json:null, snippet: e.name==='AbortError' ? 'timed out' : String(e.message||e) };
  } finally { clearTimeout(t); }
}

exports.handler = async (event) => {
  const origin = process.env.ALLOW_ORIGIN || '*';
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const q = event.queryStringParameters || {};
  if (q.ping) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok:true, node: process.version, hasKey: !!process.env.HEYGEN_API_KEY }) };
  }

  if (!process.env.HEYGEN_API_KEY) {
    return { statusCode: 200, headers, body: JSON.stringify({ avatars:[], voices:[], error:'HEYGEN_API_KEY not set in Netlify env' }) };
  }
  const key = process.env.HEYGEN_API_KEY;

  // 8s cap per call keeps us under Netlify's 10s function limit.
  const [a, v] = await Promise.all([
    getWithTimeout(AVATARS_URL, key, 8000),
    getWithTimeout(VOICES_URL,  key, 8000),
  ]);

  const avatars = arr(a.json, 'data.avatars', 'avatars').map(x => ({
    id: x.avatar_id || x.id,
    name: x.avatar_name || x.name || x.id,
    gender: x.gender || '',
    preview: x.preview_image_url || x.preview_image || '',
    default_voice_id: x.default_voice_id || '',
    premium: !!x.premium,
  })).filter(x => x.id);

  const voices = arr(v.json, 'data.voices', 'voices').map(x => ({
    id: x.voice_id || x.id,
    name: x.name || x.display_name || x.voice_id,
    gender: x.gender || '',
    lang: x.language || x.locale || x.lang || '',
  })).filter(x => x.id);

  const diag = {
    avatars: { status: a.status, count: avatars.length, note: a.snippet },
    voices:  { status: v.status, count: voices.length, note: v.snippet },
  };
  const error = (avatars.length===0 && voices.length===0)
    ? `HeyGen returned no data (avatars HTTP ${a.status}, voices HTTP ${v.status}). ${a.snippet||v.snippet||'Check that your key has API access.'}`
    : undefined;

  return { statusCode: 200, headers, body: JSON.stringify({ avatars, voices, diag, error }) };
};
