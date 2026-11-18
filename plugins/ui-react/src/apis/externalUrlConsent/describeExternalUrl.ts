import { getDomain } from 'tldts';
import { isWebURL } from '../../utils/webURL';

/** Why an address deserves a second look before it is opened. */
export type ExternalUrlWarning =
  /** A host label is punycode (`xn--`): it may imitate another site's name. */
  | 'punycode'
  /** Plain `http:`, to a host other than this machine. */
  | 'insecure'
  /** A user name or password before the host (`https://github.com@evil.example`). */
  | 'userinfo';

/**
 * An address a server asks the person to open, as the consent dialog shows it.
 * `href` is the WHATWG serialization (an internationalized host in its ASCII,
 * punycode form) and is what gets opened; `before + domain + after === href`.
 */
export type DescribedExternalUrl = {
  href: string;
  hostname: string;
  /**
   * The part of `href` to highlight: the registrable domain by the Public
   * Suffix List (private suffixes included, so `team.github.io`, not
   * `github.io`), or the whole host where there is none (an IP, `localhost`).
   */
  domain: string;
  before: string;
  after: string;
  warnings: ExternalUrlWarning[];
};

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Parses an address for the consent dialog, or returns `undefined` for one
 * that is no absolute http(s) address and must not be opened at all.
 */
export function describeExternalUrl(
  raw: string,
): DescribedExternalUrl | undefined {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return undefined;
  }
  if (!isWebURL(url)) {
    return undefined;
  }

  const { href, hostname, protocol } = url;
  const registrable = getDomain(hostname, { allowPrivateDomains: true });
  // tldts drops a trailing dot (`evil.com.` gives `evil.com`); the highlight
  // must be a suffix of the host as written, or the shown address differs
  // from the opened one.
  const domain =
    registrable && hostname.endsWith(registrable) ? registrable : hostname;
  const authorityStart = protocol.length + 2;
  // Serialized user info percent-encodes its own `@`, so the first one in
  // the authority ends it.
  const hostStart =
    url.username || url.password
      ? href.indexOf('@', authorityStart) + 1
      : authorityStart;
  const domainStart = hostStart + hostname.length - domain.length;

  const warnings: ExternalUrlWarning[] = [];
  if (hostname.split('.').some(label => label.startsWith('xn--'))) {
    warnings.push('punycode');
  }
  if (protocol === 'http:' && !LOOPBACK_HOSTS.has(hostname)) {
    warnings.push('insecure');
  }
  if (url.username || url.password) {
    warnings.push('userinfo');
  }

  return {
    href,
    hostname,
    domain,
    before: href.slice(0, domainStart),
    after: href.slice(domainStart + domain.length),
    warnings,
  };
}
