#!/usr/bin/env bash
#
# Fails when the deployment page's copy of the edit template's written ranges
# differs from the fixture the template tests in giantswarm/backstage-catalogs
# run against (on its main branch, which Backstage loads the template from).
# The unit tests check templateRange against the copy, so together they fail
# CI when either side changes its ranges alone. JSON is compared by content,
# so formatting is free on both sides.
#
# Usage: scripts/check-written-ranges-fixture.sh [<upstream fixture URL>]
set -euo pipefail

copy="plugins/gs/src/components/deployments/utils/__fixtures__/app-deployment-written-ranges.json"
url="${1:-https://raw.githubusercontent.com/giantswarm/backstage-catalogs/main/test/fixtures/app-deployment-written-ranges.json}"

cd "$(dirname "$0")/.."
upstream="$(curl --fail --silent --show-error --location --retry 3 "$url")"

if diff -u --label "$copy" --label "$url" \
  <(jq --sort-keys . "$copy") <(jq --sort-keys . <<<"$upstream"); then
  echo "The written ranges fixture copy matches $url."
else
  echo "::error file=$copy::The written ranges fixture differs from $url: copy it over and update templateRange in getAutoUpgradeSettings.ts until the unit tests pass." >&2
  exit 1
fi
