import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Card, Flex, Text } from '@backstage/ui';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';

import { useModelHosting } from '../../hooks/useModelHosting';
import { servingRouteRef } from '../../routes';
import { ModelHostingHint } from '../ModelHostingHint';
import { useServing } from '../ServingProvider';

/** A full-width row, bordered like a table's frame rather than a raised card. */
const ENTRY_STYLE = {
  border: '1px solid var(--bui-border-1)',
  padding: 'var(--bui-space-3) var(--bui-space-4)',
} as const;

/**
 * The way into Model hosting on Customize › Models, between the tabs and the
 * search: one link over the whole row where hosting is offered
 * (`useModelHosting`), else `ModelHostingHint`'s line saying what turns it
 * on, in the same place. Nothing while that is still read, or when this app
 * mounts no Model hosting page. Must be mounted inside a `ServingProvider`.
 */
export function ModelHostingEntry() {
  const servingRoute = useRouteRef(servingRouteRef);
  const hosting = useModelHosting(useServing());
  if (!servingRoute || hosting.isLoading) {
    return null;
  }
  if (!hosting.available) {
    return <ModelHostingHint />;
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
