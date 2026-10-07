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
# * `APP_CONFIG_app_releaseVersion`, without which the portal starts and knows
#   no release: the pod never loads the image's app-config.yaml;
# * the metrics port, env and network policy leg, without which the backend
#   starts with metrics on but nothing can scrape it;
# * the pg config with the postgresql engine, without which the backend
#   silently runs on in-memory sqlite beside an idle CNPG cluster;
# * the base64 guard on the `data` Secrets, without which a plaintext value
#   renders and the install fails with "illegal base64 data at input byte N".
# * the arm64 node selector with the toleration for the pool's
#   `kubernetes.io/arch=arm64:NoSchedule` taint, without which the pod stays
#   Pending, or lands on any pool when only the toleration renders;
# * the startupProbe, without which a backend that never finishes starting
#   (its database unreachable) stays unready and is never restarted.
# * the server shutdown delay, without which every rollout answers the
#   requests the gateway still routes to the stopping pod with Envoy's
#   "upstream connect error or disconnect/reset before headers".
# * the image's bundled config files ahead of the chart's own --config flags,
#   without which an install that sets only appConfig exits at start with
#   "Missing required config value";
# * the CNPG PodMonitor gated on its toggle and on the cluster serving the
#   kind, without which an install on a cluster without the Prometheus
#   Operator CRDs fails and rolls back the database with it.
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

echo "--> the release version reaches the app config: the chart's appVersion"
app_version=$(sed -n "s/^appVersion: *['\"]*\([^'\"]*\)['\"]*$/\1/p" "${chart_dir}/Chart.yaml")
if [ -z "${app_version}" ] ||
  ! grep -A1 -- 'name: APP_CONFIG_app_releaseVersion' "${work_dir}/no-fragment.yaml" |
  grep -q -- "value: \"${app_version}\""; then
  echo "FAIL: release-version: APP_CONFIG_app_releaseVersion is not \"${app_version}\""
  failed=1
fi

echo "--> the backend keeps serving while the gateway drops a stopping pod"
if ! grep -A1 -- 'name: APP_CONFIG_backend_lifecycle_serverShutdownDelay' "${work_dir}/no-fragment.yaml" |
  grep -q -- 'value: "10s"'; then
  echo "FAIL: shutdown-delay: APP_CONFIG_backend_lifecycle_serverShutdownDelay is not \"10s\""
  failed=1
fi
render no-shutdown-delay --set backstage.serverShutdownDelay=
refute no-shutdown-delay 'APP_CONFIG_backend_lifecycle_serverShutdownDelay'

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

echo "--> observability.metrics.enabled: the Prometheus exporter env, ports and ServiceMonitor render, and no policy selects the backend pod"
render metrics --set observability.metrics.enabled=true --set serviceMonitor.enabled=true
expect metrics 'value: prometheus'
expect metrics 'OTEL_EXPORTER_PROMETHEUS_HOST'
expect metrics 'value: "0.0.0.0"'
expect metrics 'OTEL_EXPORTER_PROMETHEUS_PORT'
expect metrics 'value: "9464"'
expect metrics 'name: metrics'
expect metrics 'containerPort: 9464'
refute metrics 'backstage-metrics'
expect metrics 'kind: ServiceMonitor'
expect metrics 'port: metrics'
refute metrics 'OTEL_TRACES_SAMPLER'

echo "--> observability.metrics.enabled=false (default): no metrics env, port or ServiceMonitor"
render no-metrics
refute no-metrics 'OTEL_METRICS_EXPORTER'
refute no-metrics 'OTEL_EXPORTER_PROMETHEUS'
refute no-metrics 'name: metrics'
refute no-metrics 'kind: ServiceMonitor'

echo "--> observability.otel.endpoint and observability.metrics.enabled together: traces and metrics both render, resource env once"
render otel-and-metrics --set observability.otel.endpoint=http://otlp-gateway.kube-system.svc:4317 --set observability.metrics.enabled=true
expect otel-and-metrics 'value: "http://otlp-gateway.kube-system.svc:4317"'
expect otel-and-metrics 'value: prometheus'
resource_env_count=$(grep -c 'name: OTEL_RESOURCE_ATTRIBUTES' "${work_dir}/otel-and-metrics.yaml")
if [ "${resource_env_count}" -ne 1 ]; then
  echo "FAIL: otel-and-metrics: OTEL_RESOURCE_ATTRIBUTES rendered ${resource_env_count} times, want 1"
  failed=1
fi

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

