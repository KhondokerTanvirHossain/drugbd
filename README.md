# BDDrug KB

BDDrug KB is a Bangladesh drug knowledge base. A Python ETL pipeline loads drug data into PostgreSQL, a Java API serves the curated data, and a Next.js site presents it to users. Sprint 1 builds the walking skeleton across all four layers.

## Local dev

```bash
cd deploy
cp .env.example .env                 # set DB_USER / DB_PASSWORD (alphanumeric only: no $, quotes or spaces)
docker compose up -d db
docker compose run --rm flyway       # applies db/migrations
docker compose exec db psql -U bddrug -d bddrug -c '\dt curated.*'
docker compose down -v               # stop and remove the local DB volume
```

## Deploy (shared EC2 host, drugdb.eliooo.org)

The app runs on the same EC2 host as medscribe and n8n, behind the existing Caddy stack in `~/n8n`. Caddy owns ports 80/443 and issues TLS certificates. This stack publishes no host ports: `web` joins Caddy's `n8n_edge` network under the alias `bddrug-web`, while `api` and `db` stay on an internal-only network. Rate limiting (10 req/s, burst 30 per client IP) is done in the web app's middleware, because stock Caddy has no rate-limit module.

CI runs on every PR and push. A push to `main` that passes CI triggers `deploy`:
1. It builds and pushes `ghcr.io/<owner>/bddrug-{etl,api,web}:<sha>`.
2. It copies `deploy/docker-compose.yml`, `db/migrations` and `batches/` to `/home/ec2-user/drugdb`.
3. It logs in to GHCR with the workflow token, runs `docker-compose up -d`, then logs out.

The host has no git checkout. `load-dgda` is a manual batch job.

Repo secrets (Settings > Secrets and variables > Actions). They have the same names and values as in the elioo-health repo:

| Secret | Meaning |
|--------|---------|
| `EC2_HOST` | EC2 host name or IP |
| `EC2_USER` | `ec2-user` |
| `EC2_SSH_KEY` | private key for that user |

