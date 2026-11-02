#!/usr/bin/env bash
#
# The CI correctness gate, run by the node-build job's Verify step (see
# .circleci/workflows.yml): tsc, the lint and jest in one pass, in parallel.
# jest streams live; tsc and lint output is held back and printed after it, so
# their errors sit at the end of the log that CircleCI keeps (its tail, ~400 KB).
#
# The timings table concurrently prints at the end, and the cgroup peak-memory
# line after it, are the inputs for tuning JEST_MAX_WORKERS and
# BACKSTAGE_CLI_CONCURRENCY in .circleci/custom.yml: the job has 16 GiB and
# shares it with the Postgres service container.
set -u

yarn run ci:patches || exit $?

concurrently --group --timings --names test,tsc,lint -c green,blue,magenta \
  "yarn run test:all" \
  "yarn run tsc --noEmit" \
  "yarn run ci:lint"
status=$?

for f in /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory/memory.max_usage_in_bytes; do
  if [ -r "$f" ]; then
    echo "cgroup peak memory: $(( $(cat "$f") / 1048576 )) MiB ($f)"
    break
  fi
done

exit $status