# The container's args, one per line, without the YAML list markup.
container_args() {
  local name=$1
  yq -r 'select(.kind == "Deployment") | .spec.template.spec.containers[0].args[]' "${work_dir}/${name}.yaml"
}

echo "--> database.engine=postgresql: the pg config renders, mounts and loads before the operator's config"
render postgresql --set database.engine=postgresql --set-string 'backstage.appConfig=app: portal' --set 'backstage.extraAppConfig[0].filename=app-config.fragment.yaml' --set 'backstage.extraAppConfig[0].configMapRef=fragment'
database_config=$(yq -r 'select(.kind == "ConfigMap" and .metadata.name == "backstage-database-config") | .data["app-config-database.yaml"]' "${work_dir}/postgresql.yaml")
for want in 'client: pg' 'pluginDivisionMode: schema' 'host: ${POSTGRES_HOST}' 'port: ${POSTGRES_PORT}' 'user: ${POSTGRES_USER}' 'password: ${POSTGRES_PASSWORD}'; do
  if ! grep -qF -- "${want}" <<<"${database_config}"; then
    echo "FAIL: postgresql: app-config-database.yaml does not contain ${want}"
    failed=1
  fi
done
expect postgresql 'mountPath: "/app/app-config-database.yaml"'
# Later --config files win: the operator's appConfig and extraAppConfig come
# after the chart's pg block, so a database block of theirs still applies.
# The image's bundled files come first, the base layer the chart's flags
# override.
config_order=$(container_args postgresql | grep -v -- '^--config$' | paste -sd, -)
if [ "${config_order}" != "app-config.yaml,app-config.production.yaml,app-config-database.yaml,app-config-from-configmap.yaml,app-config.fragment.yaml" ]; then
  echo "FAIL: postgresql: the --config order is [${config_order}], want the bundled files, then the database config first"
  failed=1
fi

echo "--> backstage.args: the image's bundled config files by default, an explicit list replaces them"
render args-default --set-string 'backstage.appConfig=app: portal'
got=$(container_args args-default | paste -sd, -)
if [ "${got}" != "--config,app-config.yaml,--config,app-config.production.yaml,--config,app-config-from-configmap.yaml" ]; then
  echo "FAIL: args-default: the args are [${got}], want the bundled files, then the appConfig"
  failed=1
fi
render args-explicit --set-string 'backstage.appConfig=app: portal' --set 'backstage.args={--config,app-config.yaml}'
got=$(container_args args-explicit | paste -sd, -)
if [ "${got}" != "--config,app-config.yaml,--config,app-config-from-configmap.yaml" ]; then
  echo "FAIL: args-explicit: the args are [${got}], want the explicit list, then the appConfig"
  failed=1
fi
# The managed installations pin `args: []` to keep the bundled files out.
printf 'backstage:\n  args: []\n' >"${work_dir}/args-empty-values.yaml"
render args-empty --set-string 'backstage.appConfig=app: portal' --values "${work_dir}/args-empty-values.yaml"
got=$(container_args args-empty | paste -sd, -)
if [ "${got}" != "--config,app-config-from-configmap.yaml" ]; then
  echo "FAIL: args-empty: the args are [${got}], want the appConfig alone"
  failed=1
fi

echo "--> CNPG PodMonitor: rendered with the tenant label when on and the cluster serves the kind, absent otherwise"
render podmonitor-default --set database.engine=postgresql --api-versions monitoring.coreos.com/v1/PodMonitor
expect podmonitor-default 'kind: PodMonitor'
expect podmonitor-default 'observability.giantswarm.io/tenant: giantswarm'
expect podmonitor-default 'kind: Cluster'
render podmonitor-off --set database.engine=postgresql --set database.postgresql.podMonitor.enabled=false --api-versions monitoring.coreos.com/v1/PodMonitor
refute podmonitor-off 'kind: PodMonitor'
expect podmonitor-off 'kind: Cluster'
render podmonitor-no-crd --set database.engine=postgresql
refute podmonitor-no-crd 'kind: PodMonitor'
expect podmonitor-no-crd 'kind: Cluster'

echo "--> database.engine=sqlite (default): no pg config, mount or flag"
refute sqlite 'backstage-database-config'
refute sqlite 'app-config-database.yaml'

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

