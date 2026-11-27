import { useMemo } from 'react';
import { useApiHolder } from '@backstage/core-plugin-api';
import { useInstallationScope } from '@giantswarm/backstage-plugin-gs';
import {
  musterApiRef,
  useMusterInstallations,
  useMusterServerAvailability,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { ReviewsClient } from '../apis/ReviewsClient';
import { GITHUB_SERVER } from '../lib/github';

/**
 * The muster plugin's API, or `undefined` when that plugin is not installed
 * in this app. GitHub is reachable only through it, so the tab says so
 * instead of throwing, which `useApi` would on an unbound ref.
 */
export function useMusterPluginApi(): MusterApi | undefined {
  return useApiHolder().get(musterApiRef);
}

export type GithubInstallation = {
  /** The installation whose muster the tab reaches GitHub through. */
  installation: string | undefined;
  /** The name that muster registers the server under, for the sign-in. */
  serverName: string;
  isLoading: boolean;
  /** No reachable muster lists a `github` server. */
  isMissing: boolean;
  /** Why the server lists could not be read, when they could not. */
  error: Error | undefined;
};

/**
 * The one installation whose muster the tab calls GitHub through: the
 * home installation when its muster lists `github`, else the first that
 * does. GitHub answers the same whichever muster asks, so one is enough.
 *
 * A server list that could not be read says nothing about `github`, so it
 * is no answer to act on, as on the Bot PRs page: with no muster listing
 * it, the tab calls GitHub on such an installation (home first) and shows
 * what muster says, most often the person's sign-in. Only musters that
 * answered without `github`, or that run without a per-user sign-in, leave
 * the tab with none. Needs the muster plugin: call it below a check of
 * {@link useMusterPluginApi}.
 */
export function useGithubInstallation(): GithubInstallation {
  const { installations, isLoading: isLoadingInstallations } =
    useMusterInstallations();
  const { home } = useInstallationScope();
  const names = useMemo(
    () => installations.map(info => info.name),
    [installations],
  );
  const availability = useMusterServerAvailability(GITHUB_SERVER, names);
  const homeFirst = (list: string[]) =>
    home !== undefined && list.includes(home) ? home : list[0];
  const installation =
    homeFirst(availability.available) ??
    homeFirst(
      availability.unreachable.filter(
        name => !availability.sharedIdentity.includes(name),
      ),
    );
  const isLoading = isLoadingInstallations || availability.isLoading;
  return {
    installation,
    serverName:
      (installation && availability.registeredNameOf(installation)) ||
      GITHUB_SERVER,
    isLoading,
    isMissing: !isLoading && installation === undefined,
    error: availability.error ?? availability.installationsError,
  };
}

// One client per installation for the page's life, so every section shares
// its limit on concurrent reads.
const clients = new WeakMap<MusterApi, Map<string, ReviewsClient>>();

export function useReviewsClient(
  installation: string | undefined,
): ReviewsClient | undefined {
  const musterApi = useMusterPluginApi();
  return useMemo(() => {
    if (!musterApi || !installation) {
      return undefined;
    }
    let byInstallation = clients.get(musterApi);
    if (!byInstallation) {
      byInstallation = new Map();
      clients.set(musterApi, byInstallation);
    }
    let client = byInstallation.get(installation);
    if (!client) {
      client = new ReviewsClient(musterApi, installation);
      byInstallation.set(installation, client);
    }
    return client;
  }, [musterApi, installation]);
}
