import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { JSX } from 'react';
import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { Button, Flex, Text } from '@backstage/ui';
import AddIcon from '@material-ui/icons/Add';
import {
  applyInstallationScope,
  useInstallations,
  useInstallationScope,
} from '@giantswarm/backstage-plugin-gs';

import { useOpenHostingFlow } from '../../hooks/useHostingFlow';
import { useModelManagerInstallations } from '../../hooks/useModelManagerInstallations';
import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';
import { useReachableInstallations } from '../../hooks/useReachableInstallations';
import { useRegisteredBackends } from '../../hooks/useModelManagerBackends';
import {
  backendsWithoutModels,
  describeBackendSource,
  isBackendKind,
  type BackendKind,
} from '../../lib/modelManagerBackends';
import type { ServedModel, ServingBackend } from '../../lib/serving';
import { addModelBackendRouteRef } from '../../routes';
import {
  groupOfBackend,
  type ServedModelGroup,
} from '../ServingPage/ServedModelsTable';
import { RemoveModelBackendDialog } from './RemoveModelBackendDialog';

/** Long enough to read two lines, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

export type ModelBackendControls = {
  /** Some reachable installation has a model-manager the person can write to. */
  available: boolean;
  /** The empty-state button, or `undefined` when nothing offers it. */
  addButton: JSX.Element | undefined;
  /**
   * Opens Add model backend's page — for a page header's action — or
   * `undefined` when nothing offers it.
   */
  openAdd: (() => void) | undefined;
  /** The Remove backend dialog; render once on the page. */
  dialogs: ReactNode;
  /**
   * The trailing part of a Serving group's header: the backend's source and
   * **Remove backend** — for a group whose backend is registered with a
   * model-manager; nothing for a CR-only KServe group.
   */
  renderGroupActions: (group: {
    installation: string;
    backend: ServingBackend;
    rows: Pick<ServedModel, 'name' | 'displayName'>[];
  }) => ReactNode;
  /**
   * The registered backends that have no group among `present` (the table's
   * (installation, backend) pairs) — a KServe without a pool, an Ollama
   * before its first pull — as groups without rows ({@link groupOfBackend});
   * their headers get the source and Remove backend from
   * `renderGroupActions`. Empty when every registered backend serves
   * something.
   */
  groupsWithoutModels: (
    present: readonly { installation: string; backend: string }[],
  ) => ServedModelGroup[];
};

export type ModelBackendTargets = {
  /** Some reachable installation has a model-manager the person can write to. */
  available: boolean;
  /** The installations in scope whose muster lists model-manager. */
  installations: string[];
  /** Some installation's server list is still being read. */
  isLoading: boolean;
  /** The registered backends of those installations. */
  registered: ReturnType<typeof useRegisteredBackends>;
  /** The kinds already registered (or static) on an installation. */
  registeredKinds: (installation: string) => BackendKind[];
};

/**
 * Where a model backend can be added: every reachable installation in scope
 * whose muster lists model-manager (`useModelManagerInstallations`, the
 * serving source's own gate — so an installation without one is never
 * offered, and one whose model-manager has no backend yet is offered
 * although it has no group); the muster plugin is how the tools are reached
 * as the person. Reads the registered backends once for the source labels,
 * the kinds still free and the Remove confirm. Shared by the Serving view
 * and Add model backend's page.
 */
export function useModelBackendTargets(): ModelBackendTargets {
  const musterApi = useMusterPluginApi();
  const { installations: configured } = useInstallations();
  const { scope } = useInstallationScope();
  const { installations: reachable } = useReachableInstallations(
    configured.map(installation => installation.name),
  );
  const reachableInstallations = applyInstallationScope(reachable, scope);
  const { installations, isLoading } = useModelManagerInstallations(
    reachableInstallations,
  );
  const registered = useRegisteredBackends(installations);
  const available = Boolean(musterApi) && installations.length > 0;

  const registeredKinds = useCallback(
    (installation: string) =>
      registered.backends
        .filter(backend => backend.installation === installation)
        .map(backend => backend.kind),
    [registered.backends],
  );

  return { available, installations, isLoading, registered, registeredKinds };
}

/**
 * Add model backend and Remove backend for the Serving page, over the
 * installations {@link useModelBackendTargets} offers. Add opens the flow's
 * own page (`AddModelBackendPage`); Remove is a confirm dialog here.
 */
export function useModelBackendControls(): ModelBackendControls {
  const { available, registered } = useModelBackendTargets();
  const toastApi = useApi(toastApiRef);
  const [removing, setRemoving] = useState<{
    installation: string;
    kind: BackendKind;
    servedModels: string[];
  }>();

  const openFlow = useOpenHostingFlow();
  const addBackendRoute = useRouteRef(addModelBackendRouteRef);
  const openAddPage = useCallback(() => {
    if (addBackendRoute) {
      openFlow(addBackendRoute());
    }
  }, [openFlow, addBackendRoute]);
  const openAdd = available ? openAddPage : undefined;
  const addButton = useMemo(
    () =>
      available ? (
        <Button
          variant="secondary"
          iconStart={<AddIcon />}
          onPress={openAddPage}
        >
          Add model backend
        </Button>
      ) : undefined,
    [available, openAddPage],
  );

  const dialogs =
    available && removing ? (
      <RemoveModelBackendDialog
        installation={removing.installation}
        kind={removing.kind}
        servedModels={removing.servedModels}
        isOpen
        onOpenChange={open => {
          if (!open) {
            setRemoving(undefined);
          }
        }}
        onRemoved={result =>
          toastApi.post({
            title: `Removed the ${removing.kind} backend from ${removing.installation}`,
            description: `${
              result.unwired && result.unwired.length > 0
                ? `Model configs unwired: ${result.unwired.join(', ')}.`
                : 'No model configs had to be unwired.'
            } Its group leaves this page; the backend itself keeps running where it is.`,
            status: 'success',
            timeout: TOAST_TIMEOUT_MS,
          })
        }
      />
    ) : null;

  const renderGroupActions = useCallback<
    ModelBackendControls['renderGroupActions']
  >(
    group => {
      if (!available || !isBackendKind(group.backend)) {
        return null;
      }
      const backend = registered.find(group.installation, group.backend);
      if (!backend) {
        return null;
      }
      const source = describeBackendSource(backend.source);
      // A static backend is the chart's: model-manager refuses to remove it,
      // so the action is not offered; the label says whose it is.
      const removable =
        backend.source === 'person' || backend.source === 'cluster-manager';
      return (
        <Flex align="center" gap="2">
          {source && (
            <Text as="span" variant="body-small" color="secondary">
              {source}
            </Text>
          )}
          {removable && (
            <Button
              size="small"
              variant="secondary"
              onPress={() =>
                setRemoving({
                  installation: group.installation,
                  kind: group.backend as BackendKind,
                  servedModels: group.rows.map(
                    row => row.displayName ?? row.name,
                  ),
                })
              }
            >
              Remove backend
            </Button>
          )}
        </Flex>
      );
    },
    [available, registered],
  );

  const groupsWithoutModels = useCallback<
    ModelBackendControls['groupsWithoutModels']
  >(
    present =>
      available
        ? backendsWithoutModels(registered.backends, present).map(
            groupOfBackend,
          )
        : [],
    [available, registered.backends],
  );

  return {
    available,
    addButton,
    openAdd,
    dialogs,
    renderGroupActions,
    groupsWithoutModels,
  };
}
