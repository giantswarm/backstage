import { useCallback, useMemo, useState } from 'react';
import { Content, EmptyState, Progress } from '@backstage/core-components';
import { toastApiRef, useApi } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import CloudDownloadIcon from '@material-ui/icons/CloudDownload';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import SearchIcon from '@material-ui/icons/Search';
import {
  InferenceService,
  useSelfSubjectAccessReview,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';

import { useDownloadRows, withDownloadRows } from '../../hooks/useDownloadRows';
import { useServeModel } from '../../hooks/useServeModel';
import { useServingPresets } from '../../hooks/useServingPresets';
import {
  useStopServedModel,
  type StopServedModelVia,
} from '../../hooks/useStopServedModel';
import {
  NO_SERVING_CAPABILITIES,
  type ServedModel,
  type ServingCapabilities,
  type ServingBackend,
} from '../../lib/serving';
import {
  DownloadRowActions,
  hasRowActions,
  ImportModelDialog,
  PullModelDialog,
  ServedModelActions,
  type ImportTarget,
  type PullTarget,
} from '../ModelManagerControls';
import { useServedModelRows } from '../ServedModelRowsProvider';
import { useServing } from '../ServingProvider';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';
import {
  ServeModelDialog,
  toDownloadedModelOption,
  type ServeModelConfirmation,
  type ServeModelSeed,
} from './ServeModelDialog';
import {
  isDownloadRow,
  isServableDownload,
  isStoppable,
  ServedModelsTable,
  type ServedModelRow,
} from './ServedModelsTable';
import { StopServedModelDialog } from './StopServedModelDialog';

/** Long enough to read two lines, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

/**
 * The "Serving" view of the Models tab: which models are served (or
 * downloaded) per installation, on what, with what — and the controls the
 * installation's serving layer offers over them. The GPU capacity they draw on
 * has its own view (GpuCapacityPage).
 *
 * Shows an empty state — and ModelsRouter hides the view's tab — unless at
 * least one reachable installation has a serving backend (or could not be
 * asked), so portals without one never see a Serving view. Must be mounted
 * inside a ServingProvider, a ModelConfigsProvider, a ServedModelRowsProvider
 * (the rows, with the auto-wiring that completes a serve) and the plugin's
 * QueryClientProvider (the writes are react-query mutations). The primary
 * actions — Serve, Import, Pull — are surfaced in the shared page header,
 * like "Add model" on the Model configs view.
 *
 * Two families of controls, each gated by what the installation reports,
 * meeting in one actions menu per row:
 *
 * - **Capability-driven** (the model-manager source): every control and panel
 *   keys off the installation's `ServingCapabilities`, never off a backend's
 *   name. `pull` puts the Pull button here and the pulls themselves into the
 *   table — a download is a row where its model will land, with its progress
 *   as the status and Cancel (or, once failed, Retry / Dismiss) as its menu
 *   (useDownloadRows) — with `search` it becomes the Hugging Face import
 *   (search, size and fit check against a node, pre-warm download);
 *   load/unload/delete/wire fill the per-row menu of the rows the source
 *   operates on. An Ollama-backed
 *   installation shows its controls; a read-only KServe CR view shows its rows
 *   and nothing operational — both ordinary state. The table's columns follow
 *   its rows, per installation (ServedModelsTable): Node and GPUs appear on
 *   the rows that carry a node, never from a capability flag, so a backend
 *   that merely knows its nodes does not get placement columns.
 * - **Preset-driven** (the KServe CR source): on installations that publish
 *   serving presets, serve a model from a preset — or from a download already
 *   in a node's cache ("Serve…" on that row) — and stop one; once a model the
 *   portal served reports ready, its kagent ModelConfig is created too (see
 *   ServedModelRowsProvider).
 *
 * On a KServe installation with a model-manager, the provider has already
 * folded the two views of an InferenceService into one row: its menu offers
 * "Stop serving…" once, done through model-manager where it operates the row
 * and by deleting the CR with the user's RBAC otherwise.
 */
export function ServingPage() {
  const serving = useServing();
  const { servedModels, installations } = serving;
  const { rows: servedRows } = useServedModelRows();
  const toastApi = useApi(toastApiRef);
  const [isPullOpen, setPullOpen] = useState(false);
  const [isImportOpen, setImportOpen] = useState(false);

  // The flags a row's controls follow: its backend's on its installation (an
  // installation may run several behind one model-manager), else the
  // installation's.
  const capabilitiesFor = useCallback(
    (installation: string, backend?: ServingBackend): ServingCapabilities =>
      (backend
        ? serving.backendCapabilities?.[installation]?.[backend]
        : undefined) ??
      serving.capabilities?.[installation] ??
      NO_SERVING_CAPABILITIES,
    [serving.capabilities, serving.backendCapabilities],
  );
  const { loadingFor } = serving;

  /**
   * The backends an installation's controls address: each named backend of
   * a model-manager that runs several (with its own flags), else the
   * installation as one unnamed target with its merged flags.
   */
  const backendTargetsOf = useCallback(
    (
      installation: string,
    ): { backend?: ServingBackend; capabilities: ServingCapabilities }[] => {
      const perBackend = serving.backendCapabilities?.[installation];
      const named = perBackend
        ? (Object.entries(perBackend) as [
            ServingBackend,
            ServingCapabilities,
          ][])
        : [];
      if (named.length > 1) {
        return named.map(([backend, capabilities]) => ({
          backend,
          capabilities,
        }));
      }
      return [{ capabilities: capabilitiesFor(installation) }];
    },
    [serving.backendCapabilities, capabilitiesFor],
  );

  const kserveInstallations = useMemo(
    () =>
      installations.filter(installation =>
        (
          serving.sourceBackends?.[installation] ?? [
            serving.backends[installation],
          ]
        ).includes('kserve'),
      ),
    [installations, serving.backends, serving.sourceBackends],
  );
  const presets = useServingPresets(kserveInstallations);
  const servableInstallations = presets.installations.filter(
    installation => presets.presetsFor(installation).length > 0,
  );

  // --- Capability-driven controls (model-manager) ---------------------------
  // A backend that can search its hub gets the import dialog (search, fit
  // check, pre-warm); one that can only pull by reference gets the plain one.
  const pullTargets = useMemo<PullTarget[]>(
    () =>
      installations.flatMap(installation =>
        backendTargetsOf(installation)
          .filter(
            ({ capabilities }) => capabilities.pull && !capabilities.search,
          )
          .map(({ backend, capabilities }) => ({
            name: installation,
            ...(backend ? { backend } : {}),
            canWire: capabilities.wire,
          })),
      ),
    [installations, backendTargetsOf],
  );
  const importTargets = useMemo<ImportTarget[]>(
    () =>
      installations.flatMap(installation =>
        backendTargetsOf(installation)
          .filter(
            ({ capabilities }) => capabilities.pull && capabilities.search,
          )
          .map(({ backend }) => ({
            name: installation,
            ...(backend ? { backend } : {}),
            nodes: serving.gpuNodes.filter(
              node =>
                node.installation === installation &&
                (!backend || !node.backend || node.backend === backend),
            ),
          })),
      ),
    [installations, backendTargetsOf, serving.gpuNodes],
  );
  const downloadInstallations = useMemo(
    () =>
      Array.from(
        new Set([...pullTargets, ...importTargets].map(target => target.name)),
      ),
    [pullTargets, importTargets],
  );
  // The pulls of those installations, as rows among the models they will
  // become; a failed one stays until dismissed.
  const downloadRows = useDownloadRows(downloadInstallations, serving.backends);
  const rows = useMemo(
    () => withDownloadRows(servedRows, downloadRows.rows),
    [servedRows, downloadRows.rows],
  );

  // --- Serve ---------------------------------------------------------------
  const [isServeOpen, setServeOpen] = useState(false);
  const [serveInstallation, setServeInstallation] = useState<string>();
  const [serveSeed, setServeSeed] = useState<ServeModelSeed>();
  const installation = serveInstallation ?? servableInstallations[0];
  const config = installation ? presets.configFor(installation) : undefined;
  const {
    serve,
    isServing,
    error: serveError,
    reset: resetServe,
  } = useServeModel();

  const openServe = useCallback(() => {
    resetServe();
    setServeSeed(undefined);
    setServeOpen(true);
  }, [resetServe]);

  /** "Serve…" on a cached download: the dialog starts from that model, on its node. */
  const openServeFor = useCallback(
    (row: ServedModel) => {
      resetServe();
      setServeInstallation(row.installation);
      setServeSeed({
        download: toDownloadedModelOption(row),
        presetName: row.preset,
      });
      setServeOpen(true);
    },
    [resetServe],
  );

  // The cached downloads of the installation the dialog serves on, offered
  // as its weights.
  const downloads = useMemo(
    () =>
      servedModels
        .filter(
          model =>
            model.installation === installation && isServableDownload(model),
        )
        .map(toDownloadedModelOption),
    [servedModels, installation],
  );

  // --- Stop ----------------------------------------------------------------
  const [stopping, setStopping] = useState<ServedModelRow | undefined>();
  const {
    stop,
    isStopping,
    error: stopError,
    reset: resetStop,
  } = useStopServedModel();

  const openStop = useCallback(
    (row: ServedModel) => {
      resetStop();
      setStopping(row as ServedModelRow);
    },
    [resetStop],
  );

  /**
   * How a row is stopped: through model-manager where it lists the model and
   * can unload (it also unwires the ModelConfig it created), else by deleting
   * the CR with the user's own RBAC.
   */
  const stopVia = useCallback(
    (row: ServedModel): StopServedModelVia =>
      row.operable &&
      row.managerRef !== undefined &&
      capabilitiesFor(row.installation, row.backend).unload
        ? 'model-manager'
        : 'inferenceservice',
    [capabilitiesFor],
  );

  // --- One actions menu per row --------------------------------------------
  const offersFor = useCallback(
    (row: ServedModelRow) => ({
      onServe:
        servableInstallations.includes(row.installation) &&
        isServableDownload(row)
          ? openServeFor
          : undefined,
      onStop: isStoppable(row) ? openStop : undefined,
    }),
    [servableInstallations, openServeFor, openStop],
  );

  const hasActions = rows.some(
    row =>
      isDownloadRow(row) ||
      hasRowActions(
        row,
        capabilitiesFor(row.installation, row.backend),
        offersFor(row),
      ),
  );

  const renderActions = useCallback(
    (row: ServedModelRow) => {
      const capabilities = capabilitiesFor(row.installation, row.backend);
      if (isDownloadRow(row)) {
        return (
          <DownloadRowActions
            row={row}
            capabilities={capabilities}
            onDismiss={downloadRows.dismiss}
          />
        );
      }
      const offers = offersFor(row);
      return hasRowActions(row, capabilities, offers) ? (
        <ServedModelActions
          model={row}
          capabilities={capabilities}
          loading={loadingFor(row.installation, row.backend)}
          onServe={offers.onServe}
          onStop={offers.onStop}
        />
      ) : null;
    },
    [capabilitiesFor, loadingFor, offersFor, downloadRows.dismiss],
  );

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

  const stoppingVia = stopping ? stopVia(stopping) : 'inferenceservice';

  // The user's own RBAC matters only when the CR is deleted directly; through
  // model-manager the gateway's JWT policy is the boundary.
  const stopPermission = useSelfSubjectAccessReview(
    stopping?.installation ?? '',
    {
      group: InferenceService.group,
      resource: InferenceService.plural,
      namespace: stopping?.namespace,
      name: stopping?.name,
      verb: 'delete',
    },
    { enabled: Boolean(stopping) && stoppingVia === 'inferenceservice' },
  );

  const confirmStop = useCallback(async () => {
    if (!stopping) {
      return;
    }
    const via = stopVia(stopping);
    let outcome: Awaited<ReturnType<typeof stop>>;
    try {
      outcome = await stop({ model: stopping, via });
    } catch {
      return;
    }
    setStopping(undefined);
    toastApi.post({
      title: `Stopped serving "${stopping.displayName ?? stopping.name}"`,
      // What happened, not what was asked: model-manager may have handed the
      // stop back to the CR delete.
      description:
        outcome.via === 'model-manager'
          ? 'model-manager is removing the predictor and the model config it created; the weights stay cached on the node.'
          : 'The predictor is being removed; the weights stay cached on the node.',
      status: 'success',
      timeout: TOAST_TIMEOUT_MS,
    });
  }, [stop, stopVia, stopping, toastApi]);

  const canServe = servableInstallations.length > 0;
  const canPull = pullTargets.length > 0;
  const canImport = importTargets.length > 0;

  // The view's primary actions go to the shared page header (agent-flow
  // convention). Memoized so the header slot only updates when what is
  // offered changes; `null` clears the slot when nothing is.
  const headerActions = useMemo(
    () =>
      canServe || canPull || canImport ? (
        <Flex gap="2">
          {canPull && (
            <Button
              variant="secondary"
              iconStart={<CloudDownloadIcon />}
              onPress={() => setPullOpen(true)}
            >
              Pull model
            </Button>
          )}
          {canImport && (
            <Button
              variant="secondary"
              iconStart={<SearchIcon />}
              onPress={() => setImportOpen(true)}
            >
              Import from Hugging Face
            </Button>
          )}
          {canServe && (
            <Button
              variant="primary"
              iconStart={<PlayArrowIcon />}
              onPress={openServe}
            >
              Serve model
            </Button>
          )}
        </Flex>
      ) : null,
    [canServe, canPull, canImport, openServe],
  );
  useProvidePageHeaderActions(headerActions);

  if (
    installations.length === 0 &&
    serving.unreachableInstallations.length === 0
  ) {
    return (
      <Content>
        {serving.isLoading ? (
          <Progress aria-label="Looking for a serving layer" />
        ) : (
          <EmptyState
            missing="data"
            title="No serving layer"
            description="None of the reachable installations has a serving layer this portal can see — KServe InferenceServices, or a model-manager (Ollama, KServe). Model configs pointing at external endpoints work without one."
          />
        )}
      </Content>
    );
  }

  const stopDialogError =
    stopError?.message ??
    (stopping &&
    stoppingVia === 'inferenceservice' &&
    !stopPermission.isLoading &&
    !stopPermission.allowed
      ? `Your account may not delete InferenceService ${stopping.name} in ${stopping.namespace} on ${stopping.installation}, so the cluster would refuse this.`
      : undefined);

  let description =
    'Models served on the installations that have a serving layer — KServe InferenceServices read from the cluster, or the inventory of a model-manager (Ollama, KServe). The model configs are how agents reach them.';
  if (canServe || canPull || canImport) {
    description = `${description} ${[
      canServe && 'Serve a model from a curated preset or stop one',
      canImport &&
        "import a model from Hugging Face into a node's cache after a size and fit check",
      canPull && 'pull a model onto a backend, load, unload or delete it',
    ]
      .filter(Boolean)
      .join(
        '; ',
      )}; the model config agents use is created for a model the platform serves.`;
  }

  return (
    <Content>
      <Flex direction="column" gap="3">
        <Text color="secondary">{description}</Text>

        {serving.isLoading && rows.length === 0 ? (
          <Progress aria-label="Loading served models" />
        ) : (
          <ServedModelsTable
            rows={rows}
            renderActions={hasActions ? renderActions : undefined}
          />
        )}

        <UnreachableInstallationsAlert
          installations={serving.unreachableInstallations}
          resourceName="served models"
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

        {downloadRows.errors.length > 0 && (
          <Alert
            status="warning"
            title="Downloads could not be read"
            description={downloadRows.errors
              .map(
                problem => `${problem.installation}: ${problem.error.message}`,
              )
              .join(' ')}
          />
        )}

        {canPull && (
          <PullModelDialog
            isOpen={isPullOpen}
            onOpenChange={setPullOpen}
            targets={pullTargets}
          />
        )}

        {canImport && (
          <ImportModelDialog
            isOpen={isImportOpen}
            onOpenChange={setImportOpen}
            targets={importTargets}
          />
        )}

        {canServe && (
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
            existingNames={servedModels
              .filter(
                model =>
                  model.installation === installation &&
                  model.namespace === config?.namespace,
              )
              .map(model => model.name)}
            downloads={downloads}
            seed={serveSeed}
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
            via={stoppingVia}
            onConfirm={confirmStop}
          />
        )}
      </Flex>
    </Content>
  );
}
