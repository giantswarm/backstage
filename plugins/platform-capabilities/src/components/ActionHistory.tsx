import { CSSProperties, useId } from 'react';
import { Flex, Text } from '@backstage/ui';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';
import { Definition, Installation } from '../apis';
import { ActionDetails, ActionLine } from './ActionView';
import { ErrorAlert } from './ErrorAlert';
import { Loading } from './Loading';
import { useActions } from './queries';

/** The history is a section of the tab, not a card: a rule above it draws the boundary the cards' frames draw for them. */
const SECTION: CSSProperties = {
  borderTop: '1px solid var(--bui-border-1)',
  paddingTop: 'var(--bui-space-6)',
  marginTop: 'var(--bui-space-2)',
};

/** An entry opens on its line, with the pointer saying so. */
const SUMMARY: CSSProperties = { cursor: 'pointer' };

/**
 * The installation's actions from `list_actions`, newest first, under their
 * own header: each is one line -- the verb, the capability, who asked, its
 * state and when -- opening to its record.
 */
export function ActionHistory({
  installation,
  definitions,
}: {
  installation: Installation;
  definitions: Definition[];
}) {
  const id = useId();
  const actions = useActions(installation.name);
  return (
    <section aria-labelledby={id} data-testid="action-history" style={SECTION}>
      <SectionHeader
        id={id}
        title="Action history"
        description={`What the manager was asked to do on ${installation.name}, newest first; each line opens to its record.`}
      />
      <Flex direction="column" gap="2">
        {actions.isPending && (
          <Loading
            label="Loading the action history…"
            testId="loading-history"
          />
        )}
        {actions.error && (
          <ErrorAlert title="Actions" error={actions.error as Error} />
        )}
        {actions.data && actions.data.actions.length === 0 && (
          <Text variant="body-small" color="secondary">
            No action on record for {installation.name}.
          </Text>
        )}
        {actions.data?.actions.map(action => (
          <details key={action.name} data-testid={`history-${action.name}`}>
            <summary style={SUMMARY}>
              <ActionLine action={action} />
            </summary>
            <ActionDetails
              action={action}
              installation={installation}
              definition={definitions.find(
                d => d.name === action.spec.capability,
              )}
            />
          </details>
        ))}
      </Flex>
    </section>
  );
}
