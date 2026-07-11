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
 *   HTTPRoute (hostname) → parentRef (Gateway, optional listener section)
 *     → Gateway listener (hostname pattern) → cert-manager Certificate
 *
 * The listener is identified by matching the hostname against each of the
 * Gateway's listener hostname patterns; a parentRef `sectionName`, when set,
 * further constrains which listener is considered. (A route without a
 * sectionName attaches to every matching listener.) The final
 * listener→certificate hop relies on cert-manager's
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

  // parentRefs of those routes → candidate Gateways. `parent_section_name` is
  // the listener the route pins to, but it is optional: a route without a
  // sectionName attaches to *every* listener of the Gateway whose hostname
  // matches. So we keep the section only as an extra constraint when present,
  // and otherwise resolve the listener purely by hostname match.
  const candidateParents = parentSamples
    .filter(s => routeKeys.has(`${s.metric.namespace}/${s.metric.name}`))
    .map(s => ({
      gatewayName: s.metric.parent_name,
      gatewayNamespace: s.metric.parent_namespace,
      section: s.metric.parent_section_name || undefined,
    }))
    .filter(p => p.gatewayName && p.gatewayNamespace);

  for (const parent of candidateParents) {
    // Listeners of this Gateway whose hostname pattern matches the hostname,
    // restricted to the pinned section when the parentRef named one.
    const matchingListeners = listenerSamples.filter(
      s =>
        s.metric.name === parent.gatewayName &&
        s.metric.namespace === parent.gatewayNamespace &&
        (parent.section ? s.metric.listener_name === parent.section : true) &&
        hostnameMatchesListener(hostname, s.metric.hostname),
    );

    for (const listener of matchingListeners) {
      const listenerName = listener.metric.listener_name;

      // Listener → Certificate (cert-manager gateway-shim naming convention).
      const certName = gatewayListenerCertName(
        parent.gatewayName,
        listenerName,
      );
      const certNamespace = parent.gatewayNamespace;

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

      // No cert signal for this listener — keep trying the route's other
      // matching listeners/parents rather than giving up.
      if (!expiration && readySeries.length === 0) continue;

      const activeReady = readySeries.find(s => s.value?.[1] === '1');
      const readyCondition = activeReady?.metric.condition as
        'True' | 'False' | 'Unknown' | undefined;

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
  }

  return undefined;
}
