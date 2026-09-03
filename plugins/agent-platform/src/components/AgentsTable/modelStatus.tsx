import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Cell, CellText, Text } from '@backstage/ui';
import { StatusLabel } from '@giantswarm/backstage-plugin-ui-react';

import { stopRowPress } from '../../lib/rowPress';
import { SERVED_MODEL_READINESS } from '../../lib/serving';
import { servingRouteRef } from '../../routes';
import { SERVED_READINESS_ICON, servingTitle } from '../ModelServingStatus';
import type { AgentRow } from '../AgentsDataProvider';

/**
 * An agent whose model nothing answers for is still listed — kagent runs it
 * happily — but reads as such: its text steps back, the model's status label
 * stays at full strength and links to where the fix is.
 */
export function isAgentRowMuted(row: AgentRow): boolean {
  return row.modelServing?.readiness === 'notServing';
}

/** The muted look; opacity rather than colour so links keep reading as links. */
export const MUTED_ROW_STYLE = { opacity: 0.55 } as const;

/**
 * The Model column: the ModelConfig's name and, where the serving layer has a
 * word on the model behind it, that model's readiness in the shared
 * vocabulary of `lib/serving.ts` — the same label the Model configs and
 * Serving views show for it. `Not serving` links to the Serving view, where
 * Load / Serve / Pull live.
 */
export function AgentModelCell({ row }: { row: AgentRow }) {
  const servingRoute = useRouteRef(servingRouteRef);
  const serving = row.modelServing;

  if (!serving) {
    return <CellText title={row.model ?? '—'} />;
  }

  const { label, intent } = SERVED_MODEL_READINESS[serving.readiness];
  const title = servingTitle(serving);
  const status = (
    <StatusLabel
      label={label}
      intent={intent}
      icon={SERVED_READINESS_ICON[serving.readiness]}
      title={title}
    />
  );

  return (
    <Cell>
      <Text
        as="p"
        variant="body-medium"
        truncate
        title={row.model}
        style={isAgentRowMuted(row) ? MUTED_ROW_STYLE : undefined}
      >
        {row.model ?? '—'}
      </Text>
      <span data-testid="agent-model-serving">
        {serving.readiness === 'notServing' && servingRoute ? (
          <Link
            to={servingRoute()}
            title={title}
            onPointerDown={stopRowPress}
            onPointerUp={stopRowPress}
            onClick={stopRowPress}
          >
            {status}
          </Link>
        ) : (
          status
        )}
      </span>
    </Cell>
  );
}
