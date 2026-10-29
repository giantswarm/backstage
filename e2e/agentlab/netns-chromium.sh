#!/usr/bin/env bash
# Chromium in a network namespace of its own, for the agentlab suite.
#
# Chromium aborts every in-flight request with net::ERR_NETWORK_CHANGED when
# any address on the host changes — a docker or kind container starting on the
# same machine is enough — and has no switch to stop watching. In its own
# namespace it sees only pasta's interface, which never changes; pasta carries
# its traffic to the host, loopback ports included (`-T auto`), so the lab's
# edge on 127.0.0.1 and the kind network stay reachable.
#
# Playwright talks to the browser over fds 3 and 4, which pasta closes in a
# command it starts. So unshare starts the browser (and keeps the fds), pasta
# joins its namespace by PID, and the browser runs once pasta has configured
# the namespace. playwright.config.ts sets AGENTLAB_E2E_BROWSER to the real
# executable and passes Playwright's arguments through.
set -euo pipefail

browser="${AGENTLAB_E2E_BROWSER:?AGENTLAB_E2E_BROWSER names the Chromium executable}"

dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
mkfifo "$dir/ready"

# The kernel gives pasta's interface an IPv6 link-local address that stays
# tentative for about a second (duplicate address detection); its completion is
# the namespace's one address change, so the browser starts after it.
# shellcheck disable=SC2016 # expanded by the inner shell
unshare --user --map-current-user --net -- sh -c '
  read -r _ <"$1" && shift
  for _ in $(seq 100); do
    [ -z "$(ip -6 addr show tentative)" ] && break
    sleep 0.1
  done
  exec "$@"
' sh "$dir/ready" "$browser" "$@" &
child=$!
# The browser holds Playwright's pipe now; ours would keep it open after the
# browser is gone.
exec 3>&- 4>&-

# unshare is started, not yet unshared: until its namespaces differ from ours,
# pasta would try to join our own and fail ("Couldn't enter user namespace").
own="$(readlink /proc/$$/ns/net)"
for _ in $(seq 100); do
  [ "$(readlink "/proc/$child/ns/net" 2>/dev/null || echo "$own")" != "$own" ] && break
  sleep 0.05
done

# pasta configures the namespace before it detaches, and quits when the
# namespace goes away. IPv4 only: the lab is reached over IPv4, and no IPv6
# address the host gains or loses is copied in.
if ! pasta --quiet --config-net -4 -t none -u none -T auto -U auto "$child"; then
  echo "netns-chromium: pasta could not connect the browser's namespace" >&2
  kill "$child" 2>/dev/null || true
  exit 1
fi
echo >"$dir/ready"

wait "$child"
