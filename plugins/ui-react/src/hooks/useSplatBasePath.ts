import { useLocation, useParams } from 'react-router-dom';

/**
 * Returns the base path of a component mounted at a splat route (e.g. a page
 * mounted at `/flux/*` or a section at `/agent-platform/muster/*`): the current
 * pathname with the matched `*` remainder removed.
 *
 * Works by path *segment* count rather than string length: `location.pathname`
 * stays percent-encoded while `useParams()['*']` is decoded, so comparing
 * lengths would break on encoded characters — but the `/` separator count is
 * unaffected. Must be called from within the routed subtree so `useParams` sees
 * the splat.
 */
export function useSplatBasePath(): string {
  const { pathname } = useLocation();
  const params = useParams();
  const splatSegments = (params['*'] ?? '').split('/').filter(Boolean).length;
  const segments = pathname.split('/').filter(Boolean);
  return `/${segments
    .slice(0, Math.max(0, segments.length - splatSegments))
    .join('/')}`;
}
