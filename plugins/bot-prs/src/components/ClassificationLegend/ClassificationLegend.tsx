import { Flex, Text } from '@backstage/ui';
import {
  SimpleAccordion,
  StatusLabel,
} from '@giantswarm/backstage-plugin-ui-react';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';

import {
  GROUP_MEANING,
  MARGE_GROUPS,
  statusIntentOf,
  type BotPrRow,
  type MargeGroup,
} from '../../lib/marge';

export type ClassificationLegendProps = {
  /** The rows in view: the legend explains the classes they carry. */
  rows: BotPrRow[];
  /** The classification the table is narrowed to, when it is. */
  classification?: MargeGroup;
  /** Narrow the table to one classification, or show every one again. */
  onClassification: (group: MargeGroup | undefined) => void;
};

/**
 * What the classifications mean, and the way to each one.
 *
 * The classes are the engine's own closed vocabulary: a sweep writes one to
 * each PR's `marge/<class>` label, and nobody writes one by hand. The reader
 * therefore never picks a class for a PR; what they do with one is narrow the
 * queue to it, which each row here does.
 *
 * Only the classes in view are listed. A class no PR carries explains nothing
 * about this queue, and the list is long enough already.
 */
export function ClassificationLegend({
  rows,
  classification,
  onClassification,
}: ClassificationLegendProps) {
  const present = new Map<MargeGroup, { status: string; count: number }>();
  for (const row of rows) {
    const seen = present.get(row.group);
    present.set(row.group, {
      status: seen?.status ?? row.status,
      count: (seen?.count ?? 0) + 1,
    });
  }
  const listed = MARGE_GROUPS.filter(group => present.has(group));
  if (listed.length === 0) {
    return null;
  }

  return (
    <SimpleAccordion title="What the classifications mean">
      <Flex direction="column" gap="2">
        <Text variant="body-small" color="secondary">
          The engine files every PR under one class and writes it to the
          PR&apos;s marge/&lt;class&gt; label. The classes are its own, fixed:
          nothing here is set by hand. Pick one to see those PRs alone.
        </Text>
        {listed.map(group => {
          const { status, count } = present.get(group)!;
          const isFiltered = classification === group;
          return (
            <button
              key={group}
              type="button"
              onClick={() => onClassification(isFiltered ? undefined : group)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                font: 'inherit',
                color: 'inherit',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Flex gap="2" align="center">
                <div style={{ minWidth: 190 }}>
                  <StatusLabel
                    label={`${status} (${count})`}
                    intent={statusIntentOf(group)}
                    icon={
                      group === 'unclassified' ? HelpOutlineIcon : undefined
                    }
                  />
                </div>
                <Text
                  variant="body-small"
                  color="secondary"
                  style={{
                    textDecoration: isFiltered ? 'underline' : undefined,
                  }}
                >
                  {GROUP_MEANING[group]}
                </Text>
              </Flex>
            </button>
          );
        })}
      </Flex>
    </SimpleAccordion>
  );
}
