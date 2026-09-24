import { Fragment } from 'react';
import { Alert, Button, Flex, Link, Text } from '@backstage/ui';

import type { BotPrRow } from '../../lib/marge';

export type LostAnswerAlertProps = {
  /** The teams whose answer never arrived. */
  teams: string[];
  /** The lost calls were a preview, so nothing changed. */
  isDryRun: boolean;
  /** A preview's way forward: the lost teams' calls again, and only theirs. */
  onPreviewAgain: () => void;
  /** The calls of `onPreviewAgain` are in flight. */
  isPreviewingAgain: boolean;
  /** What the apply asked marge to do, in the past tense: `approved and merged`. */
  asked: string;
  /** The PRs the lost apply asked marge to act on. */
  prs: Pick<BotPrRow, 'ref' | 'url'>[];
};

/**
 * The connection closed before marge's answer reached the page, for some
 * teams of a run. It is not a refusal, and it says so: a preview changed
 * nothing and runs again at a click, while an apply's outcome is unknown,
 * because marge may have acted on every PR and may still be at it. The page
 * reads the queue again after an apply; the evidence comment on each PR is
 * the record of what marge did to it.
 */
export function LostAnswerAlert({
  teams,
  isDryRun,
  onPreviewAgain,
  isPreviewingAgain,
  asked,
  prs,
}: LostAnswerAlertProps) {
  const title = `The connection dropped before marge answered for ${teams.join(
    ', ',
  )}`;
  if (isDryRun) {
    return (
      <Alert
        status="warning"
        icon
        title={title}
        description="It was only a preview, so nothing changed."
        customActions={
          <Button
            size="small"
            variant="secondary"
            isPending={isPreviewingAgain}
            onPress={onPreviewAgain}
          >
            Preview again
          </Button>
        }
      />
    );
  }
  return (
    <Alert
      status="warning"
      icon
      title={title}
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            The outcome is unknown: marge may already have {asked} some of these
            PRs or all of them, and may still be at it. The page reads the queue
            again to show where each PR stands; press Refresh in a minute if one
            looks unchanged.
          </Text>
          {prs.length > 0 ? (
            <Text variant="body-small">
              Each PR&apos;s evidence comment on GitHub says what marge did to
              it:{' '}
              {prs.map((pr, index) => (
                <Fragment key={pr.ref}>
                  {index > 0 ? ', ' : null}
                  <Link
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="body-small"
                  >
                    {pr.ref}
                  </Link>
                </Fragment>
              ))}
            </Text>
          ) : null}
        </Flex>
      }
    />
  );
}
