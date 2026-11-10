#!/usr/bin/env bash
# Generate a unique changeset filename in the format: adjective-noun-verb
set -euo pipefail

CHANGESET_DIR=".changeset"

adjectives=(ancient bright calm deep eager fair gentle happy icy jolly kind light mild noble odd plain quick rare soft tall unique vast warm young zesty bold clean dark empty fresh grand humble ideal keen loud merry neat open proud quiet rich sharp sweet tidy vivid wise witty brave clever)

nouns=(apple beach cloud eagle flame grape heart island jewel kite lemon maple night ocean pearl river stone tiger violet water bamboo canyon desert ember forest garden harbor jungle kingdom lagoon meadow nebula oasis planet rainbow sunset thunder valley willow bridge castle dolphin falcon glacier horizon lantern mirror orchard phoenix)

verbs=(bloom climb dance explore float glide hover ignite jump kindle launch melt nestle orbit ripple shine travel unfold venture wander adapt blend create drift emerge flow grow heal inspire journey learn mingle observe persist reflect soar thrive twist unite whisper)

while true; do
  adj=${adjectives[$((RANDOM % ${#adjectives[@]}))]}
  noun=${nouns[$((RANDOM % ${#nouns[@]}))]}
  verb=${verbs[$((RANDOM % ${#verbs[@]}))]}
  name="${adj}-${noun}-${verb}"

  if [ ! -f "${CHANGESET_DIR}/${name}.md" ]; then
    echo "${CHANGESET_DIR}/${name}.md"
    exit 0
  fi
done
