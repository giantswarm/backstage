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
