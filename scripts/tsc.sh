#!/usr/bin/env bash
#
# Runs tsc with the heap the repo-wide type check needs, without core dumps.
# V8's default heap limit (about 2 GiB) is too small: tsc aborts before it
# reports anything. Every package.json script that type-checks the repo runs
# through here, so the heap size is defined only here. Run it through yarn
# (`yarn tsc`), which puts the repo's tsc on PATH.
#
# The caller's NODE_OPTIONS are kept and come last, so an explicit
# `NODE_OPTIONS=--max-old-space-size=8192 yarn tsc` overrides the default.
export NODE_OPTIONS="--max-old-space-size=6144${NODE_OPTIONS:+ $NODE_OPTIONS}"
exec "$(dirname "$0")/no-core-dumps.sh" tsc "$@"
