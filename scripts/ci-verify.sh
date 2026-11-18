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
# Containers: the job runs on CIRCLE_NODE_TOTAL containers at once
# (`parallelism` in .circleci/custom.yml), each running this step with its
# own CIRCLE_NODE_INDEX. Each container runs its shard of the tests, jest's
# own `--shard`, which cuts the suite by a hash of each file's path: the same
# file lands on the same container on every run, and the shards are within a
# few percent of each other in time. The two single-container phases are
# spread: tsc and the lint run on the last container, the build (the
# generated step after this one) on container 0. Every other container ends
# its job here, green, with `circleci-agent step halt`, because the generated
# steps that follow (Build, save_cache, persist_to_workspace) must run on one
# container only: CircleCI refuses to attach a workspace that two containers
# persisted the same file into. With one container (parallelism 1, or a run
# outside CircleCI) this script does everything, as before.
#
# Memory: each container has 16 GiB, shared with its Postgres service
# container. When jest (4 workers), tsc and the lint ran at once they peaked at
# 11.4 GiB of anonymous memory (#3045). Now jest's workers peak alone, and tsc
# alone afterwards. JEST_MAX_WORKERS and BACKSTAGE_CLI_CONCURRENCY are set in
# .circleci/custom.yml.
#
# Both phases run even when the first fails, so one run reports every failure.
# The last lines of the log are the inputs for tuning the two variables: each
# phase's duration and peak anonymous memory, and the cgroup's OOM events.
# (memory.peak is no use: the page cache fills it up to the limit.)
set -u

cgroup=/sys/fs/cgroup
peak_file=$(mktemp)
sampler=""

# Samples the cgroup's anonymous memory every 2 s into $peak_file, keeping the
# maximum. A no-op outside the Docker executor (no cgroup v2 memory.stat).
sample_start() {
  [ -r "$cgroup/memory.stat" ] || return 0
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
}

# Stops the sampler and prints the phase's peak. $1: the phase's name.
sample_stop() {
  [ -n "$sampler" ] || return 0
  kill "$sampler" 2>/dev/null
  wait "$sampler" 2>/dev/null
  sampler=""
  echo "ci:verify: $1 peak anonymous memory $(( $(cat "$peak_file") / 1048576 )) MiB (sampled every 2 s)"
}

total=${CIRCLE_NODE_TOTAL:-1}
index=${CIRCLE_NODE_INDEX:-0}
shard_arg=""
if [ "$total" -gt 1 ]; then
  shard_arg="--shard=$((index + 1))/$total"
fi
# The last container runs tsc and the lint; with one container that is this one.
run_phase2=0
if [ "$index" -eq $((total - 1)) ]; then
  run_phase2=1
fi
echo "ci:verify: container $index of $total${shard_arg:+ (tests $shard_arg)}"

yarn run ci:patches || exit $?

sample_start
phase1_start=$(date +%s)
yarn run ci:test ${shard_arg:+"$shard_arg"}
test_status=$?
phase1_end=$(date +%s)
sample_stop "tests:"

phase2_status=0
if [ "$run_phase2" -eq 1 ]; then
  sample_start
  concurrently --group --timings --names tsc,lint -c blue,magenta \
    "yarn run tsc --noEmit" \
    "yarn run ci:lint"
  phase2_status=$?
  phase2_end=$(date +%s)
  sample_stop "tsc + lint:"
  echo "ci:verify: tests $((phase1_end - phase1_start)) s, tsc + lint $((phase2_end - phase1_end)) s"
else
  echo "ci:verify: tests $((phase1_end - phase1_start)) s; tsc + lint run on container $((total - 1))"
fi
if [ -r "$cgroup/memory.events" ]; then
  echo "ci:verify: cgroup memory events: $(tr '\n' ' ' < "$cgroup/memory.events")"
fi
rm -f "$peak_file"

if [ "$test_status" -ne 0 ] || [ "$phase2_status" -ne 0 ]; then
  exit 1
fi

# Green, and not container 0: end this container's job before the generated
# Build, save_cache and persist_to_workspace steps, which container 0 runs.
if [ "$index" -ne 0 ]; then
  if command -v circleci-agent > /dev/null 2>&1; then
    echo "ci:verify: container $index is done; halting before the build and persist steps"
    circleci-agent step halt
  elif command -v circleci > /dev/null 2>&1; then
    echo "ci:verify: container $index is done; halting before the build and persist steps"
    circleci step halt
  else
    echo "ci:verify: no circleci-agent to halt container $index; it would persist a second copy of the build output" >&2
    exit 1
  fi
fi
exit 0
