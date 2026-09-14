import { Alert, ButtonLink, Flex, Text } from '@backstage/ui';

import type { CommitAgentResult } from '../../lib/agentManager';

/**
 * What agent-manager's `mode: commit` answered (giantswarm/agent-manager#24):
 * the pull request it opened as the person, the connect step when it has no
 * grant to open one yet, or its acknowledgement. Shared by every write that
 * offers Commit — create, edit and delete.
 */
export function CommitOutcome({ result }: { result: CommitAgentResult }) {
  if (result.pullRequestUrl) {
    return (
      <Alert
        status="success"
        title="Pull request opened"
        description={
          <ButtonLink
            href={result.pullRequestUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
            size="small"
          >
            Open the pull request ↗
          </ButtonLink>
        }
      />
    );
  }
  if (result.status === 'auth_required') {
    return (
      <Alert
        status="warning"
        title="Connect the repository first"
        description={
          <Flex direction="column" gap="2">
            <Text variant="body-small">
              {result.message ??
                'agent-manager has no grant to open pull requests as you yet.'}
            </Text>
            {result.authUrl && (
              <ButtonLink
                href={result.authUrl}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                size="small"
              >
                Connect ↗
              </ButtonLink>
            )}
          </Flex>
        }
      />
    );
  }
  return (
    <Alert
      status="info"
      title="Commit requested"
      description={result.message ?? 'agent-manager accepted the request.'}
    />
  );
}
