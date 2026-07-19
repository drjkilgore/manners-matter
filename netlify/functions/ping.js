// netlify/functions/ping.js — minimal isolation test.
// If GET /.netlify/functions/ping returns JSON, the functions runtime works.
// If it 502s, the problem is the Netlify environment (Node runtime / module
// format / broken deploy), not the app code.
exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ok: true, node: process.version, at: new Date().toISOString() }),
});
