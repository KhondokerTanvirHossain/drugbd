# BDDrug KB

BDDrug KB is a Bangladesh drug knowledge base. A Python ETL pipeline loads drug data into PostgreSQL, a Java API serves the curated data, and a Next.js site presents it to users. Sprint 1 builds the walking skeleton across all four layers.

## Local dev

```bash
cd deploy
cp .env.example .env                 # set DB_USER / DB_PASSWORD
docker compose up -d db
docker compose run --rm flyway       # applies db/migrations
docker compose exec db psql -U bddrug -d bddrug -c '\dt curated.*'
docker compose down -v               # stop and remove the local DB volume
```

## Deploy (VM bootstrap)

CI runs on every PR and push. Pushes to `main` that pass CI trigger `deploy`, which builds and pushes `ghcr.io/<owner>/bddrug-{etl,api,web}:<sha>` and rolls the VM forward over SSH. `load-dgda` is a manual batch job.

Repo secrets (Settings > Secrets and variables > Actions):

| Secret | Meaning |
|--------|---------|
| `VM_HOST` | VM address |
| `VM_USER` | SSH user on the VM |
| `VM_SSH_KEY` | private key for that user |
| `PREVIEW_DOMAIN` | public host name (DNS A record to the VM IP) |

One-time VM setup (Docker and the compose plugin installed, ports 80/443 open):

```bash
sudo mkdir -p /opt/bddrug && sudo chown $USER /opt/bddrug
git clone git@github.com:<org>/bddrug.git /opt/bddrug
cp /opt/bddrug/deploy/.env.example /opt/bddrug/deploy/.env   # then set real DB_PASSWORD, PREVIEW_DOMAIN, ACME_EMAIL, GHCR_OWNER
echo <ghcr-read-token> | docker login ghcr.io -u <user> --password-stdin
```

Run order: push `main`, wait for `ci` to go green, then `deploy` runs by itself. After that, run `load-dgda` manually (Actions tab) with `batch=0001-pilot.txt`.
