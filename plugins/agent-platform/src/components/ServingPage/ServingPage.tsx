import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { Alert, Flex, Text } from '@backstage/ui';
import AddIcon from '@material-ui/icons/Add';
import CloudDownloadIcon from '@material-ui/icons/CloudDownload';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import SearchIcon from '@material-ui/icons/Search';
import {
  LLMInferenceService,
  useSelfSubjectAccessReview,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  EmptyStateCard,
  LoadingIndicator,
  useProvidePageHeaderActions,
} from '@giantswarm/backstage-plugin-ui-react';
import { installationErrorLine } from '@giantswarm/backstage-plugin-muster';

import { ShellAwareContent } from '../ShellAwareContent';
import { useDownloadRows, withDownloadRows } from '../../hooks/useDownloadRows';
import {
  useHostingFlowOutcome,
  useOpenHostingFlow,
} from '../../hooks/useHostingFlow';
import {
  useStopServedModel,
  type StopServedModelVia,
} from '../../hooks/useStopServedModel';
import {
  isLegacyServeLink,
  parseServeSeed,
  serveSeedSearch,
} from '../../lib/modelManagerServe';
import { backendsOn, type ServedModel } from '../../lib/serving';
import {
  importModelRouteRef,
  pullModelRouteRef,
  serveModelRouteRef,
} from '../../routes';
import {
  DownloadRowActions,
  hasRowActions,
  ServedModelActions,
} from '../ModelManagerControls';
import { useGpuNodePoolControls } from '../GpuNodePools';
import { useModelBackendControls } from '../ModelBackends';
import {
  ModelHostingActions,
  type HostingAction,
} from '../ModelHostingActions';
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
  type ServedModelGroup,
  type ServedModelRow,
} from './ServedModelsTable';
import { StopServedModelDialog } from './StopServedModelDialog';
import { useServingTargets } from './useServingTargets';

/**
 * The router-state key under which Serve model hands the served model it
 * started to the Serving view, which opens its timeline
 * (`useHostingFlowOutcome`).
 */
export const OPENED_SERVED_MODEL_KEY = 'openedServedModel';

