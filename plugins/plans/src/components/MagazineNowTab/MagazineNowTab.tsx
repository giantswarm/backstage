import { useState } from 'react';
import { Button, Text } from '@backstage/ui';
import { Progress as LoadingProgress } from '@backstage/core-components';
import { MagazineSource, useMagazineJson } from '../../hooks/useMagazineJson';
import { formatDate } from '../../lib/dates';
import {
  Lane,
  magazineFile,
  MagazineCard,
  Now,
  sortLanes,
  visibleCards,
} from '../../lib/magazine';
import {
  CardGrid,
  MagazineItemCard,
  MagazineSection,
  PlanReviewCard,
  SummaryLines,
} from '../MagazineItemCard';
import { PlansErrorAlert } from '../PlansErrorAlert';

/** Cards with a "show all n" behind the first few. */
function ExpandableCards(props: {
  cards: MagazineCard[];
  empty: string;
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { shown, hidden } = visibleCards(props.cards, expanded);
  if (props.cards.length === 0) {
    return (
      <Text as="p" color="secondary">
        {props.empty}
      </Text>
    );
  }
  return (
    <>
      <CardGrid>
        {shown.map(card => (
          <MagazineItemCard key={card.key} card={card} />
        ))}
      </CardGrid>
      {(hidden > 0 || expanded) && (
        <div style={{ marginTop: 'var(--bui-space-3)' }}>
          <Button
            variant="tertiary"
            size="small"
            aria-expanded={expanded}
            aria-label={
              expanded
                ? `Show fewer in ${props.label}`
                : `Show all ${props.cards.length} in ${props.label}`
            }
            onPress={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show fewer' : `Show all ${props.cards.length}`}
          </Button>
        </div>
      )}
    </>
  );
}

function LaneSection(props: { lane: Lane }) {
  const { lane } = props;
  const more =
    lane.total > lane.cards.length ? ` (${lane.total} in total)` : '';
  return (
    <MagazineSection
      id={`lane-${lane.id}`}
      title={lane.title}
      summary={lane.summary ? `${lane.summary}${more}` : undefined}
    >
      <ExpandableCards
        cards={lane.cards}
        label={lane.title}
        empty="Nothing in this lane right now."
      />
    </MagazineSection>
  );
}

/**
 * What the team works on now: the digest, the four priority lanes, then
 * what needs the reader (plans to review, blockers) and the other teams'
 * upcoming work that touches ours.
 */
export function MagazineNowTab(props: { source: MagazineSource }) {
  const { data, isLoading, error } = useMagazineJson<Now>(
    props.source,
    magazineFile('now'),
  );
  if (isLoading) {
    return <LoadingProgress />;
  }
  if (error) {
    return (
      <PlansErrorAlert
        title="Failed to load the magazine"
        error={error as Error}
      />
    );
  }
  if (!data) {
    return null;
  }
  return (
    <>
      <MagazineSection
        id="now-summary"
        title="Now"
        summary={`Updated ${formatDate(data.generatedAt, { time: true }) ?? data.generatedAt}`}
      >
        <SummaryLines lines={data.summary} />
      </MagazineSection>
      {sortLanes(data.lanes).map(lane => (
        <LaneSection key={lane.id} lane={lane} />
      ))}
      <MagazineSection
        id="reviews"
        title="Needs review"
        summary="Plans waiting for their grilling or review, oldest first."
        accent={data.reviews.length > 0}
      >
        {data.reviews.length === 0 ? (
          <Text as="p" color="secondary">
            No plan waits for review.
          </Text>
        ) : (
          <CardGrid>
            {data.reviews.map(plan => (
              <PlanReviewCard key={plan.key} plan={plan} />
            ))}
          </CardGrid>
        )}
      </MagazineSection>
      <MagazineSection
        id="blocked"
        title="Blocked"
        summary="Ongoing work that waits on someone or something."
        accent={data.blocked.length > 0}
      >
        <ExpandableCards
          cards={data.blocked}
          label="Blocked"
          empty="Nothing is blocked."
        />
      </MagazineSection>
      <MagazineSection
        id="upcoming"
        title="Upcoming from other teams"
        summary="Work of other teams that touches our epics."
      >
        <ExpandableCards
          cards={data.upcoming}
          label="Upcoming from other teams"
          empty="Nothing upcoming from other teams."
        />
      </MagazineSection>
    </>
  );
}
