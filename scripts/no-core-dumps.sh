#!/usr/bin/env bash
#
# Runs a command with core dumps disabled. A node process that crashes during
# a local run (tsc out of heap, a Playwright worker) otherwise leaves a
# multi-gigabyte core.<pid> in the checkout. Yarn's script shell has no
# `ulimit`, hence this wrapper.
ulimit -c 0
exec "$@"
