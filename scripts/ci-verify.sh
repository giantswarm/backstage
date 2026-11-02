#!/usr/bin/env bash
#
# The CI correctness gate, run by the node-build job's Verify step (see
# .circleci/workflows.yml, which calls `yarn run ci:verify`): the type check,
# the lint and the tests in one pass, in two phases.
#
# Phase 1 runs jest alone, with every CPU and all the memory the job has. Jest
# is the long pole of the step and scales with its workers; tsc does not scale
# at all and the lint only a little, so sharing the job with them for the whole
# step only costs jest workers (measured on #3326: jest 700 s beside tsc 85 s
# and the lint 102 s, so for ten minutes half the CPUs sat idle). Phase 2 runs
# tsc and the lint side by side. Their output is small and comes after jest's,
# so a type or lint error is at the end of the Verify log, within the tail
# CircleCI keeps (about 400 KB).
#
# Memory: the job has 16 GiB, shared with the Postgres service container. When
# jest (4 workers), tsc and the lint ran at once they peaked at 11.4 GiB of
# anonymous memory (#3045). Now jest's workers peak alone, and tsc alone
# afterwards. JEST_MAX_WORKERS and BACKSTAGE_CLI_CONCURRENCY are set in
# .circleci/custom.yml.
#
# Both phases run even when the first fails, so one run reports every failure.
# The last lines of the log are the inputs for tuning the two variables: each
# phase's duration, and the cgroup's peak anonymous memory with its OOM
# events. (memory.peak is no use: the page cache fills it up to the limit.)
set -u

cgroup=/sys/fs/cgroup
peak_file=""
sampler=""
if [ -r "$cgroup/memory.stat" ]; then
  peak_file=$(mktemp)
  echo 0 > "$peak_file"
  (
    peak=0
    while true; do
      anon=$(awk '$1 == "anon" { print $2 }' "$cgroup/memory.stat")
      if [ "${anon:-0}" -gt "$peak" ]; then
        peak=$anon
        echo "$peak" > "$peak_file"
      fi
      sleep 2
    done
  ) &
  sampler=$!
fi

yarn run ci:patches || exit $?

phase1_start=$(date +%s)
yarn run ci:test
test_status=$?
phase1_end=$(date +%s)

concurrently --group --timings --names tsc,lint -c blue,magenta \
  "yarn run tsc --noEmit" \
  "yarn run ci:lint"
phase2_status=$?
phase2_end=$(date +%s)

echo "ci:verify: tests $((phase1_end - phase1_start)) s, tsc + lint $((phase2_end - phase1_end)) s"
if [ -n "$sampler" ]; then
  kill "$sampler" 2>/dev/null
  echo "ci:verify: cgroup peak anonymous memory $(( $(cat "$peak_file") / 1048576 )) MiB, sampled every 2 s"
  echo "ci:verify: cgroup memory events: $(tr '\n' ' ' < "$cgroup/memory.events")"
  rm -f "$peak_file"
fi

[ "$test_status" -eq 0 ] && [ "$phase2_status" -eq 0 ]
