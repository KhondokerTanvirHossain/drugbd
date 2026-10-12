#!/usr/bin/env bash
# Database schema lock (see docs/design/database.md).
# Fails if a locked migration was edited, removed or renamed, if a migration exists that is not in the lock
# file, or if two migrations share a version number. Applied migrations are immutable: change the schema only by
# adding a new V<n>__name.sql AND its checksum line to db/migrations.lock in the same, reviewed PR.
set -euo pipefail
cd "$(dirname "$0")"
LOCK=migrations.lock
DIR=migrations
fail=0

if command -v sha256sum >/dev/null 2>&1; then sum() { sha256sum "$1" | cut -d' ' -f1; }
else sum() { shasum -a 256 "$1" | cut -d' ' -f1; }; fi

[ -f "$LOCK" ] || { echo "missing db/$LOCK" >&2; exit 1; }

while read -r expected file; do
  [ -z "${expected:-}" ] && continue
  case "$expected" in \#*) continue;; esac
  if [ ! -f "$DIR/$file" ]; then echo "LOCKED MIGRATION MISSING: $file (locked migrations must never be removed or renamed)" >&2; fail=1; continue; fi
  actual=$(sum "$DIR/$file")
  if [ "$actual" != "$expected" ]; then echo "LOCKED MIGRATION CHANGED: $file (add a new migration instead of editing an applied one)" >&2; fail=1; fi
done < "$LOCK"

for f in "$DIR"/V*.sql; do
  name=$(basename "$f")
  grep -q "  $name\$" "$LOCK" || { echo "MIGRATION NOT IN LOCK FILE: $name (add its checksum line to db/$LOCK in the same PR)" >&2; fail=1; }
done

dups=$(ls "$DIR"/V*.sql | sed -E 's#.*/V([0-9]+)__.*#\1#' | sort | uniq -d)
[ -z "$dups" ] || { echo "DUPLICATE MIGRATION VERSION(S): $dups" >&2; fail=1; }

[ "$fail" -eq 0 ] && echo "schema lock OK: $(grep -cv '^#' "$LOCK") locked migrations unchanged"
exit "$fail"
