// netlify/functions/heygen-list.js
// Lists HeyGen avatars + voices for the admin picker.
// ?ping=1  -> {ok, node, hasKey}                 (no HeyGen call)
// ?debug=1 -> compact diagnostic (no huge arrays; safe to paste)
// (default)-> { avatars:[...], voices:[...], diag, error }

const AVATARS_URL = 'https://api.heygen.com/v2/avatars';
const VOICES_URL  = 'https://api.heygen.com/v2/voices';
const TIMEOUT = 9500; // stay just under Netlify's 10s function limit

function arr(d, ...keys){
  for (const k of keys){
    const v = k.split('.').reduce((o,p)=> (o==null? o : o[p]), d);
    if (Array.isArray(v)) return v;
  }
  return [];
}
async function getJSON(url, apiKey, ms){
  const ctrl = new AbortController();
  const t = setTimeout(()=> ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'X-Api-Key': apiKey }, signal: ctrl.signal });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch(_) {}
    return { ok:r.ok, status:r.status, json, snippet: json? null : text.slice(0,200) };
  } catch (e) {
    return { ok:false, status:0, json:null, snippet: e.name==='AbortError'?'timed out':String(e.message||e) };
  } finally { clearTimeout(t); }
}
// avatars can live under several shapes; also accept photo avatars
function extractAvatars(j){
  const rows = [
    ...arr(j,'data.avatars','avatars'),
    ...arr(j,'data.talking_photos','talking_photos').map(p=>({ ...p, __photo:true })),
    ...arr(j,'data.avatar_list','avatar_list'),
  ];
  return rows.map(x => ({
    id: x.avatar_id || x.talking_photo_id || x.id,
    name: x.avatar_name || x.talking_photo_name || x.name || x.avatar_id || x.talking_photo_id || x.id,
    gender: x.gender || '',
    preview: x.preview_image_url || x.preview_image || x.image_url || '',
    default_voice_id: x.default_voice_id || '',
    premium: !!x.premium,
    photo: !!x.__photo,
  })).filter(x => x.id);
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': process.env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  const q = event.queryStringParameters || {};

  if (q.ping) return { statusCode: 200, headers, body: JSON.stringify({ ok:true, node:process.version, hasKey:!!process.env.HEYGEN_API_KEY }) };
  if (!process.env.HEYGEN_API_KEY) return { statusCode: 200, headers, body: JSON.stringify({ avatars:[], voices:[], error:'HEYGEN_API_KEY not set in Netlify env' }) };
  const key = process.env.HEYGEN_API_KEY;

  // Debug: show what the avatars endpoint actually returned, small + pasteable.
  if (q.debug) {
    const a = await getJSON(AVATARS_URL, key, TIMEOUT);
    const top = a.json ? Object.keys(a.json) : [];
    const dataKeys = a.json && a.json.data && typeof a.json.data==='object' ? Object.keys(a.json.data) : [];
    const parsed = extractAvatars(a.json);
    return { statusCode: 200, headers, body: JSON.stringify({
      avatarsHttp: a.status, timedOut: a.snippet==='timed out', snippet: a.snippet,
      topLevelKeys: top, dataKeys, parsedCount: parsed.length,
      firstRaw: (arr(a.json,'data.avatars','avatars','data.talking_photos','talking_photos')[0]) || null,
    }, null, 2) };
  }

  if (q.only === 'avatars') {
    const a = await getJSON(AVATARS_URL, key, TIMEOUT);
    const avatars = extractAvatars(a.json);
    return { statusCode: 200, headers, body: JSON.stringify({ avatars, diag:{avatars:{status:a.status,count:avatars.length,note:a.snippet}} }) };
  }

  const [a, v] = await Promise.all([ getJSON(AVATARS_URL, key, TIMEOUT), getJSON(VOICES_URL, key, TIMEOUT) ]);
  const avatars = extractAvatars(a.json);
  const voices = arr(v.json,'data.voices','voices').map(x=>({ id:x.voice_id||x.id, name:x.name||x.display_name||x.voice_id, gender:x.gender||'', lang:x.language||x.locale||x.lang||'' })).filter(x=>x.id);

  const diag = { avatars:{status:a.status, count:avatars.length, note:a.snippet}, voices:{status:v.status, count:voices.length, note:v.snippet} };
  const error = avatars.length===0 ? `No avatars parsed (avatars HTTP ${a.status}${a.snippet? ', '+a.snippet:''}). Try ?debug=1 to inspect.` : undefined;
  return { statusCode: 200, headers, body: JSON.stringify({ avatars, voices, diag, error }) };
};
