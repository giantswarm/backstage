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
