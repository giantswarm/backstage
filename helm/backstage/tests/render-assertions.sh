#!/usr/bin/env bash
# Assert on rendered manifests where a regression fails no render, lint or
# schema check but does fail at runtime, silently:
#
# * the legs of the CNPG network policy, which a default-deny cluster drops
#   without an event;
# * the BackendTrafficPolicy on the Gateway API route, without which Envoy
#   Gateway's default 15 s route timeout cuts every streamed response;
# * the pod template's checksum over the extraAppConfig entries, without which
#   a changed app-config fragment never reaches the running portal;
# * the OTLP variables, without which the backend starts and exports no trace;
# * the base64 guard on the `data` Secrets, without which a plaintext value
#   renders and the install fails with "illegal base64 data at input byte N".
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

# The value of a pod template annotation, empty when it does not render.
annotation() {
  local name=$1 key=$2
  sed -n "s|^ *${key}: \"\(.*\)\"$|\1|p" "${work_dir}/${name}.yaml"
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

echo "--> route.enabled=true: the streaming-safe BackendTrafficPolicy renders by default"
render route --set route.enabled=true
expect route 'kind: HTTPRoute'
expect route 'kind: BackendTrafficPolicy'
expect route 'requestTimeout: 0s'
expect route 'maxStreamDuration: 0s'
expect route 'connectionIdleTimeout: 1h'
expect route 'connectTimeout: 10s'
expect route 'idleTime: 60s'
expect route 'interval: 30s'
expect route 'probes: 3'

echo "--> route.backendTrafficPolicy.enabled=false: the route renders, the policy does not"
render route-no-policy --set route.enabled=true --set route.backendTrafficPolicy.enabled=false
expect route-no-policy 'kind: HTTPRoute'
refute route-no-policy 'kind: BackendTrafficPolicy'

echo "--> route.backendTrafficPolicy.spec set: the user's spec replaces the default wholesale"
render route-user-spec --set route.enabled=true --set route.backendTrafficPolicy.spec.timeout.http.requestTimeout=10m
expect route-user-spec 'kind: BackendTrafficPolicy'
expect route-user-spec 'requestTimeout: 10m'
refute route-user-spec 'requestTimeout: 0s'
refute route-user-spec 'maxStreamDuration'
refute route-user-spec 'tcpKeepalive'

echo "--> route.enabled=false: no route, no policy"
render route-disabled
refute route-disabled 'kind: HTTPRoute'
refute route-disabled 'kind: BackendTrafficPolicy'

echo "--> extraAppConfig: a changed entry checksum changes the pod template annotation"
fragment=(--set 'backstage.extraAppConfig[0].filename=app-config.fragment.yaml' --set 'backstage.extraAppConfig[0].configMapRef=fragment')
render fragment-a "${fragment[@]}" --set 'backstage.extraAppConfig[0].checksum=sha256:aaaa'
render fragment-a-again "${fragment[@]}" --set 'backstage.extraAppConfig[0].checksum=sha256:aaaa'
render fragment-b "${fragment[@]}" --set 'backstage.extraAppConfig[0].checksum=sha256:bbbb'
checksum_a=$(annotation fragment-a checksum/extra-app-config)
checksum_a_again=$(annotation fragment-a-again checksum/extra-app-config)
checksum_b=$(annotation fragment-b checksum/extra-app-config)
if [ -z "${checksum_a}" ] || [ -z "${checksum_b}" ]; then
  echo "FAIL: fragment: the pod template carries no checksum/extra-app-config annotation"
  failed=1
elif [ "${checksum_a}" != "${checksum_a_again}" ]; then
  echo "FAIL: fragment: the annotation changes between two renders of the same values"
  failed=1
elif [ "${checksum_a}" = "${checksum_b}" ]; then
  echo "FAIL: fragment: the annotation does not change with the entry's checksum"
  failed=1
fi

echo "--> no extraAppConfig: no annotation"
render no-fragment
refute no-fragment 'checksum/extra-app-config'

echo "--> observability.otel.endpoint set: the OTLP variables render"
render otel --set observability.otel.endpoint=http://otlp-gateway.kube-system.svc:4317 --set observability.otel.headers=X-Scope-OrgID=giantswarm
expect otel 'value: "http://otlp-gateway.kube-system.svc:4317"'
expect otel 'value: "grpc"'
expect otel 'value: "X-Scope-OrgID=giantswarm"'
expect otel 'value: "parentbased_traceidratio"'
expect otel 'k8s.pod.name=$(OTEL_POD_NAME)'

echo "--> no observability.otel.endpoint: no OTLP variable"
render no-otel
refute no-otel 'OTEL_'

# A render that must fail, with a message naming the value.
render_fails() {
  local name=$1 message=$2
  shift 2
  if helm template test "${chart_dir}" "$@" >/dev/null 2>"${work_dir}/${name}.err"; then
    echo "FAIL: ${name}: the render succeeds"
    failed=1
  elif ! grep -q -- "${message}" "${work_dir}/${name}.err"; then
    echo "FAIL: ${name}: the error does not say ${message}"
    cat "${work_dir}/${name}.err"
    failed=1
  fi
}

echo "--> base64 values in the data Secrets: rendered as they are"
render base64 --set authSessionSecret=c2Vzc2lvbg== --set sentry.backend.dsn=ZHNu --set dexAuthCredentials.gazelle.clientID=YmFja3N0YWdl --set dexAuthCredentials.gazelle.clientSecret=c2VjcmV0
# Under `data`, not beside it: a key outside `data` leaves the Secret empty and
# still renders, applies and passes a text match.
data_keys() {
  local name=$1 secret=$2
  yq -r "select(.kind == \"Secret\" and .metadata.name == \"${secret}\") | .data // {} | keys | join(\",\")" "${work_dir}/${name}.yaml"
}
secrets_keys=$(data_keys base64 backstage-secrets)
if [ "${secrets_keys}" != "AUTH_SESSION_SECRET,SENTRY_DSN_BACKEND" ]; then
  echo "FAIL: base64: backstage-secrets data holds [${secrets_keys}], want [AUTH_SESSION_SECRET,SENTRY_DSN_BACKEND]"
  failed=1
fi
dex_keys=$(data_keys base64 backstage-dex-auth-credentials-secret)
if [ "${dex_keys}" != "AUTH_DEX_GAZELLE_CLIENT_ID,AUTH_DEX_GAZELLE_CLIENT_SECRET" ]; then
  echo "FAIL: base64: backstage-dex-auth-credentials-secret data holds [${dex_keys}]"
  failed=1
fi

echo "--> plaintext values in the data Secrets: the render fails and names the value"
render_fails plain-scalar 'sentry.app.dsn must be base64-encoded' --set sentry.app.dsn=https://key@o1.ingest.sentry.io/1
render_fails plain-map 'dexAuthCredentials.gazelle.clientID must be base64-encoded' --set dexAuthCredentials.gazelle.clientID=backstage --set dexAuthCredentials.gazelle.clientSecret=c2VjcmV0

if [ "${failed}" -ne 0 ]; then
  exit 1
fi
echo "ok: every assertion holds"
