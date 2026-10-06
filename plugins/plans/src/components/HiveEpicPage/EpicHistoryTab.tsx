import { useSearchParams } from 'react-router-dom';
import {
  Badge,
  ButtonLink,
  Flex,
  Link,
  List,
  ListRow,
  Text,
  ToggleButton,
  ToggleButtonGroup,
} from '@backstage/ui';
import { DataBar, InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { useEpicHistory } from '../../hooks/useEpic';
import { linkTarget } from '../../lib/hive';
import {
  ENTRY_KIND_LABELS,
  HISTORY_WINDOWS,
  HistoryWindow,
  progressMoveLabel,
  progressPercent,
  shortDay,
} from '../../lib/magazine';
import { HiveSourceState } from '../HiveSourceState';
import { useEpic } from './context';
import { EpicColumns } from './EpicLayout';

function windowParam(value: string | null): HistoryWindow {
  return value === 'days' || value === 'months' ? value : 'weeks';
}

/**
 * What moved on the epic in 3 days, 3 weeks or 3 months (`?window=`, 3
 * weeks by default): its progress from → to, what to try, and every story.
 */
export function EpicHistoryTab() {
  const epic = useEpic();
  const [searchParams, setSearchParams] = useSearchParams();
  const window = windowParam(searchParams.get('window'));
  const { group, isLoading, error } = useEpicHistory(window, epic.key);
  const label = HISTORY_WINDOWS.find(option => option.id === window)?.label;

  const main = (
    <Flex direction="column" gap="4">
      <ToggleButtonGroup
        aria-label="History window"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[window]}
        onSelectionChange={keys => {
          const next = [...keys][0];
          if (next) {
            const params = new URLSearchParams(searchParams);
            params.set('window', String(next));
            setSearchParams(params, { replace: true });
          }
        }}
      >
        {HISTORY_WINDOWS.map(option => (
          <ToggleButton key={option.id} id={option.id}>
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <HiveSourceState
        isLoading={isLoading}
        error={error}
        what="what moved on this epic"
      />
      {!isLoading && !error && !group && (
        <InfoCard>
          <Text variant="body-medium" color="secondary">
            Nothing moved on this epic in the last {label?.toLowerCase()}.
          </Text>
        </InfoCard>
      )}
      {group && (
        <InfoCard
          title={`What moved, last ${label?.toLowerCase()}`}
          headerActions={
            group.tryIt && (
              <ButtonLink
                href={group.tryIt.url}
                {...linkTarget(group.tryIt.url)}
                variant="secondary"
                size="small"
              >
                {group.tryIt.label}
              </ButtonLink>
            )
          }
        >
          <Flex direction="column" gap="4">
            <Text variant="body-medium">{group.teaser}</Text>
            {group.progress && (
              <DataBar
                label={progressMoveLabel(group.progress)}
                value={progressPercent(group.progress.to)}
                max={100}
                color="var(--bui-fg-announcement)"
              />
            )}
            <List aria-label="Stories">
              {group.entries.map(entry => (
                <ListRow
                  key={entry.key}
                  id={entry.key}
                  textValue={entry.title}
                  description={[shortDay(entry.at), entry.author, entry.teaser]
                    .filter(Boolean)
                    .join(' · ')}
                  customActions={
                    <Badge size="small">{ENTRY_KIND_LABELS[entry.kind]}</Badge>
                  }
                >
                  <Link href={entry.url} {...linkTarget(entry.url)}>
                    {entry.title}
                  </Link>
                </ListRow>
              ))}
            </List>
          </Flex>
        </InfoCard>
      )}
    </Flex>
  );

  return <EpicColumns main={main} />;
}