# The pod's nodeSelector and tolerations as `[<nodeSelector>,<tolerations>]`
# in compact JSON, `null` for a field that does not render.
pod_scheduling() {
  local name=$1 field values=()
  for field in nodeSelector tolerations; do
    values+=("$(yq -o=json -I=0 "select(.kind == \"Deployment\") | .spec.template.spec.${field}" "${work_dir}/${name}.yaml")")
  done
  echo "[${values[0]},${values[1]}]"
}

expect_scheduling() {
  local name=$1 want=$2 got
  got=$(pod_scheduling "${name}")
  if [ "${got}" != "${want}" ]; then
    echo "FAIL: ${name}: nodeSelector and tolerations are ${got}, want ${want}"
    failed=1
  fi
}

arm64_toleration='{"effect":"NoSchedule","key":"kubernetes.io/arch","operator":"Equal","value":"arm64"}'

echo "--> architecture: no scheduling fields by default, both the selector and the taint toleration for arm64"
render arch-default
expect_scheduling arch-default '[null,null]'
render arch-arm64 --set architecture=arm64
expect_scheduling arch-arm64 "[{\"kubernetes.io/arch\":\"arm64\"},[${arm64_toleration}]]"
render arch-amd64 --set architecture=amd64
expect_scheduling arch-amd64 '[{"kubernetes.io/arch":"amd64"},null]'
render arch-selector-only --set-string 'nodeSelector.kubernetes\.io/arch=arm64'
expect_scheduling arch-selector-only "[{\"kubernetes.io/arch\":\"arm64\"},[${arm64_toleration}]]"
render arch-merged --set architecture=arm64 --set-string 'nodeSelector.topology\.kubernetes\.io/zone=eu-central-1a' --set 'tolerations[0].key=dedicated' --set 'tolerations[0].operator=Exists'
expect_scheduling arch-merged "[{\"kubernetes.io/arch\":\"arm64\",\"topology.kubernetes.io/zone\":\"eu-central-1a\"},[{\"key\":\"dedicated\",\"operator\":\"Exists\"},${arm64_toleration}]]"
render arch-covered --set architecture=arm64 --set 'tolerations[0].key=kubernetes\.io/arch' --set 'tolerations[0].operator=Exists'
expect_scheduling arch-covered '[{"kubernetes.io/arch":"arm64"},[{"key":"kubernetes.io/arch","operator":"Exists"}]]'
render arch-covered-equal --set architecture=arm64 --set 'tolerations[0].key=kubernetes\.io/arch' --set 'tolerations[0].value=arm64' --set 'tolerations[0].effect=NoSchedule'
expect_scheduling arch-covered-equal '[{"kubernetes.io/arch":"arm64"},[{"effect":"NoSchedule","key":"kubernetes.io/arch","value":"arm64"}]]'
render arch-noexecute --set architecture=arm64 --set 'tolerations[0].key=kubernetes\.io/arch' --set 'tolerations[0].operator=Exists' --set 'tolerations[0].effect=NoExecute'
expect_scheduling arch-noexecute "[{\"kubernetes.io/arch\":\"arm64\"},[{\"effect\":\"NoExecute\",\"key\":\"kubernetes.io/arch\",\"operator\":\"Exists\"},${arm64_toleration}]]"
render_fails arch-conflict 'architecture=arm64 conflicts with nodeSelector' --set architecture=arm64 --set-string 'nodeSelector.kubernetes\.io/arch=amd64'

# The container's startupProbe in compact JSON, `null` when it does not render.
startup_probe() {
  yq -o=json -I=0 'select(.kind == "Deployment") | .spec.template.spec.containers[0].startupProbe' "${work_dir}/$1.yaml"
}

echo "--> startupProbe: on the readiness endpoint, ten minutes by default, timing from probes.startup"
render startup-default
got=$(startup_probe startup-default)
want='{"httpGet":{"path":"/.backstage/health/v1/readiness","port":7007},"periodSeconds":10,"timeoutSeconds":5,"failureThreshold":60}'
if [ "${got}" != "${want}" ]; then
  echo "FAIL: startup-default: startupProbe is ${got}, want ${want}"
  failed=1
fi
render startup-tuned --set probes.startup.periodSeconds=5 --set probes.startup.timeoutSeconds=2 --set probes.startup.failureThreshold=120
got=$(startup_probe startup-tuned)
want='{"httpGet":{"path":"/.backstage/health/v1/readiness","port":7007},"periodSeconds":5,"timeoutSeconds":2,"failureThreshold":120}'
if [ "${got}" != "${want}" ]; then
  echo "FAIL: startup-tuned: startupProbe is ${got}, want ${want}"
  failed=1
fi

if [ "${failed}" -ne 0 ]; then
  exit 1
fi
echo "ok: every assertion holds"
