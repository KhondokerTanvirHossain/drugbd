#!/usr/bin/env bash
# Tests for deploy/check-stages.sh (the load-dgda workflow's `stages` input). Run: bash deploy/check-stages.test.sh
set -uo pipefail
cd "$(dirname "$0")"
fail=0
accept() { if ./check-stages.sh "$1" 2>/dev/null; then :; else echo "should accept: '$1'"; fail=1; fi; }
refuse() { if ./check-stages.sh "$1" 2>/dev/null; then echo "should refuse: '$1'"; fail=1; fi; }
accept ""
accept "ddinter"
accept "dgda,substances,clinical,ddinter"
accept "substances,ddinter"
refuse "foo"
refuse "dgda,foo"
refuse "dgda, ddinter"
refuse ",ddinter"
refuse "ddinter,"
refuse "dgda,,ddinter"
refuse "DDINTER"
refuse "ddinter;rm -rf /"
refuse 'ddinter$(id)'
[ "$fail" -eq 0 ] && echo "check-stages OK"
exit "$fail"
