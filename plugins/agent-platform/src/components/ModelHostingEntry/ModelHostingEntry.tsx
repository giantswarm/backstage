import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Card, Flex, Skeleton, Text } from '@backstage/ui';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';

import { useModelHosting } from '../../hooks/useModelHosting';
import { servingRouteRef } from '../../routes';
import { ModelHostingHintText } from '../ModelHostingHint';
import { useServing } from '../ServingProvider';

/** A full-width row, bordered like a table's frame rather than a raised card. */
const ENTRY_STYLE = {
  border: '1px solid var(--bui-border-1)',
  padding: 'var(--bui-space-3) var(--bui-space-4)',
} as const;

/** The row's height: a 16px heading and a line of 14px text, padded. */
const ENTRY_HEIGHT = 72;

/**
 * The way into Model hosting on Customize › Models, between the tabs and the
 * search: one link over the whole row where hosting is offered
 * (`useModelHosting`), else `ModelHostingHint`'s line saying what turns it
 * on, in the same place. That line is its text alone
 * (`ModelHostingHintText`): this component already holds the reads, and a
 * hint mounted anew each time they settle would start them over. While they
 * are read, a placeholder of the row's height holds its place, so the
 * search, the action and the list below don't move down when they answer.
 * Nothing when this app mounts no Model hosting page. Must be mounted inside
 * a `ServingProvider` and the plugin's QueryClientProvider.
 */
export function ModelHostingEntry() {
  const servingRoute = useRouteRef(servingRouteRef);
  const hosting = useModelHosting(useServing());
  if (!servingRoute) {
    return null;
  }
  if (hosting.isLoading) {
    return (
      <div aria-hidden data-testid="model-hosting-placeholder">
        <Skeleton
          width="100%"
          height={ENTRY_HEIGHT}
          style={{ borderRadius: 'var(--bui-radius-3)' }}
        />
      </div>
    );
  }
  if (!hosting.available) {
    return <ModelHostingHintText />;
  }
  return (
    <Card href={servingRoute()} label="Model hosting" style={ENTRY_STYLE}>
      <Flex direction="column" gap="1">
        <Flex align="center" gap="0.5">
          <Text as="h2" variant="body-large" weight="bold">
            Model hosting
          </Text>
          <ChevronRightIcon aria-hidden fontSize="small" />
        </Flex>
        <Text variant="body-medium" color="secondary">
          Run models on your own cluster nodes, so data stays in your clusters
          and cost is based on capacity, not tokens.
        </Text>
      </Flex>
    </Card>
  );
}
