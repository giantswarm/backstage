import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Content, EmptyState, Progress } from '@backstage/core-components';
import { Button, Flex, Text } from '@backstage/ui';
import AddIcon from '@material-ui/icons/Add';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';

import { newModelRouteRef } from '../../routes';
import { useModelConfigs } from '../ModelConfigsProvider';
import { InstallationScopeNote } from '../InstallationScopeNote';
import {
  ModelsTable,
  ModelRow,
  toModelRow,
  toModelServedBy,
} from '../ModelsTable';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';
import { useServing } from '../ServingProvider';
import { clientLookupOf } from '../../lib/serving';

// The "Model configs" view of the Models tab: every kagent ModelConfig across
// the installations in scope, and the entry point for adding one. The section
// header + tabs come from the Agent Platform page (GSPageLayout) and the
// second-level tab row from ModelsRouter, so this renders content only, with
// the "Add model" action surfaced in that shared header — same shape as the
// Agents tab. Must be mounted inside a ModelConfigsProvider and a
// ServingProvider (ModelsRouter supplies both).
export function ModelConfigsPage() {
  const navigate = useNavigate();
  const newModelLink = useRouteRef(newModelRouteRef);
  const {
    isLoading,
    hasInstallations,
    installations: kagentInstallations,
    modelConfigsFor,
    unreachableInstallations,
  } = useModelConfigs();
  const { servingStateFor, capabilitiesFor, backends } = useServing();

  // Unlike the agent create flow, the list iterates every installation in
  // scope that runs kagent (the provider's, home first), not just the ones
  // that already have models — an installation with none is exactly where a
  // platform admin goes to add the first one. Each row carries what the
  // serving layer says about the model its endpoint points at — the served
  // model and its readiness, or that nothing answers there any more — with the
  // fix the installation offers.
  const rows = useMemo<ModelRow[]>(
    () =>
      kagentInstallations.flatMap(installation =>
        modelConfigsFor(installation).map(modelConfig => {
          const state = servingStateFor(
            installation,
            clientLookupOf(modelConfig),
          );
          return toModelRow(
            modelConfig,
            state
              ? toModelServedBy(
                  state,
                  capabilitiesFor(installation, state.model?.backend),
                  state.model?.backend ?? backends[installation],
                )
              : undefined,
          );
        }),
      ),
    [
      kagentInstallations,
      modelConfigsFor,
      servingStateFor,
      capabilitiesFor,
      backends,
    ],
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

        <InstallationScopeNote component="kagent" />

        {isLoading && rows.length === 0 && (
          <Progress aria-label="Loading models" />
        )}
        {/* One flat table under every scope. Under "All installations" the
            Installation column — the table's initial sort — tells the rows
            apart; an installation with no ModelConfig simply has no row, and
            one that could not be read is called out below. */}
        {!(isLoading && rows.length === 0) && <ModelsTable rows={rows} />}

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
