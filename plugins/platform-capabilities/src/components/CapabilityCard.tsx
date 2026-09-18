import { useState } from 'react';
import { Button, Flex, Text } from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import { useMutation } from '@tanstack/react-query';
import {
  CapabilityState,
  Definition,
  Installation,
  platformCapabilitiesApiRef,
} from '../apis';
import { CapabilityDialog } from './CapabilityDialog';
import { ErrorAlert } from './ErrorAlert';
import { OptInNote } from './PlanView';
import { StateTag } from './StateTag';
import { VerifyView } from './VerifyView';

const CARD_STYLE = {
  border: '1px solid rgba(128,128,128,0.3)',
  borderRadius: 6,
  padding: 16,
};

/** The inputs on record, as the manager lists them. */
function InputsOnRecord({ inputs }: { inputs: Record<string, unknown> }) {
  const entries = Object.entries(inputs).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    return null;
  }
  return (
    <dl
      data-testid="inputs-on-record"
      style={{
        margin: 0,
        display: 'grid',
        gridTemplateColumns: 'max-content 1fr',
        columnGap: 12,
        rowGap: 2,
      }}
    >
      {entries.map(([key, value]) => (
        <div key={key} style={{ display: 'contents' }}>
          <dt>
            <Text variant="body-small" color="secondary">
              installation.{key}
            </Text>
          </dt>
          <dd style={{ margin: 0 }}>
            <Text variant="body-small">{String(value)}</Text>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One capability of an installation: the state, the inputs on record, the
 * last action; Enable or Reconcile opening the dry run, Verify running the
 * check and showing the features with their marks. An installation not
 * opted in shows the file's path and the pull request that adds it.
 */
export function CapabilityCard({
  installation,
  capability,
  definition,
}: {
  installation: Installation;
  capability: CapabilityState;
  definition?: Definition;
}) {
  const api = useApi(platformCapabilitiesApiRef);
  const [dialog, setDialog] = useState<'enable' | 'reconcile'>();
  const verify = useMutation({
    mutationFn: () => api.verifyCapability(installation.name, capability.name),
  });
  const notOptedIn = installation.optIn.state === 'not opted in';
  const action = capability.enabled ? 'reconcile' : 'enable';

  return (
    <Flex
      direction="column"
      gap="3"
      style={CARD_STYLE}
      data-testid={`capability-${capability.name}`}
    >
      <Flex gap="3" align="center" justify="between">
        <Flex gap="2" align="center">
          <Text variant="title-small" as="h3">
            {capability.name}
          </Text>
          <StateTag state={capability.state} testId="capability-state" />
        </Flex>
        <Flex gap="2">
          <Button
            variant="primary"
            size="small"
            onPress={() => setDialog(action)}
          >
            {action === 'enable' ? 'Enable' : 'Reconcile'}
          </Button>
          <Button
            variant="secondary"
            size="small"
            onPress={() => verify.mutate()}
            isDisabled={verify.isPending}
          >
            {verify.isPending ? 'Verifying…' : 'Verify'}
          </Button>
        </Flex>
      </Flex>
      {definition?.description && (
        <Text variant="body-small" color="secondary">
          {definition.description}
        </Text>
      )}
      {notOptedIn && <OptInNote optIn={installation.optIn} />}
      {capability.inputs?.installation && (
        <InputsOnRecord
          inputs={
            capability.inputs.installation as unknown as Record<string, unknown>
          }
        />
      )}
      <Text variant="body-small" color="secondary" data-testid="last-action">
        {capability.lastAction
          ? `Last action: ${capability.lastAction.name}${
              capability.lastAction.result
                ? ` — ${capability.lastAction.result}`
                : ''
            }`
          : 'No action yet.'}
      </Text>
      {verify.error && (
        <ErrorAlert title="Verify failed" error={verify.error as Error} />
      )}
      {verify.data && <VerifyView result={verify.data} />}
      {dialog && (
        <CapabilityDialog
          kind={dialog}
          installation={installation}
          capability={capability}
          definition={definition}
          isOpen
          onClose={() => setDialog(undefined)}
        />
      )}
    </Flex>
  );
}
