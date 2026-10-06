import { Text } from '@backstage/ui';
import { DataBar, InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { SubIssuesPanel } from '@giantswarm/backstage-plugin-roadmap';
import { progressPercent } from '../../lib/magazine';
import { useEpic } from './context';
import { EpicColumns } from './EpicLayout';

/** The epic's sub-issues: the tree to read, link and unlink. */
export function EpicSubIssuesTab() {
  const { issue, card } = useEpic();
  const progress = card?.progress;
  return (
    <EpicColumns
      main={
        <InfoCard
          title="Sub-issues"
          headerActions={
            progress &&
            progress.total > 0 && (
              <DataBar
                label={`${progress.done} of ${progress.total} done`}
                value={progressPercent(progress)}
                max={100}
                color="var(--bui-fg-announcement)"
              />
            )
          }
        >
          {issue ? (
            <SubIssuesPanel
              owner={issue.owner}
              repo={issue.repo}
              issueNumber={issue.number}
            />
          ) : (
            <Text variant="body-medium" color="secondary">
              Draft items have no sub-issues.
            </Text>
          )}
        </InfoCard>
      }
    />
  );
}
