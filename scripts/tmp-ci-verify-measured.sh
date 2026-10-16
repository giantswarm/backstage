#!/usr/bin/env bash
# TEMPORARY (dropped before merge): samples the job cgroup's anon memory
# while ci:verify's commands run, to size node-build.
set -u
stat=/sys/fs/cgroup/memory.stat
( peak=0; while sleep 1; do a=$(awk '/^anon /{print $2}' "$stat" 2>/dev/null || echo 0); [ "${a:-0}" -gt "$peak" ] && peak=$a && echo "$peak" >| /tmp/anon-peak; done ) &
sampler=$!
yarn run ci:patches && concurrently --names tsc,lint,test -c blue,magenta,green "yarn run tsc --noEmit" "yarn run ci:lint" "yarn run test:all"
rc=$?
kill "$sampler"
echo "diag anon.peak $(cat /tmp/anon-peak 2>/dev/null) cg.peak $(cat /sys/fs/cgroup/memory.peak 2>/dev/null) cg.max $(cat /sys/fs/cgroup/memory.max 2>/dev/null) nproc $(nproc) BACKSTAGE_CLI_CONCURRENCY=${BACKSTAGE_CLI_CONCURRENCY:-} JEST_MAX_WORKERS=${JEST_MAX_WORKERS:-}"
grep -E '^(oom|oom_kill) ' /sys/fs/cgroup/memory.events 2>/dev/null | sed 's/^/diag /'
exit "$rc"
