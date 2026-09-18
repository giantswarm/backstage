/**
 * Hostname of a URL, lower-cased, or `undefined` when the value is not a URL.
 * Used to compare endpoints regardless of scheme, port and path.
 */
export function urlHostname(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Whether a hostname is a Kubernetes Service DNS name (`<svc>.<ns>.svc` or
 * `<svc>.<ns>.svc.<cluster domain>`) — reachable from inside the cluster only.
 */
export function isClusterLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host.endsWith('.svc') || host.includes('.svc.');
}

/**
 * A cluster-local address with the scheme the Service actually speaks. The
 * KServe controller writes cluster-local addresses with the ingress
 * `urlScheme`, so a TLS-terminated install publishes
 * `https://<svc>.<ns>.svc.cluster.local` although the Service itself speaks
 * plain HTTP. A cluster-local host without an explicit port therefore always
 * gets `http`; external hosts and explicit ports are kept as published.
 */
export function clusterLocalServiceUrl(url: string): string {
  const match = /^https:\/\/([^/:?#]+)(\/.*)?$/i.exec(url);
  if (!match) {
    return url;
  }
  const host = match[1];
  return isClusterLocalHostname(host) ? `http://${host}${match[2] ?? ''}` : url;
}
