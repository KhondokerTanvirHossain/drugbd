# Public mode: show unreviewed records, or approved records only

The product owner decided on 06/11/2026 (spec D74, §7.4.1) that the public site must work now, with records no pharmacist has approved yet, clearly marked. One server setting decides it, and the **API owns it**:

| `PUBLIC_SHOWS_UNREVIEWED` (api only) | Mode | What readers see |
|---|---|---|
| `true` (the production default) | show mode, `show_unreviewed` | every record whose latest batch item is current and was loaded from the DGDA register, each labelled: "Approved by a pharmacist", or "Not yet reviewed by a pharmacist" (plus "A problem has been reported with this record; it may be wrong." for an open issue or a failed check). Pages that show such a record open with "Some of this information has not yet been reviewed by a pharmacist. Check it before relying on it." |
| `false` | approved-only, `approved_only` | approved records only, exactly as before D74: everything else is a stub |
| unset or empty | approved-only | the API's code default (the safe value); production never runs this way, because the compose file defaults it to `true` |

Hidden in both modes: a product removed from its batch file, a DGDA load failure ("not found at source", "not a registered Drug product") and a product in no batch. The review desk, approvals, reopen, senior and pair review, the QA API and MCP, robots `Disallow: /`, the security headers, `no-store` caching and the internal token are the same in both modes.

## Where it is set

- `deploy/docker-compose.yml` passes `PUBLIC_SHOWS_UNREVIEWED: ${PUBLIC_SHOWS_UNREVIEWED:-true}` to the **api** service only. The web never reads it: every public page asks the API (`GET /v1/public-mode`, or `publicMode` in `/v1/stats`), so the two can never disagree, and a recreated API changes the site on the next request.
- The host `.env` (`~/drugdb/deploy/.env`, that is `$APP_DIR/deploy/.env` with `APP_DIR=/home/ec2-user/drugdb` in `.github/workflows/deploy.yml`) may override it. The deploy workflow copies `deploy/docker-compose.yml` to the host on every deploy and then runs `docker-compose up -d --remove-orphans`; it changes only the `IMAGE_TAG` line of the host `.env`, so an operator's `PUBLIC_SHOWS_UNREVIEWED=false` survives every later deploy.
- Any value other than `true` or `false` (in any case) stops the API at start with `PUBLIC_SHOWS_UNREVIEWED must be true or false`, so a typo never picks a mode.

## Turn show mode off (approved records only)

On the host:

```sh
cd ~/drugdb/deploy
grep -q '^PUBLIC_SHOWS_UNREVIEWED=' .env \
  && sed -i 's/^PUBLIC_SHOWS_UNREVIEWED=.*/PUBLIC_SHOWS_UNREVIEWED=false/' .env \
  || echo 'PUBLIC_SHOWS_UNREVIEWED=false' >> .env
docker-compose up -d --no-deps api web
```

Recreating the web is not needed for the mode (the web reads it from the API), but recreating both keeps the step the same as a rollback.

## Turn show mode on again

Set `PUBLIC_SHOWS_UNREVIEWED=true` in `~/drugdb/deploy/.env` (or delete the line: the compose default is `true`), then run the same command:

```sh
cd ~/drugdb/deploy && docker-compose up -d --no-deps api web
```

## Check

```sh
docker-compose logs --tail 50 api | grep 'Public mode:'      # "Public mode: show_unreviewed" or "Public mode: approved_only"
# the API's own answer, from inside the web container (the api is not published on the host)
docker-compose exec -T web node -e "fetch('http://api:8080/v1/public-mode').then(r => r.text()).then(console.log)"
#   {"success":true,"data":{"mode":"show_unreviewed"},...}
curl -fsS https://drugdb.eliooo.org/search?q=napa -o /dev/null && echo up
```

Then open `https://drugdb.eliooo.org/`: in show mode the lede ends "Records a pharmacist has not approved yet are shown, marked "Not yet reviewed by a pharmacist"."; in approved-only mode it ends "A record goes public only after a pharmacist approves it."

If the api does not come back, `docker-compose logs --tail 20 api` shows why. A bad value prints `PUBLIC_SHOWS_UNREVIEWED must be true or false`: fix the line in `.env` and run the command again. The old container is already gone at that point, so public pages answer with the error page until the api starts.

## Not a rollback

Turning show mode off changes no image and no data. Rolling the images back below the D74 release also returns the site to approved-only behaviour, because older APIs ignore `PUBLIC_SHOWS_UNREVIEWED` and older webs never ask for the mode. There is no schema change to keep or drop.

## Never

- Never put `PUBLIC_SHOWS_UNREVIEWED` in the web service's environment.
- Never change the mode on a running container by any other means; there is no endpoint, header or flag for it.
- Never run these commands on another stack on the shared host (medscribe, baymax, medioo, n8n): `--no-deps api web` recreates only the IntelliDrugs api and web.
