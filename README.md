# AutoNews — Balkan keyword news MVP

Subscribe to mainstream Balkan peninsula media by keyword.
Star articles into a personal favorites list. Frontend on GitHub Pages; data and auth on Supabase; RSS crawl via GitHub Actions.

## Architecture

```
User → GitHub Pages (React) → Supabase (Auth + Postgres)
GitHub Actions (every 15 min) → Balkan RSS feeds → Supabase articles
```

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run migrations in order:
   - [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql)
   - [`supabase/migrations/002_ai_chinese.sql`](supabase/migrations/002_ai_chinese.sql)
3. In **Authentication → Providers**, keep Email enabled.
   - For local testing you may disable “Confirm email”.
4. Copy **Project URL** and **anon public** key from **Settings → API**.
5. Copy **service_role** key (secret) for the crawler only — never put it in the frontend.

## 2. Frontend (local)

```bash
cd web
cp .env.example .env
# edit .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Open the printed URL (usually `http://localhost:5173`).

## 3. Crawler + AI (local)

中文模糊句 → AI 提炼巴尔干当地语言检索词；新闻标题/摘要 → AI 译成中文。

默认对接 **DeepSeek**（OpenAI 兼容）。也可改 `AI_BASE_URL` / `AI_MODEL` 使用 OpenAI 等。

```powershell
cd crawler
pip install -r requirements.txt
$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
$env:AI_API_KEY="your_deepseek_or_openai_key"
$env:AI_BASE_URL="https://api.deepseek.com"   # OpenAI 则用 https://api.openai.com
$env:AI_MODEL="deepseek-chat"                # OpenAI 可用 gpt-4o-mini
python crawl.py
python process_ai.py
```

Normalization unit test:

```bash
python test_normalize.py
```

## 4. GitHub repository secrets

In the GitHub repo: **Settings → Secrets and variables → Actions**, add:

| Secret | Used by |
| --- | --- |
| `SUPABASE_URL` | crawl workflow |
| `SUPABASE_SERVICE_ROLE_KEY` | crawl workflow |
| `AI_API_KEY` | crawl workflow（关键词提炼 + 中文翻译） |
| `AI_BASE_URL` | 可选，默认 `https://api.deepseek.com` |
| `AI_MODEL` | 可选，默认 `deepseek-chat` |
| `VITE_SUPABASE_URL` | Pages deploy workflow |
| `VITE_SUPABASE_ANON_KEY` | Pages deploy workflow |

## 5. GitHub Pages

1. Push to `main` (or `master`).
2. Repo **Settings → Pages → Build and deployment → Source**: **GitHub Actions**.
3. The workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) builds `web/` and publishes it.
4. Crawl runs every 15 minutes via [`.github/workflows/crawl.yml`](.github/workflows/crawl.yml) (also triggerable manually).

### Custom domain

1. Buy a domain (Cloudflare / Namecheap / etc.).
2. In Pages settings, set the custom domain and follow DNS instructions (`CNAME` for `www`, or `A`/`ALIAS` for apex).
3. Enable **Enforce HTTPS** after DNS verifies.
4. Optional: add `web/public/CNAME` containing your domain so it survives rebuilds.

**Note:** Free GitHub accounts can use Pages with custom domains on **public** repositories (or with GitHub Pro for private).

## Product features (MVP)

- Email register / login / logout
- Per-user keywords (Latin ↔ Cyrillic aware matching); add/delete triggers an immediate crawl
- Public news pool from Balkan RSS; logged-in users filter by keywords
- Star / unstar → favorites page
- Title, summary, source, time, and outbound link only (no full-text republication)

## RSS sources

Configured in [`crawler/sources.py`](crawler/sources.py) (verified endpoints):

| Region | Sources |
| --- | --- |
| Serbia | Blic, B92, RTS, Novosti, N1, Danas |
| Croatia | Jutarnji, Večernji, 24sata, N1, Telegram, Net.hr |
| BiH | Klix, Avaz, N1, Radio Sarajevo |
| Montenegro | CDM, RTCG, MINA |
| North Macedonia | Meta.mk, Nova Makedonija, MRT, Telma |
| Albania | BalkanWeb, Tirana Times |
| Kosovo | Koha, Gazeta Express, Kallxo, Prishtina Insight |
| Slovenia | 24ur, Delo, N1 |
| Bulgaria | Actualno |
| Regional EN | Balkan Insight |

## License / copyright

This project stores headlines and short summaries with links to the original publishers. Do not scrape or republish full article bodies.
