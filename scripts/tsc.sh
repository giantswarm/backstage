#!/usr/bin/env bash
#
# Runs tsc with the heap the repo-wide type check needs, without core dumps.
# V8's default heap limit (about 2 GiB) is too small: tsc aborts before it
# reports anything. The `tsc`, `tsc:full` and `typecheck:storybook` scripts,
# and `ci:verify` through `tsc`, run through here, so the size lives only here.
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=6144"
exec "$(dirname "$0")/no-core-dumps.sh" tsc "$@"
