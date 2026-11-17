import { Alert, Flex, Text } from '@backstage/ui';
import { ExternalButtonLink } from '@giantswarm/backstage-plugin-ui-react';

import type { OrganizationCommit } from '../../lib/organizations';

/**
 * The fields of agent-manager's `commit` answer the outcome reads; a delete's
 * ({@link OrganizationCommit}) and a content write's both have them.
 */
export type PullRequestCommit = Partial<
  Pick<
    OrganizationCommit,
    'repository' | 'base' | 'pullRequest' | 'number' | 'author' | 'review'
  >
>;

/**
 * The pull request an organization write in mode commit opened: its number,
 * who it is opened as, the repository and branch it goes to, what happens
 * once it merges, who reviews it and the link to it. Without a pull request
 * git already says what the write asked for.
 */
export function PullRequestOutcome({
  commit,
  next,
  unchanged,
  testId,
}: {
  commit: PullRequestCommit;
  /** What the merge does, as a sentence. */
  next: string;
  /** Why no pull request was opened: git already says so. */
  unchanged: string;
  testId?: string;
}) {
  if (!commit.pullRequest) {
    return (
      <Alert status="info" title="Nothing to commit" description={unchanged} />
    );
  }
  return (
    <Alert
      status="success"
      data-testid={testId}
      title={`Pull request${commit.number ? ` #${commit.number}` : ''} opened${
        commit.author ? ` as ${commit.author}` : ''
      }`}
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small" style={{ overflowWrap: 'anywhere' }}>
            {commit.repository
              ? `${commit.repository}${commit.base ? ` on ${commit.base}` : ''}. `
              : ''}
            {next}
          </Text>
          {commit.review && (
            <Text variant="body-small">Review: {commit.review}.</Text>
          )}
          <div>
            <ExternalButtonLink
              href={commit.pullRequest}
              variant="secondary"
              size="small"
            >
              Review pull request
            </ExternalButtonLink>
          </div>
        </Flex>
      }
    />
  );
}