/** An {@link OpenedServedModel} as the router state carries it, or `undefined`. */
function parseOpenedServedModel(value: unknown): OpenedServedModel | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const { installation, name } = value as Record<string, unknown>;
  return typeof installation === 'string' && typeof name === 'string'
    ? { installation, name }
    : undefined;
}

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
 * shared page header, like "Connect a model" on the Model configs view, and
 * each opens its flow's own page (`ServeModelPage`, `ImportModelPage`,
 * `PullModelPage`; an older release's `?serve=1` link is forwarded to Serve
 * model's).
 *
 * Every control and panel keys off the installation's `ServingCapabilities`
 * (the model-manager source's flags), never off a backend's name. `pull` puts
 * the Pull button here and the pulls themselves into the table — a download
 * is a row where its model will land, with its progress as the status and
 * Cancel (or, once failed, Retry / Dismiss) as its menu (useDownloadRows) —
 * with `search` it becomes the Hugging Face import (search, size and fit
 * check against a node, pre-warm download); `load` is the Serve: on a GPU
 * pool the kserve backend's presets, `check_fit` and one `load_model` over
 * muster as the person (ServeModelPage) — model-manager composes the
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
    serving.scope,
  );
  const toastApi = useApi(toastApiRef);
  const { capabilitiesFor, pullTargets, importTargets, loadTargets } =
    useServingTargets();
  const { loadingFor } = serving;

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
  // registered: presets, `check_fit` and `load_model` over muster, on Serve
  // model's page. The one Serve there is.
  const canLoad = loadTargets.length > 0;
  const openFlow = useOpenHostingFlow();
  const serveRoute = useRouteRef(serveModelRouteRef);
  const importRoute = useRouteRef(importModelRouteRef);
  const pullRoute = useRouteRef(pullModelRouteRef);

  // The served model whose step timeline is open: Serve's answer opens it on
  // the object model-manager composed (handed over by Serve model's page), a
  // row's chevron on that row.
  const served = useHostingFlowOutcome(
    OPENED_SERVED_MODEL_KEY,
    parseOpenedServedModel,
  );
  const [openedModel, setOpenedModel] = useState<OpenedServedModel | undefined>(
    served,
  );
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

  // An older release's pool link opened the Serve dialog here
  // (`?serve=1&installation=…&cluster=…&pool=…&preset=…`); it is forwarded
  // to Serve model's page with the same seed.
  const [searchParams] = useSearchParams();
  const legacyServeLink = isLegacyServeLink(searchParams);

  const openServe = useCallback(() => {
    if (serveRoute) {
      openFlow(serveRoute());
    }
  }, [openFlow, serveRoute]);

  /** "Serve…" on a cached download: Serve model starts on its installation and preset. */
  const openServeFor = useCallback(
    (row: ServedModel) => {
      if (serveRoute) {
        openFlow(
          `${serveRoute()}${serveSeedSearch({
            installation: row.installation,
            backend: row.backend,
            model: row.preset ?? row.name,
          })}`,
        );
      }
    },
    [openFlow, serveRoute],
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

  // Which opened model model-manager has listed: once it no longer does, its
  // panel says it is gone rather than not there yet.
  const [seenModel, setSeenModel] = useState<OpenedServedModel>();
  useEffect(() => {
    if (openedModel && openedRow) {
      setSeenModel(openedModel);
    }
  }, [openedModel, openedRow]);

  // The opened model's steps sit in its group's card, under the table; until
  // its row arrives (right after Serve), or once it is gone, under the cards.
  const lifecyclePanel = openedModel ? (
    <ServedModelLifecyclePanel
      opened={openedModel}
      row={openedRow}
      seen={
        seenModel !== undefined && isOpenedServedModel(openedModel, seenModel)
      }
      onClose={closeOpenedModel}
    />
  ) : null;
  const renderGroupDetail = (group: ServedModelGroup) =>
    openedRow && group.rows.includes(openedRow) ? lifecyclePanel : null;

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

  // The view's actions go to the shared page header, top right, in the
  // standard places (ModelHostingActions): Serve model the primary, getting a
  // model onto a backend beside it, adding a backend or capacity in the ⋯
  // menu. Memoized so the header slot only updates when what is offered
  // changes; `null` clears the slot when nothing is.
  const { openAdd: openAddBackend } = backends;
  const { addAction: poolAddAction } = pools;
  const headerActions = useMemo(() => {
    const serve: HostingAction | undefined = canLoad
      ? {
          id: 'serve',
          label: 'Serve model',
          icon: <PlayArrowIcon />,
          onAction: openServe,
        }
      : undefined;
    const importModel: HostingAction | undefined = canImport
      ? {
          id: 'import',
          label: 'Import from Hugging Face',
          icon: <SearchIcon />,
          onAction: () => importRoute && openFlow(importRoute()),
        }
      : undefined;
    const pullModel: HostingAction | undefined = canPull
      ? {
          id: 'pull',
          label: 'Pull model',
          icon: <CloudDownloadIcon />,
          onAction: () => pullRoute && openFlow(pullRoute()),
        }
      : undefined;
    const addBackend: HostingAction | undefined = openAddBackend
      ? {
          id: 'add-backend',
          label: 'Add model backend',
          icon: <AddIcon />,
          onAction: openAddBackend,
        }
      : undefined;
    const addPool: HostingAction | undefined = poolAddAction
      ? {
          id: 'add-pool',
          label: 'Add GPU node pool',
          icon: <AddIcon />,
          onAction: poolAddAction.open,
          isDisabled: poolAddAction.isDisabled,
        }
      : undefined;
    // The import is the richer way to get a model; a plain pull is the
    // secondary where nothing imports.
    const secondary = importModel ?? pullModel;
    const more = [
      importModel ? pullModel : undefined,
      addBackend,
      addPool,
    ].filter((action): action is HostingAction => Boolean(action));
    return serve || secondary || more.length > 0 ? (
      <ModelHostingActions primary={serve} secondary={secondary} more={more} />
    ) : null;
  }, [
    canLoad,
    canPull,
    canImport,
    openServe,
    openAddBackend,
    poolAddAction,
    openFlow,
    importRoute,
    pullRoute,
  ]);
  useProvidePageHeaderActions(headerActions);

  // A backend registered with a model-manager but serving nothing yet has no
  // rows; it gets a card of its own, in order among the others, so it can be
  // removed.
  const { groupsWithoutModels } = backends;
  const emptyGroups = useMemo(
    () => groupsWithoutModels(rows),
    [groupsWithoutModels, rows],
  );
  const servedModelsTable = (
    <ServedModelsTable
      rows={rows}
      emptyGroups={emptyGroups}
      renderActions={hasActions || hasTimelines ? renderActions : undefined}
      renderGroupActions={
        backends.available ? backends.renderGroupActions : undefined
      }
      renderGroupDetail={renderGroupDetail}
    />
  );

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
  // that serve nothing yet). Rendered under the same content area as the
  // table, with the Remove dialogs as its sibling in both cases, so a group
  // turning into the empty state does not remount an open dialog.
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
    emptyGroups.length === 0 &&
    serving.unreachableInstallations.length === 0 &&
    installations.every(name => backendsOn(serving, name).length === 0);
  let emptyBody: ReactNode;
  if (noServingLayer && serving.isLoading) {
    emptyBody = <LoadingIndicator label="Reading the serving layer…" />;
  } else if (noServingLayer) {
    emptyBody =
      emptyGroups.length > 0 ? (
        servedModelsTable
      ) : (
        <EmptyStateCard
          title="No serving layer"
          description="No environment in reach runs KServe or model-manager. Models on external endpoints work without one; a GPU node pool adds serving to a cluster."
          actions={addActions}
        />
      );
  } else if (noBackendYet) {
    emptyBody = (
      <EmptyStateCard
        title="No model backend yet"
        description={`model-manager on ${installations.join(
          ', ',
        )} has no backend registered. Register one you already run — Ollama, LM Studio, Lemonade or KServe — or add a GPU node pool.`}
        actions={addActions}
      />
    );
  }

  const stopDialogError =
    stopError?.message ??
    (stopping &&
    stoppingVia === 'llminferenceservice' &&
    !stopPermission.isLoading &&
    !stopPermission.allowed
      ? `Your account may not delete LLMInferenceService ${stopping.name} in ${stopping.namespace} on ${stopping.installation}.`
      : undefined);

  let description = 'Agents reach these models through their model configs.';
  if (canLoad || canPull || canImport) {
    description = `${description} Serving a model here creates its model config.`;
  }

  if (legacyServeLink && serveRoute) {
    return (
      <Navigate
        to={`${serveRoute()}${serveSeedSearch(parseServeSeed(searchParams))}`}
        replace
      />
    );
  }

  return (
    <ShellAwareContent>
      {emptyBody ?? (
        <Flex direction="column" gap="3">
          <Text color="secondary">{description}</Text>

          {serving.isLoading && rows.length === 0 ? (
            <LoadingIndicator label="Reading the served models…" />
          ) : (
            servedModelsTable
          )}
          {!openedRow && lifecyclePanel}

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
    </ShellAwareContent>
  );
}
