# Reading and answering partner access requests

A signed-in visitor asks for partner access on `/partners` (spec §6.9). The request is stored as a flag on
`(other, partner-access)` (D17) with the requester's email from their session. The web app never renders anyone's email
(§2.2): `/review/flags` lists the requests under "Partner access requests" without the address. The team reads the reply
address with the query below, which needs database access on the host.

Emails are personal data. Copy an address only into the team mailbox's reply, never into this repository, an issue, a PR,
a chat channel or a log.

## 1. See the open requests

Sign in at https://drugdb.eliooo.org/review/flags with a reviewer account. Each request shows its id, its date and the
four lines the requester entered (organisation, kind of system, expected checks per day, what they will build).

## 2. Read the reply address (host, read-only)

```bash
ssh ec2-user@<host>
cd ~/drugdb/deploy && docker-compose exec -T -e PGOPTIONS='-c default_transaction_read_only=on' db \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d bddrug -At -F "|"' <<'SQL'
SELECT id, to_char(created_at AT TIME ZONE 'Asia/Dhaka', 'DD/MM/YYYY HH24:MI'), reporter_email
FROM ops.flag
WHERE target_type = 'other' AND target_id = 'partner-access' AND status = 'open'
ORDER BY created_at;
SQL
```

The transaction is read-only (`default_transaction_read_only=on`) and stops at the first error, so a mistyped edit
cannot write. The output names each request id with its Dhaka date and reply address.

## 3. Reply, then resolve

Reply from the team mailbox to the address for that id. Then resolve the request on `/review/flags` with Resolve (the
bot check runs; the `flag_resolved` audit row records who resolved it). Close the terminal: the address must not stay in
scrollback on a shared machine.
