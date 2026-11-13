import { useMemo } from 'react';
import { useApiHolder } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { NON_PERSISTED_QUERY_META } from '@giantswarm/backstage-plugin-kubernetes-react';
import { musterApiRef } from '../../../apis';
import { connectorLabels } from '../../../lib/connectorName';
import { isPermanentMusterReadError } from '../../../lib/musterPolling';

/**
 * How often a failed read of the names is tried again while a prompt stays
 * open (the inbox's reader stays mounted): as often as the status is re-read.
 */
const RETRY_FAILED_READ_MS = 5 * 60 * 1_000;

/**
 * muster could not list the connectors (`unavailable`): a failed read, not
 * an answer to keep, so the next mount, focus or retry reads again.
 */
class ConnectorNamesUnavailableError extends Error {
  readonly name = 'ConnectorNamesUnavailableError';
}

/**
 * The query of an installation's connector names, shared by every prompt.
 * Outside the `['muster', …]` prefix on purpose: a sign-in reads every query
 * under it again, and a sign-in changes no display name. The person's view
 * all the same (muster lists what they may see), so never persisted
 * (`NON_PERSISTED_QUERY_META`), whichever client holds it.
 */
export function connectorNamesQueryKey(installation: string) {
  return ['muster-connector-names', installation] as const;
}

/**
 * What people call the connectors muster names by server name, as Customize
 * lists them (`connectorLabels`): the display names muster-backend reads from
 * muster as the person (`/servers/names`), so they are there for everyone who
 * sees a sign-in prompt, with or without Kubernetes access to the MCPServer
 * objects. One read per installation, shared by every caller and kept: names
 * hardly change. A server muster did not name, every server while the read
 * is under way or after it failed, keeps its own name.
 *
 * The read is silent, as a reader in the background must be: it never asks
 * for the sign-in. Nothing is read without an installation (an undefined one
 * would name the backend's default installation's connectors), and
 * `enabled: false` skips it: a background reader once the portal session is
 * gone, a caller that knows the names already.
 */
export function useConnectorLabels(
  installation: string | undefined,
  names: readonly string[],
  options: { enabled?: boolean } = {},
): (name: string) => string {
  // Absent from a portal without the muster plugin: every name stays.
  const musterApi = useApiHolder().get(musterApiRef);
  const enabled =
    (options.enabled ?? true) &&
    Boolean(musterApi) &&
    Boolean(installation) &&
    names.length > 0;
  const { data } = useQuery({
    queryKey: connectorNamesQueryKey(installation ?? ''),
    meta: NON_PERSISTED_QUERY_META,
    queryFn: async () => {
      const answer = await musterApi!.listConnectorNames(installation);
      if (answer.unavailable) {
        throw new ConnectorNamesUnavailableError(
          `Muster on ${installation} could not list its connectors`,
        );
      }
      return answer;
    },
    enabled,
    // An answer is kept; a failure is read again on the next mount, on
    // focus and every few minutes, so a short outage does not leave the
    // prompts on technical names for the rest of the tab. Not from a hidden
    // tab, and not after muster refused the person, which asking again does
    // not change.
    staleTime: Infinity,
    refetchOnWindowFocus: query => query.state.status === 'error',
    refetchInterval: query =>
      query.state.status === 'error' &&
      !isPermanentMusterReadError(query.state.error)
        ? RETRY_FAILED_READ_MS
        : false,
    retry: false,
  });
  const sources = data?.servers;
  const key = names.join('\n');
  return useMemo(() => {
    const labels = connectorLabels(key ? key.split('\n') : [], sources ?? []);
    return (name: string) => labels.get(name) ?? name;
  }, [key, sources]);
}

/**
 * What people call one connector: {@link useConnectorLabels} of `name`, the
 * name itself until muster said otherwise.
 */
export function useConnectorLabel(
  installation: string | undefined,
  name: string,
  options: { enabled?: boolean } = {},
): string {
  return useConnectorLabels(installation, [name], options)(name);
}
