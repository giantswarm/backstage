import { MimirMetricSample } from '../../apis/mimir/types';

export interface HostnameCertInfo {
  /** The resolved cert-manager Certificate resource name. */
  certName: string;
  /** The Certificate's namespace (from the `exported_namespace` label). */
  namespace: string;
  /** The Gateway listener hostname pattern that matched (e.g. `*.example.com`). */
  hostnamePattern?: string;
  /** Current readiness, if a ready-status series was found. */
  ready?: 'True' | 'False' | 'Unknown';
  /** Unix timestamp (seconds) after which the certificate expires. */
  expirationSeconds?: number;
  /** Issuer identity, when available. */
  issuerName?: string;
  issuerKind?: string;
}

/**
 * Gateway API wildcard hostname match. A listener hostname of `*.example.com`
 * matches exactly one extra DNS label (`foo.example.com` but not
 * `a.b.example.com`), per the Gateway API spec. An exact pattern matches only
 * itself. An empty pattern (e.g. an HTTP listener) never matches.
 */
export function hostnameMatchesListener(
  hostname: string,
  pattern: string | undefined,
): boolean {
  if (!pattern) return false;
  if (pattern === hostname) return true;
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // ".example.com"
    if (!hostname.endsWith(suffix)) return false;
    const prefix = hostname.slice(0, hostname.length - suffix.length);
    return prefix.length > 0 && !prefix.includes('.');
  }
  return false;
}

/** cert-manager's gateway-shim auto-generated Certificate name for a listener. */
function gatewayListenerCertName(
  gatewayName: string,
  listenerName: string,
): string {
  return `gateway-${gatewayName}-${listenerName}`;
}

export interface ResolveInputs {
  /** `gatewayapi_httproute_hostname_info` series (workload namespace). */
  hostnameSamples: MimirMetricSample[];
  /** `gatewayapi_httproute_parent_info` series (workload namespace). */
  parentSamples: MimirMetricSample[];
  /** `gatewayapi_gateway_listener_info` series (cluster-wide). */
  listenerSamples: MimirMetricSample[];
  /** `certmanager_certificate_expiration_timestamp_seconds` series (cluster-wide). */
  expirationSamples: MimirMetricSample[];
  /** `certmanager_certificate_ready_status` series (cluster-wide). */
  readySamples: MimirMetricSample[];
}

/**
 * Resolves the serving TLS certificate for a hostname by walking the chain:
 *
 *   HTTPRoute (hostname) → parentRef (Gateway + listener section)
 *     → Gateway listener (hostname pattern) → cert-manager Certificate
 *
 * The route→listener and hostname→listener hops are exact label / wildcard
 * matches. The final listener→certificate hop relies on cert-manager's
 * gateway-shim naming convention (`gateway-<gateway>-<listener>`), so it is
 * best-effort: when no matching Certificate series exists, `undefined` is
 * returned and the caller should render the cert as unknown rather than wrong.
 */
export function resolveHostnameCert(
  hostname: string,
  inputs: ResolveInputs,
): HostnameCertInfo | undefined {
  const {
    hostnameSamples,
    parentSamples,
    listenerSamples,
    expirationSamples,
    readySamples,
  } = inputs;

  // Routes (namespace/name) that expose this hostname.
  const routeKeys = new Set(
    hostnameSamples
      .filter(s => s.metric.hostname === hostname)
      .map(s => `${s.metric.namespace}/${s.metric.name}`),
  );
  if (routeKeys.size === 0) return undefined;

  // parentRefs of those routes → candidate (gateway, listener) sections.
  const candidateListeners = parentSamples
    .filter(s => routeKeys.has(`${s.metric.namespace}/${s.metric.name}`))
    .map(s => ({
      gatewayName: s.metric.parent_name,
      gatewayNamespace: s.metric.parent_namespace,
      listenerName: s.metric.parent_section_name,
    }))
    .filter(l => l.gatewayName && l.listenerName);

  // Pick the listener whose hostname pattern actually matches this hostname.
  for (const candidate of candidateListeners) {
    const listener = listenerSamples.find(
      s =>
        s.metric.name === candidate.gatewayName &&
        s.metric.namespace === candidate.gatewayNamespace &&
        s.metric.listener_name === candidate.listenerName,
    );
    if (!listener) continue;
    if (!hostnameMatchesListener(hostname, listener.metric.hostname)) continue;

    // Listener → Certificate (naming convention).
    const certName = gatewayListenerCertName(
      candidate.gatewayName,
      candidate.listenerName,
    );
    const certNamespace = candidate.gatewayNamespace;

    const expiration = expirationSamples.find(
      s =>
        s.metric.name === certName &&
        s.metric.exported_namespace === certNamespace,
    );

    const readySeries = readySamples.filter(
      s =>
        s.metric.name === certName &&
        s.metric.exported_namespace === certNamespace,
    );
    const activeReady = readySeries.find(s => s.value?.[1] === '1');
    const readyCondition = activeReady?.metric.condition as
      | 'True'
      | 'False'
      | 'Unknown'
      | undefined;

    // Require at least one cert signal, otherwise treat as unresolved.
    if (!expiration && readySeries.length === 0) return undefined;

    const expirationSeconds = expiration?.value?.[1]
      ? Number(expiration.value[1])
      : undefined;

    return {
      certName,
      namespace: certNamespace,
      hostnamePattern: listener.metric.hostname,
      ready: readyCondition,
      expirationSeconds:
        expirationSeconds !== undefined && !isNaN(expirationSeconds)
          ? expirationSeconds
          : undefined,
      issuerName: expiration?.metric.issuer_name,
      issuerKind: expiration?.metric.issuer_kind,
    };
  }

  return undefined;
}
