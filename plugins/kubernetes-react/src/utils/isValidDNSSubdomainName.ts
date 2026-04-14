const DNS_SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9.\-]{0,251}[a-z0-9])?$/;

/**
 * Validates that a name conforms to RFC 1123 DNS subdomain rules,
 * as required by Kubernetes for resource names like ConfigMaps and Secrets.
 *
 * Rules:
 * - At most 253 characters
 * - Only lowercase alphanumeric characters, '-' or '.'
 * - Must start and end with an alphanumeric character
 *
 * @see https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#dns-subdomain-names
 */
export function isValidDNSSubdomainName(name: string): boolean {
  return DNS_SUBDOMAIN_REGEX.test(name);
}
