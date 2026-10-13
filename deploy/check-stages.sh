#!/usr/bin/env bash
# Validates the optional `stages` input of the load-dgda workflow (spec §8.3): empty (all four stages), or a
# comma-separated subset of dgda,substances,clinical,ddinter with no spaces. Prints nothing and exits 0 when valid.
set -euo pipefail
stages="${1-}"
[ -z "$stages" ] && exit 0
case "$stages" in
  *[!a-z,]*|,*|*,|*,,*) echo "stages must be comma-separated stage names with no spaces, got '$stages'" >&2; exit 1;;
esac
IFS=, read -r -a parts <<< "$stages"
for s in "${parts[@]}"; do
  case "$s" in
    dgda|substances|clinical|ddinter) ;;
    *) echo "unknown stage '$s'; choose from dgda,substances,clinical,ddinter" >&2; exit 1;;
  esac
done
