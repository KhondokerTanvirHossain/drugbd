# Inviting a reviewer

Pharmacists and engineers review IntelliDrugs batches on `/review`. Roles are global and come from `REVIEWERS` in the host `.env` (spec §5.13). Invites are sent by hand from the template below; there is no automated email.

Reviewer emails are personal data. Keep them in the host `.env` and in your own mail client only: never in this repository, an issue, a PR, a chat channel or a log.

## 1. Find the batch and its size

Sign in at https://drugdb.eliooo.org/review with a reviewer account. The page lists every batch with its id and record count; use the newest batch that is **In review** (the one the reviewer's account menu will name).

## 2. Add the reviewer on the host

```bash
ssh ec2-user@<host>
cd ~/drugdb/deploy
cp .env .env.bak-$(date +%Y%m%d)       # keep a dated copy; it is chmod 600 like .env
vi .env                                 # append ,their.address@example.com:pharmacist (or :engineer) to REVIEWERS
cd ~/drugdb/deploy && docker-compose up -d --no-deps web
```

- The `REVIEWERS` line is comma-separated `email:role` pairs with no spaces; the role is `pharmacist` or `engineer`.
- `docker-compose up -d --no-deps web` recreates only the web container. `--no-deps` matters: without it Compose also brings up `web`'s dependency chain (`api`, then the exited one-shot `flyway`, which would run against the production database). The API, the database and the other sites on the host keep running; the `medscribe`, `baymax`, `medioo` and `n8n` containers and the Caddy container are never restarted (§12.4).
- Check: `curl -fsS https://drugdb.eliooo.org/healthz` answers `ok`.
- Delete the `.env.bak-*` copy once the reviewer has signed in: it holds the same personal data.

## 3. Send the invite

Send it from the team mailbox to the address you added, exactly as below, with the role, batch id and record count filled in.

**Subject:** You're invited to review medicines on IntelliDrugs

**Body:**

> Role: {Pharmacist|Engineer}. Batch {id}, {n} records. Sign in at drugdb.eliooo.org with this Google account.

Example for a pharmacist on the pilot: "Role: Pharmacist. Batch 0001-pilot, 10 records. Sign in at drugdb.eliooo.org with this Google account."

## 4. What the reviewer sees

- They sign in with the invited Google account and open **Review desk** from the account menu, or go to `/review`.
- If they sign in with another Google account, every `/review` page says "This Google account isn't on the reviewer list." and offers "Use another Google account". Nothing else needs fixing: they sign out and use the invited account.
- A pharmacist's "Looks correct" publishes the record after the undo window. An engineer's check is recorded and never publishes.

## Change a role or remove a reviewer

Edit or delete their pair in `REVIEWERS`, then `cd ~/drugdb/deploy && docker-compose up -d --no-deps web`. A removed reviewer loses review rights on their next request. A reviewer whose role changed signs out and in again. Their past decisions stay in `ops.review_decision`; pages show their role, never their email.
