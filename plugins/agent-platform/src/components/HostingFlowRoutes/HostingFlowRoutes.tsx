import { useCallback, useMemo, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { Alert } from '@backstage/ui';
import {
  LoadingIndicator,
  WizardFrame,
} from '@giantswarm/backstage-plugin-ui-react';

import { useClusterManagerAvailability } from '../../hooks/useClusterManager';
import { useHostingFlowReturn } from '../../hooks/useHostingFlow';
import { useServeIntents } from '../../hooks/useServeIntents';
import type { NodePoolWriteResult } from '../../lib/clusterManager';
import type { ModelManagerLoadAnswer } from '../../lib/modelManager';
import type { AddBackendResult } from '../../lib/modelManagerBackends';
import {
  describeLoadAnswer,
  loadAnswerNodes,
  parseServeSeed,
} from '../../lib/modelManagerServe';
import type { ServeChoice } from '../../lib/serveIntent';
import { gpuCapacityRouteRef, servingRouteRef } from '../../routes';
import {
  AddGpuNodePoolPage,
  OPENED_POOL_KEY,
  openedPoolOf,
} from '../GpuNodePools';
import { AddModelBackendPage, useModelBackendTargets } from '../ModelBackends';
import { HOSTING_FLOW_CONTEXT } from '../ModelHostingActions';
import {
  describeLoadTarget,
  ImportModelPage,
  PullModelPage,
  ServeModelPage,
  type LoadTarget,
} from '../ModelManagerControls';
import { useServing } from '../ServingProvider';
import { OPENED_SERVED_MODEL_KEY, useServingTargets } from '../ServingPage';

/** Long enough to read two lines, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

/**
 * A hosting flow's frame while what it offers is read, or once nothing turns
 * out to offer it: the flow's title and Cancel in place, the reason as the
 * step. Otherwise the flow itself.
 */
function HostingFlowGate({
  title,
  closeHref,
  isLoading,
  unavailable,
  children,
}: {
  title: string;
  closeHref: string;
  isLoading: boolean;
  /** Why nothing offers the flow, once nothing does. */
  unavailable: string | undefined;
  children: ReactNode;
}) {
  if (!isLoading && !unavailable) {
    return <>{children}</>;
  }
  return (
    <WizardFrame
      title={title}
      context={HOSTING_FLOW_CONTEXT}
      closeHref={closeHref}
      width="medium"
    >
      {unavailable && !isLoading ? (
        <Alert status="info" description={unavailable} />
      ) : (
        <LoadingIndicator label="Reading the environments…" />
      )}
    </WizardFrame>
  );
}

/** The Serving view's path: where the serving flows return and land. */
function useServingHref(): string {
  const servingRoute = useRouteRef(servingRouteRef);
  return servingRoute?.() ?? '/';
}

/**
 * Serve model's route (`/agent-platform/models/serving/serve`): the backends
 * that can load, the seed from the query, and — once model-manager accepted
 * the load — a toast and the Serving view, opened on the served model's
 * timeline.
 */
export function ServeModelRoute() {
  const serving = useServing();
  const { loadTargets } = useServingTargets();
  const [searchParams] = useSearchParams();
  const seed = useMemo(() => parseServeSeed(searchParams), [searchParams]);
  const servingHref = useServingHref();
  const closeHref = useHostingFlowReturn(servingHref);
  const navigate = useNavigate();
  const toastApi = useApi(toastApiRef);

  const onServed = useCallback(
    (target: LoadTarget, answer: ModelManagerLoadAnswer) => {
      const nodes = loadAnswerNodes(answer).join(', ');
      const where = `${describeLoadTarget(target)}${nodes ? ` · ${nodes}` : ''}`;
      toastApi.post(
        answer.alreadyServing
          ? {
              title: `"${answer.name}" already serves on ${where}`,
              description:
                'Nothing was started: model-manager serves each preset once. Stop it first to serve it on another node.',
              status: 'info',
              timeout: TOAST_TIMEOUT_MS,
            }
          : {
              title: `Serving "${answer.name}" on ${where}`,
              description:
                describeLoadAnswer(answer) ||
                'model-manager is starting it; its status follows in the list.',
              status: 'success',
              timeout: TOAST_TIMEOUT_MS,
            },
      );
      // The timeline follows the object model-manager composed; the row
      // arrives with the next inventory read.
      navigate(servingHref, {
        state: {
          [OPENED_SERVED_MODEL_KEY]: {
            installation: target.name,
            name: answer.running?.resource ?? answer.name,
          },
        },
      });
    },
    [toastApi, navigate, servingHref],
  );

  return (
    <HostingFlowGate
      title="Serve model"
      closeHref={closeHref}
      isLoading={serving.isLoading && loadTargets.length === 0}
      unavailable={
        loadTargets.length === 0
          ? 'No backend can serve a model yet. Add a model backend or a GPU node pool first.'
          : undefined
      }
    >
      <ServeModelPage
        targets={loadTargets}
        models={serving.servedModels}
        seed={seed}
        closeHref={closeHref}
        onServed={onServed}
      />
    </HostingFlowGate>
  );
}

/** Import from Hugging Face's route (`/agent-platform/models/serving/import`). */
export function ImportModelRoute() {
  const serving = useServing();
  const { importTargets } = useServingTargets();
  const servingHref = useServingHref();
  const closeHref = useHostingFlowReturn(servingHref);
  const navigate = useNavigate();
  const onImported = useCallback(
    () => navigate(servingHref),
    [navigate, servingHref],
  );

  return (
    <HostingFlowGate
      title="Import from Hugging Face"
      closeHref={closeHref}
      isLoading={serving.isLoading && importTargets.length === 0}
      unavailable={
        importTargets.length === 0
          ? 'No backend in reach can import models from Hugging Face.'
          : undefined
      }
    >
      <ImportModelPage
        targets={importTargets}
        closeHref={closeHref}
        onImported={onImported}
      />
    </HostingFlowGate>
  );
}

/** Pull model's route (`/agent-platform/models/serving/pull`). */
export function PullModelRoute() {
  const serving = useServing();
  const { pullTargets } = useServingTargets();
  const servingHref = useServingHref();
  const closeHref = useHostingFlowReturn(servingHref);
  const navigate = useNavigate();
  const onPulled = useCallback(
    () => navigate(servingHref),
    [navigate, servingHref],
  );

  return (
    <HostingFlowGate
      title="Pull model"
      closeHref={closeHref}
      isLoading={serving.isLoading && pullTargets.length === 0}
      unavailable={
        pullTargets.length === 0
          ? 'No backend in reach can pull models by reference.'
          : undefined
      }
    >
      <PullModelPage
        targets={pullTargets}
        closeHref={closeHref}
        onPulled={onPulled}
      />
    </HostingFlowGate>
  );
}

/**
 * Add model backend's route (`/agent-platform/models/serving/add-backend`):
 * the installations whose muster lists model-manager, and — after a Deploy —
 * a toast and the Serving view, where the backend's group appears.
 */
export function AddModelBackendRoute() {
  const { available, installations, isLoading, registeredKinds } =
    useModelBackendTargets();
  const servingHref = useServingHref();
  const closeHref = useHostingFlowReturn(servingHref);
  const navigate = useNavigate();
  const toastApi = useApi(toastApiRef);
  const onDeployed = useCallback(
    (installation: string, result: AddBackendResult) => {
      toastApi.post({
        title: `Registered ${result.configMap.name} on ${installation}`,
        description:
          'model-manager reads the backend document; its models appear as the inventory answers.',
        status: 'success',
        timeout: TOAST_TIMEOUT_MS,
      });
      navigate(servingHref);
    },
    [toastApi, navigate, servingHref],
  );

  return (
    <HostingFlowGate
      title="Add model backend"
      closeHref={closeHref}
      isLoading={isLoading && !available}
      unavailable={
        available
          ? undefined
          : 'No environment in reach runs model-manager, so no backend can be added.'
      }
    >
      <AddModelBackendPage
        installations={installations}
        registeredKinds={registeredKinds}
        closeHref={closeHref}
        onDeployed={onDeployed}
      />
    </HostingFlowGate>
  );
}

/**
 * Add GPU node pool's route (`/agent-platform/models/capacity/add-pool`): the
 * installations whose muster lists cluster-manager, and — after a complete
 * Deploy — the GPU pools view, opened on the pool's lifecycle panel. A preset
 * chosen to serve becomes the pool's serve intent (a Deploy without one
 * clears an older pool's, so a re-created pool never inherits a choice).
 */
export function AddGpuNodePoolRoute() {
  const serving = useServing();
  const availability = useClusterManagerAvailability(
    serving.reachableInstallations ?? [],
  );
  const capacityRoute = useRouteRef(gpuCapacityRouteRef);
  const capacityHref = capacityRoute?.() ?? '/';
  const closeHref = useHostingFlowReturn(capacityHref);
  const navigate = useNavigate();
  const intents = useServeIntents();
  const onDeployed = useCallback(
    (
      result: NodePoolWriteResult,
      installation: string,
      serve?: ServeChoice,
    ) => {
      const pool = openedPoolOf(installation, result);
      if (serve) {
        intents.record(pool, serve);
      } else {
        intents.remove([pool.id]);
      }
      navigate(capacityHref, { state: { [OPENED_POOL_KEY]: pool } });
    },
    [intents, navigate, capacityHref],
  );
  const available = availability.available.length > 0;

  return (
    <HostingFlowGate
      title="Add GPU node pool"
      closeHref={closeHref}
      isLoading={availability.isLoading && !available}
      unavailable={
        available
          ? undefined
          : 'No environment in reach runs cluster-manager, so no GPU node pool can be added.'
      }
    >
      <AddGpuNodePoolPage
        installations={availability.available}
        closeHref={closeHref}
        onDeployed={onDeployed}
      />
    </HostingFlowGate>
  );
}
