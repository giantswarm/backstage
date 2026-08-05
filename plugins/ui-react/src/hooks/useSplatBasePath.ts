import { useLocation, useParams } from 'react-router-dom';

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    // Malformed escape sequence — compare the raw segment rather than throw.
    return segment;
  }
}

/**
 * Returns the base path of a component mounted at a splat route (e.g. a page
 * mounted at `/flux/*` or a section at `/agent-platform/muster/*`): the current
 * pathname with the matched `*` remainder removed.
 *
 * `location.pathname` stays percent-encoded while `useParams()['*']` arrives
 * decoded, so the two cannot be compared directly — and their `/`-separated parts
 * do not even correspond one-to-one, because a single pathname segment containing
 * `%2F` decodes into two parts of the splat. Counting segments would then strip
 * too many and return a base path *above* the mount point (at the extreme, `/`,
 * which turns a joined href into the protocol-relative `//sub`). So this consumes
 * pathname segments from the end only while their decoded value still matches the
 * tail of the splat, stopping at the first mismatch — erring towards too long a
 * base path rather than too short a one.
 *
 * The result never has a trailing slash, so callers can join with
 * `` `${basePath}/${sub}` ``; for a component mounted at the root (the whole
 * pathname is the splat) that means an empty string.
 *
 * Must be called from within the routed subtree so `useParams` sees the splat.
 */
export function useSplatBasePath(): string {
  const { pathname } = useLocation();
  const params = useParams();

  const segments = pathname.split('/').filter(Boolean);
  let remaining = (params['*'] ?? '').replace(/^\/+|\/+$/g, '');
  let consumed = 0;

  while (remaining.length > 0 && consumed < segments.length) {
    const decoded = safeDecode(segments[segments.length - 1 - consumed]);
    if (!remaining.endsWith(decoded)) {
      break;
    }
    remaining = remaining
      .slice(0, remaining.length - decoded.length)
      .replace(/\/+$/, '');
    consumed += 1;
  }

  const basePath = segments.slice(0, segments.length - consumed).join('/');

  return basePath ? `/${basePath}` : '';
}