Repo variables (same page, Variables tab) hold the public reviewer sign-in config that is built into the web image; see [Reviewer sign-in setup](#reviewer-sign-in-setup).

One-time setup:

1. **DNS (Hostinger):** add an A record `drugdb` → `13.205.14.249` (the same IP as medioo.eliooo.org).
2. **Host `.env`:**
   ```bash
   mkdir -p ~/drugdb/deploy && cd ~/drugdb/deploy
   # paste deploy/.env.example as .env, then set a real DB_PASSWORD (alphanumeric only: no $, quotes or spaces)
   # also set the reviewer sign-in values (see Reviewer sign-in setup); deploy refuses to run without SESSION_SECRET and INTERNAL_API_TOKEN
   chmod 600 .env
   ```
3. **Caddy:** append `deploy/caddy/drugdb.caddy` to `~/n8n/Caddyfile`, then validate and reload without downtime:
   ```bash
   cp ~/n8n/Caddyfile ~/n8n/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)
   docker exec n8n-caddy-1 caddy validate --config /etc/caddy/Caddyfile
   docker exec n8n-caddy-1 caddy reload --config /etc/caddy/Caddyfile
   ```
   Caddy gets the certificate once DNS resolves. Until the first deploy, the site answers 502.

Run order: merge to `main` → `ci` green → `deploy` runs by itself → run `load-dgda` manually (Actions tab) with `batch=0001-pilot.txt` → open `https://drugdb.eliooo.org/batches/0001-pilot`. A new batch file has to be merged and deployed before `load-dgda` can use it.

Notes:
- `deploy/.env` must contain an `IMAGE_TAG=` line; deploy rewrites it with the deployed SHA. `GHCR_OWNER` must be lowercase.
- Memory limits (db 256m, api 448m, web 256m) are sized for the 3.7 GB host shared with medscribe (1.2 GB) and n8n.
- Disk is tight (about 3.5 GB free on 20 GB). Old medscribe image tags are the main reclaimable space (`docker system df`).

## Reviewer sign-in setup

Pharmacists and engineers sign in with Google (Firebase Auth) to review batch records; any other Google account can sign in to flag problems. Write actions also need a Cloudflare Turnstile check. Until this is set up, `/signin` says "Reviewer sign-in is not configured." and anonymous visitors see only pharmacist-approved records, so the pilot stays hidden until a pharmacist approves it.

Where each value lives:

| Value | Kind | Where |
|-------|------|-------|
| Firebase `apiKey`, `authDomain`, `projectId`, `appId`; Turnstile site key | public | GitHub repo **variables** (built into the web image) and host `deploy/.env` |
| `SESSION_SECRET`, `INTERNAL_API_TOKEN`, `TURNSTILE_SECRET_KEY` | secret | host `deploy/.env` only |
| `REVIEWERS` (reviewer emails) | personal data | host `deploy/.env` only |

1. **Firebase console** (https://console.firebase.google.com):
   - Create a project (or pick an existing one). Google Analytics is not needed.
   - Build > Authentication > Get started > Sign-in method > **Google** > Enable, choose a support email, Save.
   - Authentication > Settings > **Authorized domains** > Add domain `drugdb.eliooo.org` (`localhost` is listed by default for local runs).
   - Project settings > General > Your apps > Add app > Web (`</>`). Register it without Hosting and copy `apiKey`, `authDomain` (`<project>.firebaseapp.com`), `projectId` and `appId` from the config snippet.
   - No service account is needed: the server verifies Google ID tokens with the project ID alone.
2. **Cloudflare Turnstile** (Cloudflare dashboard > Turnstile > Add widget): hostname `drugdb.eliooo.org`, mode Managed. Copy the site key and the secret key. For local runs use Cloudflare's always-pass test keys (site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`); the app rejects them in production.
3. **GitHub repo variables** (Settings > Secrets and variables > Actions > **Variables** tab, not Secrets): `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`, `TURNSTILE_SITE_KEY`. `next build` inlines them into the web image, so a change takes effect only with the next deploy (push to `main` or re-run `deploy`). An unset variable builds an image with sign-in disabled.
4. **Host `.env`** (`~/drugdb/deploy/.env`, `chmod 600`). Add the lines from `deploy/.env.example`:
   ```bash
   openssl rand -hex 32   # SESSION_SECRET (signs the session cookie)
   openssl rand -hex 32   # INTERNAL_API_TOKEN (web -> api; never leaves the Docker network)
   ```
   - Paste the two generated values (hex only, so compose needs no quoting), plus `TURNSTILE_SECRET_KEY`.
   - Set `FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_APP_ID` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to the same values as the repo variables.
   - Do this **before** the merge that deploys Sprint 3: web and api refuse to start without a `SESSION_SECRET` / `INTERNAL_API_TOKEN` of at least 32 characters, so `deploy` stops with an error (and leaves the running containers alone) while either is missing.
5. **`REVIEWERS` format:** comma-separated `email:role` pairs with no spaces, role `pharmacist` or `engineer`:
   ```bash
   REVIEWERS=alice@example.com:pharmacist,bob@example.com:engineer
   ```
   - Emails match case-insensitively. Malformed entries are ignored. Anyone signed in but not listed gets role `user` (can flag, cannot review).
   - Only a pharmacist's OK approves a record; an engineer's OK is recorded but does not approve on its own.
   - Re-running a record puts it back to pending. So does a run of **another** product that really changes data the record shows through a shared substance: a new name or code, a new or changed DDInter mapping, a coverage change, or a changed interaction pair or text. Such a record goes back to pending in its latest batch, and the ETL log lists it ("re-opened the review of N other record(s)"). A run that rewrites identical data re-opens nothing else.
   - Reviewer emails are personal data: keep them only in the host `.env`. Never commit them or paste them into issues, PRs or logs. Public pages show the role, never the email.

**Add, remove or change a reviewer** on the host:

```bash
cd ~/drugdb/deploy
vi .env                      # edit the REVIEWERS line
docker-compose up -d web     # recreates web with the new list; api and db keep running
```

A removed reviewer loses review rights on their next request. A reviewer whose role changed signs out and in again. Rotating `SESSION_SECRET` signs everyone out (`docker-compose up -d web`). Rotating `INTERNAL_API_TOKEN` needs both services: `docker-compose up -d api web`.
