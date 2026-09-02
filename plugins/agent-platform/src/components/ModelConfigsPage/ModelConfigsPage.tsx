import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Content, EmptyState, Progress } from '@backstage/core-components';
import { Button, Flex, Text } from '@backstage/ui';
import AddIcon from '@material-ui/icons/Add';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';

import { newModelRouteRef } from '../../routes';
import { useModelConfigs } from '../ModelConfigsProvider';
import { useReachableInstallations } from '../../hooks/useReachableInstallations';
import { useInstallations } from '@giantswarm/backstage-plugin-gs';
import {
  ModelsTable,
  ModelRow,
  toModelRow,
  toModelServedBy,
} from '../ModelsTable';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';
import { useServing } from '../ServingProvider';

// The "Model configs" view of the Models tab: every kagent ModelConfig across
// the fleet, and the entry point for adding one. The section header + tabs
// come from the Agent Platform page (GSPageLayout) and the second-level tab
// row from ModelsRouter, so this renders content only, with the "Add model"
// action surfaced in that shared header — same shape as the Agents tab. Must
// be mounted inside a ModelConfigsProvider and a ServingProvider (ModelsRouter
// supplies both).
export function ModelConfigsPage() {
  const navigate = useNavigate();
  const newModelLink = useRouteRef(newModelRouteRef);
  const { installations } = useInstallations();
  const allInstallations = installations.map(installation => installation.name);
  const { installations: reachableInstallations } =
    useReachableInstallations(allInstallations);
  const {
    isLoading,
    hasInstallations,
    modelConfigsFor,
    unreachableInstallations,
  } = useModelConfigs();
  const { servedModelFor } = useServing();

  // Unlike the agent create flow, the list iterates the *reachable*
  // installations, not just the ones that already have models — an
  // installation with none is exactly where a platform admin goes to add the
  // first one. Each row is linked to the served model its endpoint points at,
  // when the installation has a serving layer this portal can see.
  const rows = useMemo<ModelRow[]>(
    () =>
      reachableInstallations.flatMap(installation =>
        modelConfigsFor(installation).map(modelConfig => {
          const served = servedModelFor(installation, {
            endpoint: modelConfig.getEndpoint(),
            model: modelConfig.getModel(),
            modelConfig: {
              name: modelConfig.getName(),
              namespace: modelConfig.getNamespace(),
            },
          });
          return toModelRow(
            modelConfig,
            served ? toModelServedBy(served) : undefined,
          );
        }),
      ),
    [reachableInstallations, modelConfigsFor, servedModelFor],
  );

  // Memoized so the header actions slot only updates when the handler changes.
  const actions = useMemo(
    () => (
      <Button
        variant="primary"
        iconStart={<AddIcon />}
        onPress={() => newModelLink && navigate(newModelLink())}
      >
        Add model
      </Button>
    ),
    [newModelLink, navigate],
  );
  useProvidePageHeaderActions(actions);

  if (!isLoading && !hasInstallations) {
    return (
      <Content>
        <EmptyState
          missing="data"
          title="No installations configured"
          description="Models are read from your management clusters, but no installations are configured for this instance."
        />
      </Content>
    );
  }

  return (
    <Content>
      <Flex direction="column" gap="3">
        <Text color="secondary">
          The models agents can run on, provisioned per installation as kagent
          ModelConfigs.
        </Text>

        {isLoading && rows.length === 0 ? (
          <Progress aria-label="Loading models" />
        ) : (
          <ModelsTable rows={rows} />
        )}

        {/* Rendered regardless of the loading branch so a fleet where every
            reachable installation errors still surfaces the failure instead of
            an indefinite progress bar. */}
        <UnreachableInstallationsAlert
          installations={unreachableInstallations}
          resourceName="Models"
        />
      </Flex>
    </Content>
  );
}
