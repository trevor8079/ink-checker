# Ink Checker

Wallet checker for Ink chain: auto-reads TX count, ETH volume, and NFTs from the
Ink Blockscout explorer, and lets you add Tydro points, Nado points, and Kraken
verification manually to compute a weighted score, OG badge, and estimated
Power Rank.

## Run locally

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

## Deploy to Vercel

**Option A — via GitHub (recommended, gives you auto-deploys on every push):**

1. Push this folder to a new GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "Ink checker"
   git branch -M main
   git remote add origin https://github.com/<your-user>/<repo-name>.git
   git push -u origin main
   ```
2. Go to https://vercel.com/new, click "Import Project", and select the repo.
3. Vercel auto-detects Vite. Leave defaults:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Click Deploy. You'll get a `*.vercel.app` URL in ~1 minute.

**Option B — from the terminal, no GitHub needed:**

```bash
npm install -g vercel
vercel login
vercel --prod
```

### Custom domain on Vercel

1. In the Vercel dashboard, open your project → **Settings → Domains**.
2. Add your domain (e.g. `inkchecker.xyz`).
3. Vercel gives you either:
   - An **A record** to point `@` to `76.76.21.21`, or
   - A **CNAME** for a subdomain (e.g. `www` → `cname.vercel-dns.com`).
4. Add that record in your domain registrar's DNS settings (Namecheap, GoDaddy,
   Cloudflare, etc). Propagation usually takes a few minutes to a few hours.
5. Vercel auto-provisions HTTPS (Let's Encrypt) once DNS resolves — no extra step.

## Deploy to Netlify

**Option A — via GitHub:**

1. Push the repo to GitHub (same steps as above).
2. Go to https://app.netlify.com/start, pick the repo.
3. Build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Click Deploy site.

**Option B — from the terminal:**

```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod
```
(When prompted for the publish directory, run `npm run build` first and point it to `dist`.)

### Custom domain on Netlify

1. Site settings → **Domain management → Add a domain**.
2. Netlify gives you a **CNAME** (`<your-site>.netlify.app`) for subdomains, or
   for an apex domain (`inkchecker.xyz`) it'll ask you to either use Netlify DNS
   (easiest — it manages everything) or add an **A record** pointing to
   `75.2.60.5`.
3. Add the record at your registrar, or transfer DNS to Netlify if you chose
   that route.
4. HTTPS is automatic via Let's Encrypt once DNS is verified.

## Notes

- All wallet data is fetched client-side directly from `explorer.inkonchain.com`
  (Blockscout's public API) — no backend, no API keys, no server costs.
- Tailwind is loaded via CDN in `index.html` for zero build config. For a
  production-grade setup you'd switch to Tailwind as a proper PostCSS plugin,
  but the CDN version is fine for a project this size.
