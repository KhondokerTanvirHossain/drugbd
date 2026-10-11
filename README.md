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

One-time setup:

1. **DNS (Hostinger):** add an A record `drugdb` → `13.205.14.249` (the same IP as medioo.eliooo.org).
2. **Host `.env`:**
   ```bash
   mkdir -p ~/drugdb/deploy && cd ~/drugdb/deploy
   # paste deploy/.env.example as .env, then set a real DB_PASSWORD (alphanumeric only: no $, quotes or spaces)
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
