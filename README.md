# Poise & Purpose Academy

White-label etiquette, character, confidence & life-skills app for children and teens (ages 5–21).

## Repo structure (keep as-is)
```
index.html                          # the app (runs standalone)
netlify.toml                        # Netlify config
netlify/functions/etiquette-coach.js# AI coach proxy (safety guardrails)
db/schema.sql                       # Supabase schema (for real accounts, later)
```

## Deploy
1. Create a GitHub repo. Upload the **extracted** files above (not the .zip).
   Drag-and-drop preserves the folders.
2. In Netlify: **Add new site → Import from GitHub**, pick the repo.
   Root publish; functions are auto-detected from `netlify.toml`.
3. (Optional, turns on the live AI coach) Netlify → Site settings →
   Environment variables → add:
   - `ANTHROPIC_API_KEY` — your Anthropic key
   - `ALLOW_ORIGIN` — your site URL (e.g. https://your-site.netlify.app)
   Redeploy. Without a key, the coach uses a built-in safe offline fallback.

## Notes
- The MVP stores learner data in the browser on one device.
- Before a family-facing launch: wire parental consent + Supabase auth/RLS
  (run `db/schema.sql`) so kids' data isn't device-local.
- Curriculum is data-driven — add lessons to the `LESSONS`/`MODULES`
  arrays in `index.html`.
