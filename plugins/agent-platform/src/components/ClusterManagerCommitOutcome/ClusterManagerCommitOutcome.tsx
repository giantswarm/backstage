import type { ReactNode } from 'react';
import { Alert, ButtonLink, Flex, Text } from '@backstage/ui';

import type { ClusterManagerCommit } from '../../lib/clusterManager';

/**
 * What cluster-manager's `mode: commit` answered (`commit`): the pull request
 * it opened as the person in the repository owning the organization, and the
 * live steps the merge alone does not do — with `liveStep`, the action that
 * runs them once the pull request is merged. Shared by the node-pool and the
 * cluster dialogs.
 */
export function ClusterManagerCommitOutcome({
  commit,
  liveStep,
}: {
  commit: ClusterManagerCommit;
  /** The button that runs `liveSteps` after the merge, where the dialog offers one. */
  liveStep?: ReactNode;
}) {
  const liveSteps = commit.liveSteps ?? [];
  return (
    <Alert
      status={commit.pullRequest ? 'success' : 'info'}
      data-testid="commit-outcome"
      title={
        commit.pullRequest
          ? `Pull request${commit.number ? ` #${commit.number}` : ''} opened${
              commit.author ? ` as ${commit.author}` : ''
            }`
          : 'Nothing to commit: the repository already says so'
      }
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small" style={{ overflowWrap: 'anywhere' }}>
            {commit.repository}, {commit.directory} on {commit.base}.
            {commit.kustomization &&
              ` Flux Kustomization ${commit.kustomization} lands it after the merge${
                commit.prune ? '' : ', without pruning'
              }.`}
          </Text>
          {commit.pullRequest && (
            <div>
              <ButtonLink
                href={commit.pullRequest}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                size="small"
              >
                Open the pull request ↗
              </ButtonLink>
            </div>
          )}
          {liveSteps.length > 0 && (
            <Flex direction="column" gap="1" data-testid="live-steps">
              <Text variant="body-small">
                After the merge, the installation still needs:
              </Text>
              {liveSteps.map(step => (
                <Text key={step} variant="body-small" color="secondary">
                  {step}
                </Text>
              ))}
              {liveStep && <div>{liveStep}</div>}
            </Flex>
          )}
        </Flex>
      }
    />
  );
}
