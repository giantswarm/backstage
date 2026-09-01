import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Content, EmptyState, Progress } from '@backstage/core-components';
import { Button, Flex, Text } from '@backstage/ui';
import AddIcon from '@material-ui/icons/Add';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';

import { newModelRouteRef } from '../../routes';
import { ModelConfigsProvider, useModelConfigs } from '../ModelConfigsProvider';
import { useReachableInstallations } from '../../hooks/useReachableInstallations';
import { useInstallations } from '@giantswarm/backstage-plugin-gs';
import { ModelsTable, ModelRow, toModelRow } from '../ModelsTable';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';

// Content of the "Models" tab: every kagent ModelConfig across the fleet, and
// the entry point for adding one. The section header + tabs come from the
// Agent Platform page (GSPageLayout), so this renders content only, with the
// "Add model" action surfaced in that shared header — same shape as the
// Agents tab.
function ModelsIndexPageContent() {
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

  // Unlike the agent create flow, the list iterates the *reachable*
  // installations, not just the ones that already have models — an
  // installation with none is exactly where a platform admin goes to add the
  // first one.
  const rows = useMemo<ModelRow[]>(
    () =>
      reachableInstallations.flatMap(installation =>
        modelConfigsFor(installation).map(toModelRow),
      ),
    [reachableInstallations, modelConfigsFor],
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

export function ModelsIndexPage() {
  return (
    <ModelConfigsProvider>
      <ModelsIndexPageContent />
    </ModelConfigsProvider>
  );
}
