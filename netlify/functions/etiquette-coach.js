// netlify/functions/etiquette-coach.js
// Server-side proxy for the AI Etiquette Coach.
// Keeps the Anthropic API key private, enforces child-safety guardrails,
// and never returns raw model output without a safety pass.
//
// Env vars (set in Netlify dashboard, NOT in the repo):
//   ANTHROPIC_API_KEY   your Anthropic key
//   ALLOW_ORIGIN        your site origin, e.g. https://academy.example.com
//
// Deploy: this file is auto-detected by Netlify at /.netlify/functions/etiquette-coach

const MODEL = 'claude-sonnet-4-6'; // adjust to your available model

// Age-appropriate framing per band.
const BAND_STYLE = {
  k1: 'The child is 5-7. Use very short sentences, simple words, warm and gentle. 2-3 sentences max.',
  k2: 'The child is 8-10. Friendly and concrete, short sentences, one clear example. 3-4 sentences.',
  t1: 'The learner is 11-13. Respectful, practical, a little more detail. Up to ~5 sentences.',
  t2: 'The learner is 14-17. Mature but encouraging, concrete scripts they can say aloud.',
  ya: 'The learner is 18-21. Adult, professional-friendly tone, practical and specific.',
};

// Topics that must route straight to a trusted adult (no model answer).
const RED_FLAG = /(suicide|kill myself|hurt myself|self.?harm|abuse|touched me|nude|naked|sexual|meet up|my address|home address|password|social security|run away|drugs|alcohol|weapon|gun)/i;

// Requests to keep secrets from parents/guardians are never honored.
const SECRECY = /(keep (it|this) (a )?secret|don'?t tell (my )?(mom|dad|parent|guardian|teacher))/i;

const SYSTEM = `You are the Etiquette Coach inside a children's manners, character and life-skills app.

Your job: give kind, safe, age-appropriate etiquette and social-skills guidance.

Hard rules (never break):
- Be warm and encouraging. Never shame, mock, or scold the learner.
- Give practical etiquette guidance: greetings, manners, dining, conversation, confidence, digital kindness, hosting, gratitude, professionalism.
- Respect cultural and religious differences; offer options rather than one "correct" custom, and avoid rigid gender stereotypes.
- NEVER encourage secrecy from a parent or guardian. If a situation involves safety, encourage the learner to talk to a trusted adult.
- Do NOT give medical, legal, or mental-health diagnoses. For anything involving safety, health, money disputes, or the law, gently direct the learner to a trusted adult.
- Refuse anything unsafe, adult, sexual, violent, or that reveals private information. Redirect kindly.
- Keep answers focused and concise. End with encouragement when appropriate.

Output plain, friendly text only. No markdown headers.`;

exports.handler = async (event) => {
  const origin = process.env.ALLOW_ORIGIN || '*';
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad JSON' }) }; }

  const question = String(body.question || '').slice(0, 800);
  const band = BAND_STYLE[body.ageBand] ? body.ageBand : 't1';
  const name = String(body.learnerName || 'friend').replace(/[^\p{L}\p{N} '-]/gu, '').slice(0, 40) || 'friend';

  if (!question.trim()) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Empty question' }) };

  // 1) Pre-moderation: route sensitive topics to a trusted adult without calling the model.
  if (RED_FLAG.test(question) || SECRECY.test(question)) {
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        reply: `That sounds important, ${name}, and it's exactly the kind of thing a trusted grown-up should help you with — a parent, guardian, teacher, school counselor, or another adult you trust. You never have to handle something like that alone or keep it a secret. Please talk to one of them today.`,
        trustedAdult: true,
        moderated: true,
      }),
    };
  }

  // 2) No key configured -> tell the client to use its safe offline fallback.
  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 200, headers, body: JSON.stringify({ reply: null, fallback: true }) };
  }

  // 3) Ask the model with the safety system prompt.
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM + '\n\n' + BAND_STYLE[band],
        messages: [{ role: 'user', content: `A young learner named ${name} asks: "${question}"` }],
      }),
    });
    if (!r.ok) {
      return { statusCode: 200, headers, body: JSON.stringify({ reply: null, fallback: true }) };
    }
    const data = await r.json();
    const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

    // 4) Light post-check: if the model somehow raised a safety topic, add the trusted-adult flag.
    const trustedAdult = RED_FLAG.test(reply) || /trusted adult|parent|guardian|counselor/i.test(reply);
    return { statusCode: 200, headers, body: JSON.stringify({ reply: reply || null, trustedAdult, fallback: !reply }) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ reply: null, fallback: true }) };
  }
};
