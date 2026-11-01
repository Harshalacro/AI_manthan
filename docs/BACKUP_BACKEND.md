# Backup API on Hugging Face Spaces

A second copy of the API, free on Hugging Face Spaces, that the website uses on
its own while the main one on Render is down (for example when Render's free
hours run out). Both use the same Neon database, so users, sign-ins, results
and settings are the same on either one.

```
Vercel site ──► Render API (main) ──┐
     │ down?                         ├──► Neon Postgres (shared)
     └────────► HF Space API (backup)┘
```

## 1. Create the Space

1. On https://huggingface.co sign in, then **New Space**.
2. Name it, e.g. `jaldrishti-api`. **SDK: Docker** (Blank). Hardware: **CPU basic (free)**.
   Visibility: **Public** (a private Space cannot be called by the website).
3. In the Space, **Files → Add file → Upload files**: upload `hf-space/Dockerfile`
   and `hf-space/README.md` from this repo (replace the Space's README).

The build clones this repo from GitHub and runs `backend/`, so the Space needs
no other files.

## 2. Settings → Variables and secrets

Add these as **Secrets**, with the same values as on Render:

| Name | Value |
|---|---|
| `DATABASE_URL` | The same Neon connection string as Render |
| `JALDRISHTI_SECRET` | The same value as Render, so a sign-in works on both |
| `JALDRISHTI_SEED_PASSWORD` | Same as Render |
| `JALDRISHTI_CWC_RELAY` | Same as Render, e.g. `https://ai-manthan-wheat.vercel.app/api/cwc` |
| `JALDRISHTI_CWC_RELAY_TOKEN` | Same as Render |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `OPENWEATHER_API_KEY` | Whichever Render has |

And these as **Variables**:

| Name | Value |
|---|---|
| `JALDRISHTI_CORS` | `https://ai-manthan-wheat.vercel.app` (the site's domain) |
| `JALDRISHTI_CORS_REGEX` | `https://ai-manthan-wheat\.vercel\.app` |
| `JALDRISHTI_PUBLIC_WEB_URL` | `https://ai-manthan-wheat.vercel.app` |
| `JALDRISHTI_KEEPALIVE_URL` | The Space's own URL, e.g. `https://your-name-jaldrishti-api.hf.space`, so it does not sleep |

**Do not set** `JALDRISHTI_NOTIFY_WEBHOOK` or `JALDRISHTI_NOTIFY_RECIPIENTS` on the
backup. Then only Render sends emails and WhatsApp alerts, and nobody gets
them twice. (Without a webhook the backup marks nothing as sent, so Render
still sends every alert.)

Save; the Space rebuilds. When it shows **Running**, open
`https://your-name-jaldrishti-api.hf.space/api/health`: it should show `"ok": true`.
The Space's URL is under **⋮ → Embed this Space → Direct URL**.

## 3. Point the website at it

On Vercel → the project → **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `VITE_API_BASE_FALLBACK` | `https://your-name-jaldrishti-api.hf.space` |

Then **Deployments → ⋯ → Redeploy** (Vite reads it only at build time).

The site now calls Render first. If Render cannot be reached or answers
502/503/504, the same call goes to the backup, and the site keeps using the
backup for 5 minutes before trying Render again.

## 4. Keep it on the same code (optional)

The Space builds from `main` on GitHub when it rebuilds. To rebuild it on every
push to `main`, in this GitHub repo → **Settings → Secrets and variables →
Actions**, add:

- secret `HF_TOKEN`: a Hugging Face token with **write** access
  (huggingface.co → Settings → Access Tokens);
- variable `HF_SPACE`: the Space id, e.g. `your-name/jaldrishti-api`.

`.github/workflows/hf-backup.yml` then rebuilds it. Without them, rebuild by
hand: Space → **Settings → Factory rebuild**.

## Notes

- Both copies refresh the data on their own timer and write to the same
  database. That is safe; it only means a few more scoring runs.
- A free Space sleeps after 48 hours without visits; the keep-alive above
  stops that. If it is asleep, the first call takes about a minute to wake it.
- The CAP feed links on the site always point at the main API.
