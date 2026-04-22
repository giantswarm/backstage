# backstage

![Version: 0.122.3](https://img.shields.io/badge/Version-0.122.3-informational?style=flat-square) ![AppVersion: 0.122.3](https://img.shields.io/badge/AppVersion-0.122.3-informational?style=flat-square)

Backstage app provided by Giant Swarm

**Homepage:** <https://github.com/giantswarm/backstage>

## Requirements

| Repository | Name | Version |
|------------|------|---------|
| oci://registry-1.docker.io/bitnamicharts | common | 2.38.0 |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| name | string | `"backstage"` | Name used for all Kubernetes resources (Deployment, Service, etc.) |
| backstageDiscovery | object | `{"kubernetesId":"backstage"}` | Backstage service discovery settings |
| backstageDiscovery.kubernetesId | string | `"backstage"` | Value to set for the backstage.io/kubernetes-id label on all resources, used for entity discovery in Backstage |
| userID | int | `1000` | User ID for the pod security context (runAsUser) |
| groupID | int | `1000` | Group ID for the pod security context (runAsGroup) |
| image | object | `{"name":"backstage","repository":"giantswarm/backstage"}` | Container image settings |
| image.name | string | `"backstage"` | Container name in the pod spec |
| image.repository | string | `"giantswarm/backstage"` | Image repository path (prepended with registry.domain to form the full image reference) |
| port | int | `7007` | Container port for the Backstage backend, also used for the Service and route backend |
| registry | object | `{"domain":"gsoci.azurecr.io"}` | Container image registry settings |
| registry.domain | string | `"gsoci.azurecr.io"` | Container image registry domain prepended to image.repository |
| resources | object | `{"limits":{"cpu":"500m","memory":"600Mi"},"requests":{"cpu":"20m","memory":"250Mi"},"verticalPodAutoscaler":{"enabled":true}}` | Resource requests, limits, and autoscaler settings for the Backstage container |
| resources.verticalPodAutoscaler | object | `{"enabled":true}` | Vertical Pod Autoscaler settings |
| resources.verticalPodAutoscaler.enabled | bool | `true` | Enable the VerticalPodAutoscaler resource for automatic resource adjustment |
| resources.requests | object | `{"cpu":"20m","memory":"250Mi"}` | CPU and memory resource requests |
| resources.requests.cpu | string | `"20m"` | CPU resource request for the Backstage container |
| resources.requests.memory | string | `"250Mi"` | Memory resource request for the Backstage container |
| resources.limits | object | `{"cpu":"500m","memory":"600Mi"}` | CPU and memory resource limits |
| resources.limits.cpu | string | `"500m"` | CPU resource limit for the Backstage container |
| resources.limits.memory | string | `"600Mi"` | Memory resource limit for the Backstage container |
| authSessionSecret | string | `""` | Secret used for signing authentication sessions (exposed as AUTH_SESSION_SECRET env var) |
| circleci | object | `{"apiToken":""}` | CircleCI integration settings |
| circleci.apiToken | string | `""` | CircleCI API token for pipeline integration (exposed as CIRCLECI_API_TOKEN env var) |
| common | object | `{}` | Bitnami common library chart settings (subchart dependency) |
| dexAuthCredentials | object | `{}` | Dex authentication provider credentials, keyed by provider name. Each entry generates AUTH_DEX_<NAME>_CLIENT_ID and AUTH_DEX_<NAME>_CLIENT_SECRET env vars |
| githubAuthCredentials | object | `{"clientID":"","clientSecret":""}` | GitHub OAuth credentials for user authentication |
| githubAuthCredentials.clientID | string | `""` | GitHub OAuth App client ID (exposed as GITHUB_OAUTH_CLIENT_ID env var) |
| githubAuthCredentials.clientSecret | string | `""` | GitHub OAuth App client secret (exposed as GITHUB_OAUTH_CLIENT_SECRET env var) |
| githubAppCredentials | object | `{"appId":0,"clientId":"","clientSecret":"","privateKey":"","webhookSecret":"","webhookUrl":""}` | GitHub App credentials for repository access and webhooks |
| githubAppCredentials.appId | int | `0` | GitHub App ID |
| githubAppCredentials.webhookUrl | string | `""` | GitHub App webhook URL |
| githubAppCredentials.clientId | string | `""` | GitHub App OAuth client ID |
| githubAppCredentials.clientSecret | string | `""` | GitHub App OAuth client secret |
| githubAppCredentials.webhookSecret | string | `""` | GitHub App webhook secret |
| githubAppCredentials.privateKey | string | `""` | GitHub App private key (PEM format) |
| grafana | object | `{"apiToken":""}` | Grafana integration settings |
| grafana.apiToken | string | `""` | Grafana API token for dashboard integration (exposed as GRAFANA_TOKEN env var) |
| sentry | object | `{"app":{"dsn":""},"backend":{"dsn":""},"reportURI":""}` | Sentry error tracking settings |
| sentry.app | object | `{"dsn":""}` | Sentry settings for the frontend application |
| sentry.app.dsn | string | `""` | Sentry DSN for the frontend app (exposed as SENTRY_DSN_APP env var) |
| sentry.backend | object | `{"dsn":""}` | Sentry settings for the backend service |
| sentry.backend.dsn | string | `""` | Sentry DSN for the backend service (exposed as SENTRY_DSN_BACKEND env var) |
| sentry.reportURI | string | `""` | Sentry CSP report URI (exposed as SENTRY_REPORT_URI env var) |
| telemetrydeck | object | `{"salt":""}` | TelemetryDeck analytics settings |
| telemetrydeck.salt | string | `""` | TelemetryDeck salt for hashing user identifiers (exposed as TELEMETRYDECK_SALT env var) |
| aws | object | `{"accessKeyID":"","secretAccessKey":""}` | AWS credentials for S3 and other AWS service integrations |
| aws.accessKeyID | string | `""` | AWS access key ID (exposed as AWS_ACCESS_KEY_ID env var) |
| aws.secretAccessKey | string | `""` | AWS secret access key (exposed as AWS_SECRET_ACCESS_KEY env var) |
| externalAccess | object | `{"mcpToken":""}` | External access settings for programmatic API access |
| externalAccess.mcpToken | string | `""` | Bearer token for MCP (Model Context Protocol) external access (exposed as EXTERNAL_ACCESS_MCP_TOKEN env var) |
| anthropic | object | `{"apiKey":""}` | Anthropic AI provider settings |
| anthropic.apiKey | string | `""` | Anthropic API key for AI chat features (exposed as ANTHROPIC_API_KEY env var) |
| openai | object | `{"apiKey":""}` | OpenAI provider settings |
| openai.apiKey | string | `""` | OpenAI API key for AI chat features (exposed as OPENAI_API_KEY env var) |
| sharedConfig | object | `{}` | Shared configuration that generates a ConfigMap. Can be referenced in the main app configuration with $include keyword |
| nodeSelector | object | `{}` | Node selector labels to constrain pod scheduling to specific nodes |
| database | object | `{"engine":"sqlite","postgresql":{"clusterNameSuffix":"cnpg","image":"giantswarm/postgresql-cnpg:18.0@sha256:7c998e8352408ff5dbb74bcd945c3ef6578b7185c97aca9b89e4cc9fcbdf4716","storageSize":"5Gi"}}` | Database configuration |
| database.engine | string | `"sqlite"` | Database engine to use |
| database.postgresql | object | `{"clusterNameSuffix":"cnpg","image":"giantswarm/postgresql-cnpg:18.0@sha256:7c998e8352408ff5dbb74bcd945c3ef6578b7185c97aca9b89e4cc9fcbdf4716","storageSize":"5Gi"}` | Settings for the PostgreSQL database (only used when engine is "postgresql") |
| database.postgresql.clusterNameSuffix | string | `"cnpg"` | Suffix appended to the chart name to form the CNPG cluster resource name |
| database.postgresql.storageSize | string | `"5Gi"` | Persistent volume size for the PostgreSQL CNPG cluster |
| database.postgresql.image | string | `"giantswarm/postgresql-cnpg:18.0@sha256:7c998e8352408ff5dbb74bcd945c3ef6578b7185c97aca9b89e4cc9fcbdf4716"` | PostgreSQL container image for the CNPG cluster (registry.domain is prepended) |
| backstage | object | `{"appConfig":{},"args":[],"command":["node","packages/backend"],"extraAppConfig":[],"extraEnvVars":[],"extraEnvVarsCM":[],"extraEnvVarsSecrets":[],"extraVolumeMounts":[],"extraVolumes":[]}` | Backstage application parameters |
| backstage.command | list | `["node","packages/backend"]` | Container command to start the Backstage backend |
| backstage.args | list | `[]` | Additional command arguments passed to the Backstage container |
| backstage.extraAppConfig | list | `[]` | Extra app configuration files to inline into command arguments, each referencing a ConfigMap |
| backstage.appConfig | object | `{}` | Inline Backstage app configuration that generates a ConfigMap automatically. Do not use for sensitive data |
| backstage.extraEnvVars | list | `[]` | Extra environment variables for the Backstage container |
| backstage.extraEnvVarsCM | list | `[]` | Names of existing ConfigMaps to mount as envFrom sources in the Backstage container |
| backstage.extraEnvVarsSecrets | list | `[]` | Names of existing Secrets to mount as envFrom sources in the Backstage container |
| backstage.extraVolumeMounts | list | `[]` | Additional volume mounts for the Backstage container |
| backstage.extraVolumes | list | `[]` | Additional volumes for the Backstage pod |
| route | object | `{"additionalRules":[],"annotations":{},"backendTrafficPolicy":{"annotations":{},"enabled":false,"labels":{},"spec":{}},"filters":[],"hostnames":[],"kind":"HTTPRoute","labels":{},"matches":[{"path":{"type":"PathPrefix","value":"/"}}],"name":"","parentRefs":[],"securityPolicy":{"annotations":{},"authorization":{},"basicAuth":{},"cors":{},"enabled":false,"extAuth":{},"jwt":{},"labels":{},"oidc":{}}}` | Gateway API route configuration |
| route.kind | string | `"HTTPRoute"` | Route resource kind |
| route.name | string | `""` | Route name (defaults to .Values.name) |
| route.annotations | object | `{}` | Annotations applied to the route resource |
| route.labels | object | `{}` | Labels applied to the route resource |
| route.hostnames | list | `[]` | Hostnames for the route (supports Go templating) |
| route.parentRefs | list | `[]` | Parent Gateway references that this route attaches to |
| route.matches | list | `[{"path":{"type":"PathPrefix","value":"/"}}]` | Path matching rules for the route |
| route.filters | list | `[]` | Request/Response filters applied to the route |
| route.additionalRules | list | `[]` | Additional custom routing rules |
| route.securityPolicy | object | `{"annotations":{},"authorization":{},"basicAuth":{},"cors":{},"enabled":false,"extAuth":{},"jwt":{},"labels":{},"oidc":{}}` | Envoy Gateway SecurityPolicy configuration (gateway.envoyproxy.io/v1alpha1) |
| route.securityPolicy.enabled | bool | `false` | Enable the SecurityPolicy resource |
| route.securityPolicy.labels | object | `{}` | Labels applied to the SecurityPolicy resource |
| route.securityPolicy.annotations | object | `{}` | Annotations applied to the SecurityPolicy resource |
| route.securityPolicy.basicAuth | object | `{}` | Basic authentication configuration (reference to htpasswd secret) |
| route.securityPolicy.cors | object | `{}` | CORS (Cross-Origin Resource Sharing) policy configuration |
| route.securityPolicy.jwt | object | `{}` | JWT token validation configuration |
| route.securityPolicy.oidc | object | `{}` | OIDC authentication provider configuration |
| route.securityPolicy.extAuth | object | `{}` | External authorization service configuration |
| route.securityPolicy.authorization | object | `{}` | Authorization rules for request-level access control |
| route.backendTrafficPolicy | object | `{"annotations":{},"enabled":false,"labels":{},"spec":{}}` | Envoy Gateway BackendTrafficPolicy configuration (gateway.envoyproxy.io/v1alpha1) |
| route.backendTrafficPolicy.enabled | bool | `false` | Enable the BackendTrafficPolicy resource |
| route.backendTrafficPolicy.labels | object | `{}` | Labels applied to the BackendTrafficPolicy resource |
| route.backendTrafficPolicy.annotations | object | `{}` | Annotations applied to the BackendTrafficPolicy resource |
| route.backendTrafficPolicy.spec | object | `{}` | BackendTrafficPolicy spec passthrough (timeout, retry, circuitBreaker, etc.); targetRefs is injected automatically |
| ociRegistryCredentials | object | `{}` | Private OCI registry credentials, keyed by registry name. Each entry generates OCI_REGISTRY_<NAME>_USERNAME and OCI_REGISTRY_<NAME>_PASSWORD env vars. Registry hosts are configured in backstage.appConfig |
| pluginKeys | list | `[]` | Plugin signing key pairs, each mounted as files under /app/plugin-keys/<keyId>/ |
