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
