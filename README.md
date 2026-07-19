# Poise & Purpose Academy

White-label etiquette, character, confidence & life-skills app for children and teens (ages 5–21).

## Repo structure (keep as-is)
```
index.html                            # the app (runs standalone)
netlify.toml                          # Netlify config
netlify/functions/etiquette-coach.js  # AI coach proxy (safety guardrails)
netlify/functions/generate-narration.js # HeyGen avatar video generation
netlify/functions/heygen-list.js      # lists HeyGen avatars & voices for the picker
admin/narration.html                  # browser tool to build the narration manifest
lesson-scripts.json                   # lesson narration scripts (source for the tool)
narration-manifest.json               # (you generate this) maps lesson -> video URL
db/schema.sql                         # Supabase schema (for real accounts, later)
```

## Deploy
1. Create a GitHub repo. Upload the **extracted** files above (not the .zip).
   Drag-and-drop preserves the folders.
2. In Netlify: **Add new site → Import from GitHub**, pick the repo.
   Root publish; functions auto-detected from `netlify.toml`.
3. Environment variables (Netlify → Site settings → Environment):
   - `ANTHROPIC_API_KEY` — turns on the live AI coach (else it uses a safe offline fallback)
   - `HEYGEN_API_KEY` — enables avatar narration generation
   - `ALLOW_ORIGIN` — your site URL (optional)
   Redeploy.

## Avatar narration (HeyGen, pre-rendered)
The app plays a short avatar video on any lesson that has one; lessons without a
video just show text. To create the videos:

1. Set `HEYGEN_API_KEY` in Netlify and redeploy.
2. Open `https://your-site/admin/narration.html` and click **Load avatars & voices**.
   Click an avatar to pick it (its voice auto-fills) — no IDs to copy by hand.
3. Click **Generate all narrations**. It renders each lesson and builds
   `narration-manifest.json`.
4. Download that file, commit it to the repo root, redeploy. Narrations now appear.

Notes:
- HeyGen video URLs can be temporary. For a durable app, download each MP4 and
  re-host on Supabase Storage / Netlify, then put those URLs in the manifest.
- Pre-rendered narration suits fixed lesson content. The live AI coach stays
  text/voice for now; a real-time face would use HeyGen **LiveAvatar (LITE mode)**
  driven by the coach function so the safety guardrails still apply.

## Notes
- The MVP stores learner data in the browser on one device.
- Before a family-facing launch: wire parental consent + Supabase auth/RLS
  (run `db/schema.sql`) so kids' data isn't device-local.
- Curriculum is data-driven — add lessons to the `LESSONS`/`MODULES`
  arrays in `index.html`.
