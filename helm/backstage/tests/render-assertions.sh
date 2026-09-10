#!/usr/bin/env bash
# Assert the legs of the CNPG network policy survive an edit of the chart.
#
# A missing leg does not fail a render, a lint or a schema check: it fails at
# runtime on a default-deny cluster, silently. So assert on the rendered policy.
set -euo pipefail

chart_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "${work_dir}"' EXIT

failed=0

# The chart depends on the bitnami `common` library chart, which templates/
# calls. helm refuses to render with it absent, and charts/ is gitignored.
if [ ! -d "${chart_dir}/charts" ]; then
  helm dependency build "${chart_dir}" >"${work_dir}/deps.log" 2>&1 || {
    echo "FAIL: helm dependency build"
    cat "${work_dir}/deps.log"
    exit 1
  }
fi

render() {
  local name=$1
  shift
  if ! helm template test "${chart_dir}" "$@" >"${work_dir}/${name}.yaml" 2>"${work_dir}/${name}.err"; then
    echo "FAIL: ${name}: helm template failed"
    cat "${work_dir}/${name}.err"
    exit 1
  fi
}

expect() {
  local name=$1 pattern=$2
  if ! grep -q -- "${pattern}" "${work_dir}/${name}.yaml"; then
    echo "FAIL: ${name}: the render does not contain ${pattern}"
    failed=1
  fi
}

refute() {
  local name=$1 pattern=$2
  if grep -q -- "${pattern}" "${work_dir}/${name}.yaml"; then
    echo "FAIL: ${name}: the render contains ${pattern}"
    failed=1
  fi
}

echo "--> cilium flavor: DNS, operator status and metrics legs"
render cilium --set database.engine=postgresql
expect cilium 'kind: CiliumNetworkPolicy'
expect cilium 'k8s-app: kube-dns'
expect cilium 'k8s-app: coredns'
expect cilium 'k8s-app: k8s-dns-node-cache'
expect cilium 'port: "53"'
expect cilium 'port: "1053"'
expect cilium 'port: "8000"'
expect cilium 'port: "9187"'
expect cilium 'io.kubernetes.pod.namespace: cnpg-system'
expect cilium 'port: "5432"'

echo "--> kubernetes flavor: the same legs, no CiliumNetworkPolicy"
render kubernetes --set database.engine=postgresql --set networkPolicy.flavor=kubernetes
refute kubernetes 'kind: CiliumNetworkPolicy'
expect kubernetes 'kind: NetworkPolicy'
expect kubernetes 'values: \[kube-dns, coredns, k8s-dns-node-cache\]'
expect kubernetes 'port: 53'
expect kubernetes 'port: 1053'
expect kubernetes 'port: 8000'
expect kubernetes 'port: 9187'
expect kubernetes 'kubernetes.io/metadata.name: cnpg-system'
expect kubernetes 'port: 5432'

echo "--> networkPolicy.enabled=false: no policy of either kind"
render disabled --set database.engine=postgresql --set networkPolicy.enabled=false
refute disabled 'kind: CiliumNetworkPolicy'
refute disabled 'kind: NetworkPolicy'

echo "--> sqlite engine: no policy of either kind"
render sqlite
refute sqlite 'kind: CiliumNetworkPolicy'
refute sqlite 'kind: NetworkPolicy'

if [ "${failed}" -ne 0 ]; then
  exit 1
fi
echo "ok: every policy leg renders"
