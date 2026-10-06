import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { rootRouteRef } from '../../routes';

/** An old address, as the redirect sees it: the path under the old page. */
interface OldLocation {
  splat: string;
  search: string;
  hash: string;
}

function query(params: URLSearchParams): string {
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

/**
 * The old magazine's tabs on Hive: `?tab=now|history&window=w` is the front
 * page at that moment (`?when=`), `?tab=knowledge&doc=d` the knowledge
 * reader. Other parameters stay.
 */
export function magazineTarget({ search, hash }: OldLocation): string {
  const params = new URLSearchParams(search);
  const tab = params.get('tab') ?? 'now';
  const historyWindow = params.get('window') ?? 'days';
  params.delete('tab');
  params.delete('window');
  if (tab === 'knowledge') {
    return `knowledge${query(params)}${hash}`;
  }
  params.set('when', tab === 'history' ? historyWindow : 'now');
  return `${query(params)}${hash}`;
}

/**
 * The old Plans page on Hive: the list is the front page's Plans section
 * (`?when=now#plans`), a plan's review opens over it (`?pr=n&repo=…`).
 */
export function plansTarget({ splat, search, hash }: OldLocation): string {
  const params = new URLSearchParams(search);
  const pull = splat.match(/^pr\/(\d+)/);
  if (pull) {
    params.set('pr', pull[1]);
    return `${query(params)}${hash}`;
  }
  params.delete('repo');
  params.set('when', 'now');
  return `${query(params)}#plans`;
}

/**
 * An old page's address, sent on to its place in Hive with its parameters,
 * so every shared link keeps working.
 */
export function HiveRedirect(props: {
  /** The address in Hive, relative to `/hive`, for the old one. */
  target: (location: OldLocation) => string;
}) {
  const hive = useRouteRef(rootRouteRef);
  const splat = useParams()['*'] ?? '';
  const { search, hash } = useLocation();
  const base = hive?.();
  if (!base) {
    return null;
  }
  const to = props.target({ splat, search, hash });
  const separator = to && !/^[?#]/.test(to) ? '/' : '';
  return <Navigate to={`${base}${separator}${to}`} replace />;
}
