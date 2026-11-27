import { Button, Flex, Switch, Text } from '@backstage/ui';
import { DateComponent } from '@giantswarm/backstage-plugin-ui-react';

import type { Filters } from '../../lib/github';

const FILTER_LABELS: Record<keyof Filters, string> = {
  hideBots: 'Hide bot PRs',
  hideDrafts: 'Hide drafts',
  orgOnly: 'giantswarm only',
  hideArchived: 'Hide archived repos',
};

export type FiltersBarProps = {
  filters: Filters;
  onFilterChange: (key: keyof Filters, on: boolean) => void;
  readAt: number | undefined;
  isRefreshing: boolean;
  /** Refresh is held while GitHub refuses the token for rate. */
  isRefreshDisabled: boolean;
  onRefresh: () => void;
};

/** The four filters, each a URL parameter, and the tab's Refresh. */
export function FiltersBar({
  filters,
  onFilterChange,
  readAt,
  isRefreshing,
  isRefreshDisabled,
  onRefresh,
}: FiltersBarProps) {
  return (
    <Flex justify="between" align="center" gap="4" style={{ flexWrap: 'wrap' }}>
      <Flex gap="4" align="center" style={{ flexWrap: 'wrap' }}>
        {(Object.keys(FILTER_LABELS) as (keyof Filters)[]).map(key => (
          <Switch
            key={key}
            label={FILTER_LABELS[key]}
            isSelected={filters[key]}
            onChange={on => onFilterChange(key, on)}
          />
        ))}
      </Flex>
      <Flex gap="3" align="center">
        {readAt !== undefined && (
          <Text variant="body-small" color="secondary">
            Read <DateComponent value={new Date(readAt)} relative />
          </Text>
        )}
        <Button
          variant="secondary"
          size="small"
          onPress={onRefresh}
          isDisabled={isRefreshing || isRefreshDisabled}
        >
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </Flex>
    </Flex>
  );
}
