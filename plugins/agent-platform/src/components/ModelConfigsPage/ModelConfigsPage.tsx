import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Content, EmptyState, Progress } from '@backstage/core-components';
import { Button, Flex, Text } from '@backstage/ui';
import AddIcon from '@material-ui/icons/Add';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';
import { useInstallations } from '@giantswarm/backstage-plugin-gs';

import { newModelRouteRef } from '../../routes';
import {
  groupRowsByInstallation,
  MODELS_NOUN,
} from '../../lib/installationGroups';
import { useModelConfigs } from '../ModelConfigsProvider';
import {
  InstallationGroups,
  InstallationScopeNote,
  useGroupedByInstallation,
} from '../InstallationGroups';
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
  const { installations: configuredInstallations } = useInstallations();
  const {
    isLoading,
    hasInstallations,
    home,
    installations: kagentInstallations,
    pendingInstallations,
    modelConfigsFor,
    unreachableInstallations,
  } = useModelConfigs();
  const { servingStateFor, capabilitiesFor, backends } = useServing();
  // Under "All installations" on a multi-installation portal the rows render
  // as one group per installation, home first; a pinned scope and a
  // single-installation portal keep the flat table.
  const grouped = useGroupedByInstallation();

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

  const pipelineFor = useCallback(
    (installation: string) =>
      configuredInstallations.find(candidate => candidate.name === installation)
        ?.pipeline,
    [configuredInstallations],
  );
  const groups = useMemo(
    () =>
      groupRowsByInstallation(rows, {
        installations: kagentInstallations,
        home,
        pending: pendingInstallations,
        unreachable: unreachableInstallations,
        pipelineFor,
      }),
    [
      rows,
      kagentInstallations,
      home,
      pendingInstallations,
      unreachableInstallations,
      pipelineFor,
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
        {!(isLoading && rows.length === 0) && grouped && (
          <InstallationGroups
            groups={groups}
            noun={MODELS_NOUN}
            renderRows={groupRows => <ModelsTable rows={groupRows} />}
            fallback={<ModelsTable rows={[]} />}
          />
        )}
        {!(isLoading && rows.length === 0) && !grouped && (
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
