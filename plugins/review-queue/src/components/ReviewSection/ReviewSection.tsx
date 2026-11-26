import { useState } from 'react';
import {
  Accordion,
  AccordionPanel,
  AccordionTrigger,
  Alert,
  Button,
  Flex,
  Skeleton,
  Switch,
  Text,
  type SortDescriptor,
} from '@backstage/ui';
import { ExternalLink } from '@giantswarm/backstage-plugin-ui-react';

import type { ReviewsClient } from '../../apis/ReviewsClient';
import { usePrStates } from '../../hooks/usePrStates';
import type { ReviewSection as Section } from '../../hooks/useReviewSections';
import {
  GithubNotConnectedError,
  GithubRateLimitError,
  githubSearchUrl,
} from '../../lib/github';
import { SlackPostDialog } from '../SlackPostDialog';
import { PrTable } from '../PrTable';

/** What an empty section says, in its header. */
const EMPTY_LINE: Record<Section['kind'], string> = {
  waiting: 'Nothing waiting on you',
  mine: 'None of your PRs waits for a review',
  reviewed: 'No open PR you reviewed',
  team: 'Nothing waiting on this team',
};

/** `12`, or `100 of 143` when GitHub counts more than one page. */
export function countLabel(shown: number, total: number): string {
  return total > shown ? `${shown} of ${total}` : String(shown);
}

export type ReviewSectionProps = {
  section: Section;
  client: ReviewsClient | undefined;
  isExpanded: boolean;
  requestedOf?: Map<string, string[]>;
  /** For a section that reads state on request: whether it was asked. */
  statusOn: boolean;
  onStatusChange: (on: boolean) => void;
  sort: SortDescriptor;
  onSortChange: (sort: SortDescriptor) => void;
  /**
   * For "My PRs awaiting review": tick rows and post one Slack message about
   * them, to this channel unless the person picks another.
   */
  slackPost?: { defaultChannel: string };
};

/**
 * One collapsible section: its count in the header, its PRs in the panel.
 * The panel's body mounts only while the section is open, so a collapsed
 * section reads no PR state.
 */
export function ReviewSection(props: ReviewSectionProps) {
  const { section, isExpanded } = props;
  // The ticked PRs outlive a collapse of the section.
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const shown = section.rows?.length ?? 0;
  let summary: React.ReactNode = <Skeleton width={32} height={16} />;
  if (section.rows) {
    summary =
      shown === 0 ? (
        <Text variant="body-small" color="secondary">
          {EMPTY_LINE[section.kind]}
        </Text>
      ) : (
        <Text variant="body-medium" color="secondary">
          {countLabel(shown, section.total ?? shown)}
        </Text>
      );
  } else if (section.error) {
    summary = (
      <Text variant="body-small" color="secondary">
        Not read
      </Text>
    );
  }
  return (
    <Accordion id={section.key}>
      <AccordionTrigger level={3}>
        <Flex gap="3" align="center">
          <span>{section.title}</span>
          {summary}
        </Flex>
      </AccordionTrigger>
      <AccordionPanel>
        {isExpanded ? (
          <ReviewSectionBody
            {...props}
            ticked={ticked}
            onTickedChange={setTicked}
          />
        ) : null}
      </AccordionPanel>
    </Accordion>
  );
}

function ReviewSectionBody({
  section,
  client,
  requestedOf,
  statusOn,
  onStatusChange,
  sort,
  onSortChange,
  slackPost,
  ticked,
  onTickedChange: setTicked,
}: ReviewSectionProps & {
  ticked: Set<string>;
  onTickedChange: (ticked: Set<string>) => void;
}) {
  const rows = section.rows ?? [];
  const showState = section.eagerState || statusOn;
  const states = usePrStates(client, rows, showState);
  const [isSlackPostOpen, setIsSlackPostOpen] = useState(false);
  // Only rows the section still lists count as ticked.
  const tickedRows = rows.filter(row => ticked.has(row.id));

  // Not connected and rate-limited are the tab's to say, once.
  if (
    section.error &&
    !(section.error instanceof GithubNotConnectedError) &&
    !(section.error instanceof GithubRateLimitError)
  ) {
    return (
      <Alert
        status="danger"
        title="GitHub did not answer this search"
        description={section.error.message}
      />
    );
  }
  const total = section.total ?? 0;
  return (
    <Flex direction="column" gap="3">
      {!section.eagerState && (
        <Switch
          label="Show status"
          isSelected={statusOn}
          onChange={onStatusChange}
        />
      )}
      {slackPost && rows.length > 0 && client && (
        <Flex align="center" gap="3">
          <Button
            variant="secondary"
            size="small"
            isDisabled={tickedRows.length === 0}
            onPress={() => setIsSlackPostOpen(true)}
          >
            Post to Slack
          </Button>
          <Text variant="body-small" color="secondary">
            {tickedRows.length === 0
              ? 'Tick PRs to post one message about them to a channel.'
              : `${tickedRows.length} ticked`}
          </Text>
        </Flex>
      )}
      {rows.length > 0 && (
        <PrTable
          rows={rows}
          requestedOf={section.kind === 'waiting' ? requestedOf : undefined}
          states={showState ? states : undefined}
          sort={sort}
          onSortChange={onSortChange}
          selection={
            slackPost ? { selected: ticked, onChange: setTicked } : undefined
          }
        />
      )}
      {slackPost && client && (
        <SlackPostDialog
          installation={client.installation}
          isOpen={isSlackPostOpen}
          onOpenChange={setIsSlackPostOpen}
          rows={tickedRows}
          states={
            new Map(tickedRows.map(row => [row.id, states.get(row.id)?.state]))
          }
          defaultChannel={slackPost.defaultChannel}
          onSent={() => setTicked(new Set())}
        />
      )}
      {total > rows.length && (
        <Text variant="body-small">
          <ExternalLink href={githubSearchUrl(section.query)} display="inline">
            {`${total - rows.length} more on GitHub`}
          </ExternalLink>
        </Text>
      )}
    </Flex>
  );
}
