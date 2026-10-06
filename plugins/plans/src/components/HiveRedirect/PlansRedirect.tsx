import { Navigate, useLocation, useParams } from 'react-router-dom';
import { Progress } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { usePullEpicItemId } from '../../hooks/useEpic';
import { epicRouteRef, rootRouteRef } from '../../routes';
import { HiveRedirect } from './HiveRedirect';

/** `/plans/pr/:n`: to its epic's Plan tab, or the plan's own page. */
function PullRedirect(props: { pullNumber: number }) {
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search);
  const repo = params.get('repo') ?? undefined;
  const epicLink = useRouteRef(epicRouteRef);
  const plansLink = useRouteRef(rootRouteRef);
  const itemId = usePullEpicItemId(props.pullNumber, repo);
  if (itemId === undefined) {
    return <Progress />;
  }
  if (itemId && epicLink) {
    params.set('pr', String(props.pullNumber));
    return (
      <Navigate
        to={`${epicLink({ id: itemId })}/plan?${params}${hash}`}
        replace
      />
    );
  }
  return (
    <Navigate
      to={`${plansLink?.() ?? ''}/pr/${props.pullNumber}${search}${hash}`}
      replace
    />
  );
}

/**
 * The old Plans page's links: a plan PR opens on its epic's Plan tab
 * (`/hive/epics/:id/plan?pr=n`), a plan without an epic on its own page
 * (`/hive/plans/pr/n`); the list goes to Hive's plans.
 */
export function PlansRedirect() {
  const splat = useParams()['*'] ?? '';
  const pull = splat.match(/^pr\/(\d+)/)?.[1];
  if (pull) {
    return <PullRedirect pullNumber={Number(pull)} />;
  }
  return <HiveRedirect routeRef={rootRouteRef} />;
}
