{{/*
Common labels
*/}}
{{- define "labels.common" -}}
app: {{ include "name" . | quote }}
{{ include "labels.selector" . }}
application.giantswarm.io/branch: {{ .Values.project.branch | quote }}
application.giantswarm.io/commit: {{ .Values.project.commit | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service | quote }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
application.giantswarm.io/team: {{ index .Chart.Annotations "io.giantswarm.application.team" | quote }}
helm.sh/chart: {{ include "chart" . | quote }}
{{- end }}

{{- define "labels.backstage" }}
{{- if (.Values.backstageDiscovery).kubernetesId }}
backstage.io/kubernetes-id: {{ .Values.backstageDiscovery.kubernetesId }}
{{- end }}
{{- end }}

{{/*
Default BackendTrafficPolicy spec for the Gateway API route.

Envoy Gateway's default route timeout of 15 s spans the whole response,
streaming included. The Agent Platform turn stream and the AI Chat stream run
for as long as the model works, so the request timeout and the stream duration
cap are off, the idle timeout is long, and TCP keepalive keeps the connection
from being dropped in between events. A user-supplied
route.backendTrafficPolicy.spec replaces this wholesale.
*/}}
{{- define "route.backendTrafficPolicy.defaultSpec" -}}
tcpKeepalive:
  idleTime: 60s
  interval: 30s
  probes: 3
timeout:
  http:
    connectionIdleTimeout: 1h
    maxStreamDuration: 0s
    requestTimeout: 0s
  tcp:
    connectTimeout: 10s
{{- end }}

{{/*
Resource env vars shared by the OTLP trace export and the Prometheus metrics
export: the pod's identity, fed into OTEL_RESOURCE_ATTRIBUTES so both signals
carry the same k8s.pod.name/k8s.namespace.name/k8s.node.name/service.version.
Rendered once for whichever of the two is on. Takes the root context.
*/}}
{{- define "backstage.otelResourceEnv" -}}
- name: OTEL_POD_NAME
  valueFrom:
    fieldRef:
      fieldPath: metadata.name
- name: OTEL_POD_NAMESPACE
  valueFrom:
    fieldRef:
      fieldPath: metadata.namespace
- name: OTEL_NODE_NAME
  valueFrom:
    fieldRef:
      fieldPath: spec.nodeName
- name: OTEL_RESOURCE_ATTRIBUTES
  value: {{ printf "k8s.pod.name=$(OTEL_POD_NAME),k8s.namespace.name=$(OTEL_POD_NAMESPACE),k8s.node.name=$(OTEL_NODE_NAME),service.version=%s%s" .Chart.AppVersion (ternary (printf ",%s" .Values.observability.otel.resourceAttributes) "" (ne .Values.observability.otel.resourceAttributes "")) | quote }}
{{- end }}

{{- /*
backstage.base64 renders a value for a Secret's `data` and fails the render,
naming the value, when it is not base64: Kubernetes would otherwise reject the
Secret with "illegal base64 data at input byte N", which names neither.
Called with (list "<values path>" <value>).
*/}}
{{- define "backstage.base64" -}}
{{- $path := index . 0 -}}
{{- $value := toString (index . 1) -}}
{{- $compact := regexReplaceAll "\\s" $value "" -}}
{{- if or (not (regexMatch "^[A-Za-z0-9+/]*={0,2}$" $compact)) (ne (mod (len $compact) 4) 0) -}}
{{- fail (printf "%s must be base64-encoded: it goes into the Secret's data as is (encode it with `base64 -w0`)" $path) -}}
{{- end -}}
{{- $value -}}
{{- end }}

{{/*
Pod scheduling constraints: renders the `nodeSelector` and `tolerations` fields,
merging the `architecture` shorthand into the explicit values for both.

Giant Swarm arm64 node pools carry a `kubernetes.io/arch=arm64:NoSchedule`
taint, so a pod bound to arm64 needs the node selector *and* the matching
toleration: with only the selector it stays Pending, with only the toleration
it may be scheduled onto any pool.

The toleration is therefore derived from the *effective* `kubernetes.io/arch`
selector, whichever of the two values set it, so pinning through `nodeSelector`
alone is as safe as pinning through `architecture`. It is skipped when an
explicit toleration already covers that taint, matching on the fields that
decide coverage rather than on the whole dict.

A `nodeSelector` that sets `kubernetes.io/arch` to something other than
`architecture` is a contradiction rather than a preference to arbitrate, so it
fails the render instead of silently discarding one of the two.
Emits nothing when unset, so rendered output is unchanged for existing users.
*/}}
{{- define "backstage.podScheduling" -}}
{{- $nodeSelector := deepCopy (.Values.nodeSelector | default dict) -}}
{{- $tolerations := .Values.tolerations | default list -}}
{{- with .Values.architecture -}}
{{- if and (hasKey $nodeSelector "kubernetes.io/arch") (ne (index $nodeSelector "kubernetes.io/arch") .) -}}
{{- fail (printf "architecture=%s conflicts with nodeSelector.%q=%s; set only one" . "kubernetes.io/arch" (index $nodeSelector "kubernetes.io/arch")) -}}
{{- end -}}
{{- $nodeSelector = merge (dict "kubernetes.io/arch" .) $nodeSelector -}}
{{- end -}}
{{- if eq (index $nodeSelector "kubernetes.io/arch" | default "") "arm64" -}}
{{- $tolerated := false -}}
{{- range $tolerations -}}
{{- if and (eq (.key | default "") "kubernetes.io/arch") (has (.effect | default "") (list "" "NoSchedule")) -}}
{{- if or (eq (.operator | default "Equal") "Exists") (eq (.value | default "") "arm64") -}}
{{- $tolerated = true -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- if not $tolerated -}}
{{- $tolerations = concat $tolerations (list (dict "key" "kubernetes.io/arch" "operator" "Equal" "value" "arm64" "effect" "NoSchedule")) -}}
{{- end -}}
{{- end -}}
{{- $scheduling := dict -}}
{{- if $nodeSelector -}}{{- $_ := set $scheduling "nodeSelector" $nodeSelector -}}{{- end -}}
{{- if $tolerations -}}{{- $_ := set $scheduling "tolerations" $tolerations -}}{{- end -}}
{{- with $scheduling }}{{ toYaml . }}{{ end -}}
{{- end -}}

{{/*
The most backend pods that hold database connections at once: the replicas
plus the rolling update's surge (Kubernetes' default 25 %, rounded up; none
under Recreate), plus every old pod still terminating, which the Deployment
controller no longer counts and which keeps its connections until it exits.
Takes the root context.
*/}}
{{- define "backstage.maxPods" -}}
{{- $replicas := int .Values.replicas -}}
{{- $strategy := .Values.strategy | default dict -}}
{{- $surge := 0 -}}
{{- if ne (toString ($strategy.type | default "RollingUpdate")) "Recreate" -}}
{{- $rollingUpdate := $strategy.rollingUpdate | default dict -}}
{{- $maxSurge := "25%" -}}
{{- if hasKey $rollingUpdate "maxSurge" -}}
{{- $maxSurge = toString $rollingUpdate.maxSurge -}}
{{- end -}}
{{- if hasSuffix "%" $maxSurge -}}
{{- $surge = div (add (mul $replicas (trimSuffix "%" $maxSurge | int)) 99) 100 -}}
{{- else -}}
{{- $surge = int $maxSurge -}}
{{- end -}}
{{- end -}}
{{- add (mul $replicas 2) $surge -}}
{{- end }}

{{/*
The most database connections one backend pod holds: every plugin's pool
(`pool.max`, or the plugin's entry in `pool.plugins`), plus the events
plugin's LISTEN connection and the one connection at a time that ensures a
plugin's schema, both outside the pools. Takes the root context.
*/}}
{{- define "backstage.databaseConnectionsPerPod" -}}
{{- $pool := .Values.database.postgresql.pool -}}
{{- $sized := 0 -}}
{{- range $plugin, $max := $pool.plugins -}}
{{- $sized = add $sized (int $max) -}}
{{- end -}}
{{- $others := max 0 (sub (int $pool.pluginsWithDatabase) (len $pool.plugins)) -}}
{{- add (mul $others (int $pool.max)) $sized 2 -}}
{{- end }}

{{/*
Fails the render when the backend pods of a rollout can hold more
connections than the CNPG cluster admits for the app role. Takes the root
context.
*/}}
{{- define "backstage.validateDatabaseBudget" -}}
{{- $pg := .Values.database.postgresql -}}
{{- $maxPods := include "backstage.maxPods" . | int -}}
{{- $perPod := include "backstage.databaseConnectionsPerPod" . | int -}}
{{- $available := sub (int $pg.maxConnections) (int $pg.superuserReservedConnections) -}}
{{- $needed := mul $maxPods $perPod -}}
{{- if gt $needed $available -}}
{{- fail (printf "database.postgresql: %d backend pods during a rollout (2 × replicas %d, terminating ones included, plus the surge) × %d connections each (%d plugins with database.postgresql.pool.max %d or their database.postgresql.pool.plugins entry, plus 2) = %d, more than maxConnections %d less superuserReservedConnections %d = %d: raise database.postgresql.maxConnections (and the CNPG instance's memory with it), or lower the pools, replicas or strategy.rollingUpdate.maxSurge" $maxPods (int .Values.replicas) $perPod (int $pg.pool.pluginsWithDatabase) (int $pg.pool.max) $needed (int $pg.maxConnections) (int $pg.superuserReservedConnections) $available) -}}
{{- end -}}
{{- end }}
