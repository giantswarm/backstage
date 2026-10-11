import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Flex, List, ListRow, Text } from '@backstage/ui';
import {
  ConfirmDialog,
  LoadingIndicator,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { agentDetailRouteRef } from '../../routes';
import { AgentAvatar } from '../AgentAvatar';
import { AgentsDataProvider, useAgents } from '../AgentsDataProvider';
import {
  agentsUsingModel,
  modelConfigIdOf,
} from '../ModelDetailPage/modelUsage';
import { ShowMore, USED_BY_ROWS } from '../ShowMore';

const AVATAR_SIZE = 96;

/** Said whenever the dependents are not known: still loading, or unreadable. */
const GENERIC_CONSEQUENCE =
  'Agents that use it fail until they get another model.';

export type RemoveModelConfigDialogProps = {
  installation: string;
  modelConfig: { namespace: string; name: string };
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isRemoving: boolean;
  error?: string;
  onConfirm: () => void;
};

/**
 * The agents whose spec names the model config — the list behind Model ›
 * Used by and the Customize "Used by" count (`agentsUsingModel`), so the
 * three agree. Read only while the dialog is open; the confirm never waits
 * for it, and a read that is slow or fails leaves the generic sentence.
 */
function Dependents({
  installation,
  modelConfig,
}: Pick<RemoveModelConfigDialogProps, 'installation' | 'modelConfig'>) {
  const { rows, isLoading, unreachableInstallations } = useAgents();
  const buildAvatarUrl = useAgentAvatarUrl();
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);
  const agents = useMemo(
    () =>
      agentsUsingModel(
        rows,
        modelConfigIdOf(installation, modelConfig.namespace, modelConfig.name),
      ),
    [rows, installation, modelConfig.namespace, modelConfig.name],
  );

  if (agents.length === 0) {
    if (isLoading) {
      return (
        <Flex direction="column" gap="2">
          <Text variant="body-medium">{GENERIC_CONSEQUENCE}</Text>
          <LoadingIndicator label="Reading the agents…" />
        </Flex>
      );
    }
    return (
      <Text variant="body-medium">
        {unreachableInstallations.includes(installation)
          ? GENERIC_CONSEQUENCE
          : 'No agent uses it.'}
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="2">
      <Text variant="body-medium">
        {agents.length === 1
          ? 'This agent uses it and fails until it gets another model.'
          : `These ${agents.length} agents use it and fail until they get another model.`}
      </Text>
      <ShowMore items={agents} initial={USED_BY_ROWS} noun="agent" revealAll>
        {shown => (
          <List aria-label="Agents using this model config">
            {shown.map(row => (
              <ListRow
                key={row.id}
                id={row.id}
                href={agentDetailRoute?.({
                  installation: row.installation,
                  namespace: row.namespace,
                  name: row.technicalName,
                })}
                icon={
                  <AgentAvatar
                    size="small"
                    purpose="decoration"
                    name={row.name}
                    src={
                      buildAvatarUrl(row.installation, row.technicalName, {
                        size: AVATAR_SIZE,
                      }) ?? ''
                    }
                  />
                }
              >
                {row.name}
              </ListRow>
            ))}
          </List>
        )}
      </ShowMore>
    </Flex>
  );
}

/**
 * Asks before removing the model config model-manager created for a served
 * model (`unwire`), naming the agents that use it — Delete's pattern
 * (destructive, the named button) with Model › Used by's list.
 *
 * Must be mounted inside a `ModelConfigsProvider`: the agent list resolves
 * model references against it.
 */
export function RemoveModelConfigDialog({
  installation,
  modelConfig,
  isOpen,
  onOpenChange,
  isRemoving,
  error,
  onConfirm,
}: RemoveModelConfigDialogProps) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Remove model config "${modelConfig.name}"?`}
      destructive
      confirmLabel="Remove model config"
      busyLabel="Removing…"
      isBusy={isRemoving}
      error={error}
      onConfirm={onConfirm}
    >
      {isOpen && (
        <AgentsDataProvider>
          <Dependents installation={installation} modelConfig={modelConfig} />
        </AgentsDataProvider>
      )}
    </ConfirmDialog>
  );
}
