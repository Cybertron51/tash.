# Local setup (from zero to running)

Plain-language steps for cloning the app, pointing it at Supabase, and running it on your machine so you can change code and test in the browser.

---

## 1. Install tools on your computer

- **Git** (to clone the repo)
- **Node.js** — use **v20 LTS** or newer ([nodejs.org](https://nodejs.org))
- **npm** (comes with Node)
- Optional but useful:
  - **Supabase CLI** — only if you will run migrations from the terminal: [install](https://supabase.com/docs/guides/cli)
  - **Stripe CLI** — only if you test deposits/payments locally

Check versions:

```bash
node -v    # should be v20.x or newer
npm -v
```

---

## 2. Get the code

```bash
git clone https://github.com/Cybertron51/Ledger.git
cd Ledger
```

(Use the real repo URL your team shares, if different.)

If you already have a parent folder (e.g. a monorepo) that contains **`Ledger/`**, skip clone and **`cd`** into **`Ledger`** — all later commands run from that folder.

Install JavaScript dependencies:

```bash
npm install
```

---

## 3. Environment variables (`.env`)

The app reads secrets from a file named **`.env`** in the **`Ledger`** folder (same folder as `package.json`). That file is **not** in Git — you create it yourself.

1. Copy the template:

   ```bash
   cp .env.example .env
   ```

2. Open **`.env`** in an editor and fill in values.

### Minimum to **open the app** and use **catalog / market** pages (typical “browse + charts”):

| Variable | Where to get it |
|----------|------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project → **Settings → API → Project URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page → **anon public** key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → **service_role** key (keep secret; server-only) |

You can add a placeholder for `NEXT_PUBLIC_API_SECRET` (any long random string) if API routes complain.

### Full app (scanning, Stripe, email, etc.)

Use **`.env.example`** as the checklist. Your team lead should say which features you need for your task. Common extras:

- Google Vision / Gemini keys — card scan & AI
- PSA / JustTCG — grading & pricing integrations
- Stripe keys + webhook secrets — deposits (needs Stripe CLI for local webhooks)
- `RESEND_API_KEY`, `ADMIN_EMAIL` — email
- `CRON_SECRET` — only if you manually hit `/api/cron/tick-prices`

**Rule:** Never commit `.env` or paste **service_role** keys in chat or screenshots.

---

## 4. Database (Supabase)

The app expects a **Supabase Postgres** project with the right tables (migrations in `supabase/migrations/`).

### Option A — Use the team’s **hosted** project (easiest for most people)

1. Ask for access to the Supabase project (or create a **branch** / dev project if your team uses that).
2. Link and apply migrations from **`Ledger`** (if your team does schema via CLI):

   ```bash
   supabase login
   supabase link --project-ref <YOUR_PROJECT_REF>
   supabase db push
   ```

   If `db push` complains about migration history, **stop** and ask the team lead — do not guess. They may run migrations from CI or apply SQL by hand.

3. Your **`.env`** URLs and keys must match **this** project.

### Option B — **Local** Supabase (advanced)

Only if you want Postgres on Docker on your laptop:

```bash
supabase start
supabase db reset
```

Then put the local URL and keys from the CLI output into `.env`. This path is heavier; confirm with the team before using it.

---

## 5. Run the web app locally

From the **`Ledger`** folder:

```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

- Edit React/Next files; the page hot-reloads.
- If you change **env vars**, stop the server (`Ctrl+C`) and run `npm run dev` again.

Sanity check that the build works:

```bash
npm run build
```

---

## 6. Making edits and sharing them

1. Create a branch: `git checkout -b your-name/short-description`
2. Make changes, test with `npm run dev`
3. Commit and push; open a PR (or follow your team’s Git flow).

**Note:** Some helper scripts under `scripts/` are listed in `.gitignore` in this repo — if you add a new script you want in Git, check with the team before changing ignore rules.

---

## 7. Optional: one-off data / scripts

From **`Ledger`**, after `.env` is filled and network works:

- Price simulation (requires service role + DB reachability):

  ```bash
  npx tsx scripts/simulate-catalog-prices.ts --dry-run
  ```

- **Always** run long commands from the **`Ledger`** directory so `.env` loads correctly.

---

## 8. When something breaks

| Symptom | Things to check |
|---------|-------------------|
| `Module not found` / Stripe errors | Run `npm install` again from `Ledger` |
| Blank auth / no data | `NEXT_PUBLIC_*` URL and anon key match the project; RLS is normal for anon |
| API 503 “Database not configured” | `SUPABASE_SERVICE_ROLE_KEY` and URL set; no typos |
| `fetch failed` (CLI scripts) | VPN/network; URL is `https://….supabase.co`; project not paused |
| Migration / `db push` errors | Don’t force; paste the error to your team — history must stay in sync |

---

## Quick reference

```bash
cd Ledger
cp .env.example .env   # then edit .env
npm install
npm run dev            # http://localhost:3000
```

That’s the full loop: **clone → env → database aligned with team → `npm run dev` → edit and test.**
