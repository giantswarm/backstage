import { useApi } from '@backstage/frontend-plugin-api';
import { Alert, Flex, Text } from '@backstage/ui';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../../apis';
import { authStatusQueryKey, needsSignIn, ServerSignIn } from '../../shared';

/**
 * Names the connectors a workflow's steps call that wait for the person's
 * sign-in, each with its Sign in: muster refuses a run while a tool it needs
 * is unavailable to the caller. Muster's per-user `auth://status`, read once
 * per installation and shared with every sign-in affordance, so a completed
 * sign-in drops the connector from the list. Nothing when every connector the
 * workflow needs is signed in to.
 *
 * Only for an installation with per-user muster sessions: without one the
 * Run it tab explains that no run is possible, and no sign-in is either.
 */
export function WorkflowAuthNotice({
  connectors,
  installation,
}: {
  /** The connectors the workflow's steps call, by MCPServer name. */
  connectors: string[];
  installation?: string;
}) {
  const musterApi = useApi(musterApiRef);

  const { data } = useQuery({
    queryKey: authStatusQueryKey(installation),
    queryFn: () => musterApi.getAuthStatus(installation),
    enabled: Boolean(installation) && connectors.length > 0,
    // As the sign-in affordances read it: re-read on return from the IdP's
    // tab, and an unreadable status is an answer, not a retry.
    refetchOnWindowFocus: true,
    retry: false,
  });

  const waiting = (data?.servers ?? [])
    .filter(status => connectors.includes(status.name) && needsSignIn(status))
    .map(status => status.name);
  if (!installation || waiting.length === 0) {
    return null;
  }

  return (
    <Alert
      status="warning"
      title={
        waiting.length === 1
          ? 'Sign in to a connector first'
          : `Sign in to ${waiting.length} connectors first`
      }
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            {waiting.length === 1
              ? 'This workflow calls a connector you are not signed in to, and muster refuses the run until you are.'
              : 'This workflow calls connectors you are not signed in to, and muster refuses the run until you are.'}
          </Text>
          {waiting.map(connector => (
            <ServerSignIn
              key={connector}
              noun="connector"
              serverName={connector}
              installation={installation}
              showName
            />
          ))}
        </Flex>
      }
    />
  );
}
