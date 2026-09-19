import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { Content, EmptyState, Progress } from '@backstage/core-components';
import { toastApiRef, useApi } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import CloudDownloadIcon from '@material-ui/icons/CloudDownload';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import SearchIcon from '@material-ui/icons/Search';
import {
  LLMInferenceService,
  useSelfSubjectAccessReview,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';
import { installationErrorLine } from '@giantswarm/backstage-plugin-muster';

import { useDownloadRows, withDownloadRows } from '../../hooks/useDownloadRows';
import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';
import {
  useStopServedModel,
  type StopServedModelVia,
} from '../../hooks/useStopServedModel';
import type { ModelManagerLoadAnswer } from '../../lib/modelManager';
import {
  describeLoadAnswer,
  parseServeRoute,
  withoutServeRoute,
} from '../../lib/modelManagerServe';
import {
  NO_SERVING_CAPABILITIES,
  backendsOn,
  type ServedModel,
  type ServingCapabilities,
  type ServingBackend,
} from '../../lib/serving';
import {
  describeLoadTarget,
  DownloadRowActions,
  hasRowActions,
  ImportModelDialog,
  LoadModelDialog,
  PullModelDialog,
  ServedModelActions,
  type ImportTarget,
  type LoadModelSeed,
  type LoadTarget,
  type PullTarget,
} from '../ModelManagerControls';
import { useGpuNodePoolControls } from '../GpuNodePools';
import { useModelBackendControls } from '../ModelBackends';
import { useServedModelRows } from '../ServedModelRowsProvider';
import { useServing } from '../ServingProvider';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';
import {
  hasServedModelTimeline,
  isOpenedServedModel,
  ServedModelLifecyclePanel,
  ServedModelLifecycleToggle,
  type OpenedServedModel,
} from './ServedModelLifecyclePanel';
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
 * (the rows) and the plugin's QueryClientProvider (the writes are react-query
 * mutations). The primary actions — Serve, Import, Pull — are surfaced in the
 * shared page header, like "Add model" on the Model configs view.
 *
 * Every control and panel keys off the installation's `ServingCapabilities`
 * (the model-manager source's flags), never off a backend's name. `pull` puts
 * the Pull button here and the pulls themselves into the table — a download
 * is a row where its model will land, with its progress as the status and
 * Cancel (or, once failed, Retry / Dismiss) as its menu (useDownloadRows) —
 * with `search` it becomes the Hugging Face import (search, size and fit
 * check against a node, pre-warm download); `load` is the Serve: on a GPU
 * pool the kserve backend's presets, `check_fit` and one `load_model` over
 * muster as the person (LoadModelDialog) — model-manager composes the
 * LLMInferenceService and wires the model config once it answers; nothing is
 * composed here; load/unload/delete/wire fill the per-row menu of the rows the
 * source operates on. An Ollama-backed installation shows its controls; a
 * read-only KServe CR view shows its rows and nothing operational — both
 * ordinary state. The table's columns follow its rows, per installation
 * (ServedModelsTable): Node and GPUs appear on the rows that carry a node,
 * never from a capability flag, so a backend that merely knows its nodes does
 * not get placement columns.
 *
 * On a KServe installation with a model-manager, the provider has already
 * folded the two views of an LLMInferenceService into one row: its menu
 * offers "Stop serving…" once, done through model-manager where it operates
 * the row and by deleting the CR with the user's RBAC otherwise.
 */
export function ServingPage() {
  const serving = useServing();
  const { servedModels, installations } = serving;
  const { rows: servedRows } = useServedModelRows();
  const backends = useModelBackendControls();
  const pools = useGpuNodePoolControls(
    serving.reachableInstallations,
    servedModels,
  );
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

  // --- Serve through model-manager, as the person ----------------------------
  // Every backend that can load — on a GPU pool the kserve backend the pool
  // registered: presets, `check_fit` and `load_model` over muster. The one
  // Serve there is.
  const musterApi = useMusterPluginApi();
  const loadTargets = useMemo<LoadTarget[]>(
    () =>
      musterApi
        ? installations.flatMap(installation =>
            backendTargetsOf(installation)
              .filter(({ capabilities }) => capabilities.load)
              .map(({ backend, capabilities }) => ({
                name: installation,
                ...(backend ? { backend } : {}),
                capabilities,
              })),
          )
        : [],
    [musterApi, installations, backendTargetsOf],
  );
  const canLoad = loadTargets.length > 0;
  const [isLoadOpen, setLoadOpen] = useState(false);
  const [loadSeed, setLoadSeed] = useState<LoadModelSeed>();

  // The served model whose step timeline is open: Serve's answer opens it on
  // the object model-manager composed, a row's chevron on that row.
  const [openedModel, setOpenedModel] = useState<OpenedServedModel>();
  const toggleOpenedModel = useCallback(
    (row: ServedModelRow) =>
      setOpenedModel(current =>
        isOpenedServedModel(current, row)
          ? undefined
          : { installation: row.installation, name: row.name },
      ),
    [],
  );
  const closeOpenedModel = useCallback(() => setOpenedModel(undefined), []);

  // The pool panel's link: `?serve=1&installation=…&cluster=…&pool=…` opens
  // the dialog on that pool — with `&preset=…` on the preset the pool was
  // deployed to serve — then leaves the URL, so a reload does not reopen it.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const route = parseServeRoute(searchParams);
    if (!route) {
      return;
    }
    setLoadSeed({
      installation: route.installation,
      cluster: route.cluster,
      pool: route.pool,
      model: route.preset,
    });
    setLoadOpen(true);
    setSearchParams(withoutServeRoute(searchParams), { replace: true });
  }, [searchParams, setSearchParams]);

  const onServed = useCallback(
    (target: LoadTarget, answer: ModelManagerLoadAnswer) => {
      toastApi.post({
        title: `Serving "${answer.name}" on ${describeLoadTarget(target)}`,
        description:
          describeLoadAnswer(answer) ||
          'model-manager is starting it — the status column follows the served model.',
        status: 'success',
        timeout: TOAST_TIMEOUT_MS,
      });
      // The timeline follows the object model-manager composed; the row
      // arrives with the next inventory read.
      setOpenedModel({
        installation: target.name,
        name: answer.running?.resource ?? answer.name,
      });
    },
    [toastApi],
  );

  const openServe = useCallback(() => {
    setLoadSeed(undefined);
    setLoadOpen(true);
  }, []);

  /** "Serve…" on a cached download: the dialog starts on its installation and preset. */
  const openServeFor = useCallback((row: ServedModel) => {
    setLoadSeed({
      installation: row.installation,
      backend: row.backend,
      model: row.preset ?? row.name,
    });
    setLoadOpen(true);
  }, []);

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
        : 'llminferenceservice',
    [capabilitiesFor],
  );

  // --- One actions menu per row --------------------------------------------
  const offersFor = useCallback(
    (row: ServedModelRow) => ({
      onServe:
        loadTargets.some(target => target.name === row.installation) &&
        isServableDownload(row)
          ? openServeFor
          : undefined,
      onStop: isStoppable(row) ? openStop : undefined,
    }),
    [loadTargets, openServeFor, openStop],
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
      const timeline = hasServedModelTimeline(row) ? (
        <ServedModelLifecycleToggle
          row={row}
          isOpen={isOpenedServedModel(openedModel, row)}
          onToggle={toggleOpenedModel}
        />
      ) : null;
      const actions = hasRowActions(row, capabilities, offers) ? (
        <ServedModelActions
          model={row}
          capabilities={capabilities}
          loading={loadingFor(row.installation, row.backend)}
          onServe={offers.onServe}
          onStop={offers.onStop}
        />
      ) : null;
      return timeline || actions ? (
        <>
          {timeline}
          {actions}
        </>
      ) : null;
    },
    [
      capabilitiesFor,
      loadingFor,
      offersFor,
      downloadRows.dismiss,
      openedModel,
      toggleOpenedModel,
    ],
  );
  const hasTimelines = rows.some(hasServedModelTimeline);
  const openedRow = useMemo(
    () =>
      openedModel
        ? rows.find(
            row => !isDownloadRow(row) && isOpenedServedModel(openedModel, row),
          )
        : undefined,
    [openedModel, rows],
  );

  const stoppingVia = stopping ? stopVia(stopping) : 'llminferenceservice';

  // The user's own RBAC matters only when the CR is deleted directly; through
  // model-manager the gateway's JWT policy is the boundary.
  const stopPermission = useSelfSubjectAccessReview(
    stopping?.installation ?? '',
    {
      group: LLMInferenceService.group,
      resource: LLMInferenceService.plural,
      namespace: stopping?.namespace,
      name: stopping?.name,
      verb: 'delete',
    },
    { enabled: Boolean(stopping) && stoppingVia === 'llminferenceservice' },
  );

  const confirmStop = useCallback(async () => {
    if (!stopping) {
      return;
    }
    const via = stopVia(stopping);
    try {
      await stop({ model: stopping, via });
    } catch {
      // Left to the dialog, which stays open and renders the error.
      return;
    }
    setStopping(undefined);
    toastApi.post({
      title: `Stopped serving "${stopping.displayName ?? stopping.name}"`,
      description:
        via === 'model-manager'
          ? 'model-manager is removing the workload and the model config it created; the weights stay cached on the node.'
          : 'The workload is being removed; the weights stay cached on the node.',
      status: 'success',
      timeout: TOAST_TIMEOUT_MS,
    });
  }, [stop, stopVia, stopping, toastApi]);

  const canPull = pullTargets.length > 0;
  const canImport = importTargets.length > 0;

  // The view's primary actions go to the shared page header (agent-flow
  // convention). Memoized so the header slot only updates when what is
  // offered changes; `null` clears the slot when nothing is.
  const headerActions = useMemo(
    () =>
      canLoad ||
      canPull ||
      canImport ||
      backends.available ||
      pools.available ? (
        <Flex gap="2">
          {backends.addButton}
          {pools.addButton}
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
          {canLoad && (
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
    [
      canLoad,
      canPull,
      canImport,
      openServe,
      backends.addButton,
      backends.available,
      pools.addButton,
      pools.available,
    ],
  );
  useProvidePageHeaderActions(headerActions);

  // A backend registered with a model-manager but serving nothing yet has no
  // group in the table; it gets a row of its own so it can be removed.
  const backendsWithoutModels = backends.renderBackendsWithoutModels(rows);

  // The controls that bring a backend or a serving layer to an installation,
  // side by side wherever the page has nothing to show yet.
  const addActions =
    backends.addButton || pools.addButton ? (
      <Flex gap="2">
        {backends.addButton}
        {pools.addButton}
      </Flex>
    ) : undefined;

  // No serving layer anywhere: the empty state (or the registered backends
  // that serve nothing yet). Rendered under the same <Content> as the table,
  // with the dialogs as its sibling in both cases, so Deploy turning the
  // first backend into a group does not remount the dialog mid-flow.
  const noServingLayer =
    installations.length === 0 && serving.unreachableInstallations.length === 0;
  // A serving layer with nothing registered yet: every model-manager in view
  // answers, none runs a backend (model-manager ships that way) and nothing
  // is served. Registering one is this page's job, so its empty state
  // carries the control.
  const noBackendYet =
    !noServingLayer &&
    !serving.isLoading &&
    rows.length === 0 &&
    !backendsWithoutModels &&
    serving.unreachableInstallations.length === 0 &&
    installations.every(name => backendsOn(serving, name).length === 0);
  let emptyBody: ReactNode;
  if (noServingLayer && serving.isLoading) {
    emptyBody = <Progress aria-label="Looking for a serving layer" />;
  } else if (noServingLayer) {
    emptyBody = backendsWithoutModels ?? (
      <EmptyState
        missing="data"
        title="No serving layer"
        description="None of the reachable installations has a serving layer this portal can see — KServe LLMInferenceServices, or a model-manager (Ollama, LM Studio, Lemonade, KServe). Model configs pointing at external endpoints work without one. A GPU node pool brings model serving to a cluster along with the capacity for it."
        action={addActions}
      />
    );
  } else if (noBackendYet) {
    emptyBody = (
      <EmptyState
        missing="data"
        title="No model backend yet"
        description={`model-manager on ${installations.join(
          ', ',
        )} is running with no backend registered, so nothing is served here yet. Register a backend you already run — Ollama, LM Studio, Lemonade or KServe — and its models appear on this page; a GPU node pool brings model serving to a cluster along with the capacity for it.`}
        action={addActions}
      />
    );
  }

  const stopDialogError =
    stopError?.message ??
    (stopping &&
    stoppingVia === 'llminferenceservice' &&
    !stopPermission.isLoading &&
    !stopPermission.allowed
      ? `Your account may not delete LLMInferenceService ${stopping.name} in ${stopping.namespace} on ${stopping.installation}, so the cluster would refuse this.`
      : undefined);

  let description =
    'Models served on the installations that have a serving layer — KServe LLMInferenceServices read from the cluster, or the inventory of a model-manager (Ollama, LM Studio, Lemonade, KServe). The model configs are how agents reach them.';
  if (canLoad || canPull || canImport) {
    description = `${description} ${[
      canLoad && 'Serve a model from a curated preset or stop one',
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
      {emptyBody ?? (
        <Flex direction="column" gap="3">
          <Text color="secondary">{description}</Text>

          {serving.isLoading && rows.length === 0 ? (
            <Progress aria-label="Loading served models" />
          ) : (
            <ServedModelsTable
              rows={rows}
              renderActions={
                hasActions || hasTimelines ? renderActions : undefined
              }
              renderGroupActions={
                backends.available ? backends.renderGroupActions : undefined
              }
            />
          )}
          {openedModel && (
            <ServedModelLifecyclePanel
              opened={openedModel}
              row={openedRow}
              onClose={closeOpenedModel}
            />
          )}

          {backendsWithoutModels}

          {pools.cachePanel}

          <UnreachableInstallationsAlert
            installations={serving.unreachableInstallations}
            resourceName="served models"
          />

          {downloadRows.errors.length > 0 && (
            <Alert
              status="warning"
              title="Downloads could not be read"
              description={downloadRows.errors
                .map(problem =>
                  installationErrorLine(problem.installation, problem.error),
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

          {(canLoad || isLoadOpen) && (
            <LoadModelDialog
              isOpen={isLoadOpen}
              onOpenChange={setLoadOpen}
              targets={loadTargets}
              models={servedModels}
              seed={loadSeed}
              onServed={onServed}
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
      )}
      {backends.dialogs}
      {pools.dialogs}
    </Content>
  );
}
