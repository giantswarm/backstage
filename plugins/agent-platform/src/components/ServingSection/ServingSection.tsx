import { useCallback, useMemo, useState } from 'react';
import { Progress } from '@backstage/core-components';
import { toastApiRef, useApi } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex } from '@backstage/ui';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import {
  InferenceService,
  useSelfSubjectAccessReview,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';

import { useAutoWireServedModels } from '../../hooks/useAutoWireServedModels';
import { useServeModel } from '../../hooks/useServeModel';
import { useServingPresets } from '../../hooks/useServingPresets';
import { useStopServedModel } from '../../hooks/useStopServedModel';
import { findServedModelForEndpoint } from '../../lib/serving';
import { useModelConfigs } from '../ModelConfigsProvider';
import { useServing } from '../ServingProvider';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';
import { GpuCapacityPanel } from './GpuCapacityPanel';
import {
  ServeModelDialog,
  type ServeModelConfirmation,
} from './ServeModelDialog';
import {
  isStoppable,
  ServedModelsTable,
  type ServedModelRow,
} from './ServedModelsTable';
import { StopServedModelDialog } from './StopServedModelDialog';

/** Long enough to read two lines, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

/**
 * The serving layer beneath the ModelConfigs: which models are served
 * in-cluster, where, on what, the GPU capacity they draw on — and, on
 * installations that publish serving presets, the controls to serve a model
 * from a preset and to stop one. Once a model the portal served reports ready,
 * the kagent ModelConfig for it is created here too (see
 * useAutoWireServedModels), which the "Used by" column then shows.
 *
 * Renders nothing at all — no heading, no empty table — unless at least one
 * reachable installation has a serving backend (or could not be asked), so
 * portals without one never see a Serving section. Must be mounted inside
 * both a ServingProvider and a ModelConfigsProvider, and inside the plugin's
 * QueryClientProvider (the writes are react-query mutations).
 *
 * The write controls key off the backend: presets, fit check, serve and stop
 * are KServe concerns and stay dormant for other sources' models.
 */
export function ServingSection() {
  const serving = useServing();
  const { modelConfigsFor, isLoading: isLoadingModelConfigs } =
    useModelConfigs();
  const toastApi = useApi(toastApiRef);

  const kserveInstallations = useMemo(
    () =>
      serving.installations.filter(
        installation => serving.backends[installation] === 'kserve',
      ),
    [serving.installations, serving.backends],
  );
  const presets = useServingPresets(kserveInstallations);
  const servableInstallations = presets.installations.filter(
    installation => presets.presetsFor(installation).length > 0,
  );

  const candidates = useMemo<ServedModelRow[]>(
    () =>
      serving.servedModels.map(model => {
        // Every ModelConfig on the same installation whose endpoint points at
        // this served model — the inverse of the "Served by" line on the
        // ModelConfig rows, computed with the same matcher.
        const usedBy = modelConfigsFor(model.installation)
          .filter(
            modelConfig =>
              findServedModelForEndpoint(modelConfig.getEndpoint(), [model]) ===
              model,
          )
          .map(modelConfig => ({
            installation: model.installation,
            namespace: modelConfig.getNamespace() ?? '',
            name: modelConfig.getName(),
            displayName: modelConfig.getDisplayName(),
          }));
        return { ...model, usedBy };
      }),
    [serving.servedModels, modelConfigsFor],
  );

  const { wiringFor } = useAutoWireServedModels(candidates, modelConfigsFor, {
    modelConfigsLoading: isLoadingModelConfigs,
  });
  const rows = useMemo<ServedModelRow[]>(
    () => candidates.map(row => ({ ...row, wiring: wiringFor(row.id) })),
    [candidates, wiringFor],
  );

  // --- Serve ---------------------------------------------------------------
  const [isServeOpen, setServeOpen] = useState(false);
  const [serveInstallation, setServeInstallation] = useState<string>();
  const installation = serveInstallation ?? servableInstallations[0];
  const config = installation ? presets.configFor(installation) : undefined;
  const {
    serve,
    isServing,
    error: serveError,
    reset: resetServe,
  } = useServeModel();

  const servePermission = useSelfSubjectAccessReview(
    installation ?? '',
    {
      group: InferenceService.group,
      resource: InferenceService.plural,
      namespace: config?.namespace,
      verb: 'create',
    },
    { enabled: isServeOpen && Boolean(installation && config) },
  );

  const openServe = useCallback(() => {
    resetServe();
    setServeOpen(true);
  }, [resetServe]);

  const confirmServe = useCallback(
    async ({
      manifest,
      request,
      preset,
      config: target,
    }: ServeModelConfirmation) => {
      try {
        await serve({
          installation: request.installation,
          namespace: target.namespace,
          manifest,
        });
      } catch {
        // Left to the dialog, which stays open and renders the error.
        return;
      }
      setServeOpen(false);
      toastApi.post({
        title: `Serving "${preset.displayName}" as ${request.name}`,
        // Whether it comes up is the controller's verdict, read from the CR.
        description:
          'KServe is starting it — the status column follows the InferenceService. The model config is created once it is ready.',
        status: 'success',
        timeout: TOAST_TIMEOUT_MS,
      });
    },
    [serve, toastApi],
  );

  // --- Stop ----------------------------------------------------------------
  const [stopping, setStopping] = useState<ServedModelRow | undefined>();
  const {
    stop,
    isStopping,
    error: stopError,
    reset: resetStop,
  } = useStopServedModel();

  const stopPermission = useSelfSubjectAccessReview(
    stopping?.installation ?? '',
    {
      group: InferenceService.group,
      resource: InferenceService.plural,
      namespace: stopping?.namespace,
      name: stopping?.name,
      verb: 'delete',
    },
    { enabled: Boolean(stopping) },
  );

  const openStop = useCallback(
    (row: ServedModelRow) => {
      resetStop();
      setStopping(row);
    },
    [resetStop],
  );

  const confirmStop = useCallback(async () => {
    if (!stopping) {
      return;
    }
    try {
      await stop(stopping);
    } catch {
      return;
    }
    setStopping(undefined);
    toastApi.post({
      title: `Stopped serving "${stopping.displayName ?? stopping.name}"`,
      description:
        'The predictor is being removed; the weights stay cached on the node.',
      status: 'success',
      timeout: TOAST_TIMEOUT_MS,
    });
  }, [stop, stopping, toastApi]);

  // Stop is offered wherever a stoppable backend is present; the cluster's
  // RBAC has the last word (a refusal renders in the dialog).
  const hasStoppable = rows.some(isStoppable);

  if (
    serving.installations.length === 0 &&
    serving.unreachableInstallations.length === 0
  ) {
    return null;
  }

  const stopDialogError =
    stopError?.message ??
    (stopping && !stopPermission.isLoading && !stopPermission.allowed
      ? `Your account may not delete InferenceService ${stopping.name} in ${stopping.namespace} on ${stopping.installation}, so the cluster would refuse this.`
      : undefined);

  return (
    <Flex direction="column" gap="3">
      <Flex justify="between" align="start" gap="4">
        <SectionHeader
          title="Serving"
          description={
            servableInstallations.length > 0
              ? 'Models served in-cluster — KServe InferenceServices on the installations that have a serving layer — and the GPU capacity they run on. Serve a model from a curated preset or stop one; the model config agents use is created once a served model is ready.'
              : 'Models served in-cluster — KServe InferenceServices on the installations that have a serving layer — and the GPU capacity they run on. The ModelConfigs above are how agents reach them.'
          }
        />
        {servableInstallations.length > 0 && (
          <Button
            variant="secondary"
            iconStart={<PlayArrowIcon />}
            onPress={openServe}
          >
            Serve model
          </Button>
        )}
      </Flex>

      {serving.isLoading && rows.length === 0 ? (
        <Progress aria-label="Loading served models" />
      ) : (
        <ServedModelsTable
          rows={rows}
          onStop={hasStoppable ? openStop : undefined}
        />
      )}

      <UnreachableInstallationsAlert
        installations={serving.unreachableInstallations}
        resourceName="InferenceServices"
      />

      {presets.problems.length > 0 && (
        <Alert
          status="warning"
          title="Serving presets could not be read"
          description={presets.problems
            .map(problem => `${problem.installation}: ${problem.message}`)
            .join(' ')}
        />
      )}
      {presets.invalidPresets.length > 0 && (
        <Alert
          status="warning"
          title={`${presets.invalidPresets.length} serving preset${
            presets.invalidPresets.length === 1 ? ' is' : 's are'
          } unusable`}
          description={presets.invalidPresets
            .map(
              invalid =>
                `${invalid.name} (${invalid.installation}): ${invalid.error}`,
            )
            .join(' ')}
        />
      )}

      {serving.installations.length > 0 && (
        <GpuCapacityPanel
          nodes={serving.gpuNodes}
          installations={serving.installations}
          unavailable={serving.gpuCapacityUnavailable}
          isLoading={serving.isLoading}
        />
      )}

      {servableInstallations.length > 0 && (
        <ServeModelDialog
          isOpen={isServeOpen}
          onOpenChange={setServeOpen}
          installations={servableInstallations}
          installation={installation}
          onInstallationChange={setServeInstallation}
          presets={installation ? presets.presetsFor(installation) : []}
          config={config}
          gpuNodes={serving.gpuNodes.filter(
            node => node.installation === installation,
          )}
          existingNames={serving.servedModels
            .filter(
              model =>
                model.installation === installation &&
                model.namespace === config?.namespace,
            )
            .map(model => model.name)}
          permission={{
            allowed: servePermission.allowed,
            isLoading: servePermission.isLoading,
          }}
          isServing={isServing}
          error={serveError?.message}
          onConfirm={confirmServe}
        />
      )}

      {stopping && (
        <StopServedModelDialog
          model={stopping}
          isOpen
          onOpenChange={open => {
            if (!open) {
              setStopping(undefined);
            }
          }}
          isStopping={isStopping}
          error={stopDialogError}
          onConfirm={confirmStop}
        />
      )}
    </Flex>
  );
}
