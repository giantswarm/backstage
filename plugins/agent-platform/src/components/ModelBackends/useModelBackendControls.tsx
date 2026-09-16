import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { JSX } from 'react';
import { toastApiRef, useApi } from '@backstage/frontend-plugin-api';
import { Button, Flex, Text } from '@backstage/ui';
import AddIcon from '@material-ui/icons/Add';
import {
  applyInstallationScope,
  useInstallations,
  useInstallationScope,
} from '@giantswarm/backstage-plugin-gs';

import { useModelManagerInstallations } from '../../hooks/useModelManagerInstallations';
import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';
import { useReachableInstallations } from '../../hooks/useReachableInstallations';
import {
  useRegisteredBackends,
  type RegisteredBackend,
} from '../../hooks/useModelManagerBackends';
import {
  backendsWithoutModels,
  describeBackendSource,
  isBackendKind,
  type BackendKind,
} from '../../lib/modelManagerBackends';
import type { ServedModel, ServingBackend } from '../../lib/serving';
import { AddModelBackendDialog } from './AddModelBackendDialog';
import { BackendsWithoutModels } from './BackendsWithoutModels';
import { RemoveModelBackendDialog } from './RemoveModelBackendDialog';

/** Long enough to read two lines, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

export type ModelBackendControls = {
  /** Some reachable installation has a model-manager the person can write to. */
  available: boolean;
  /** The header / empty-state button, or `undefined` when nothing offers it. */
  addButton: JSX.Element | undefined;
  /** The dialogs; render once on the page. */
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
   * (installation, backend) pairs) as rows of their own — a KServe without a
   * pool, an Ollama before its first pull — each with its source and Remove
   * backend; `null` when every registered backend serves something.
   */
  renderBackendsWithoutModels: (
    present: readonly { installation: string; backend: string }[],
  ) => ReactNode;
};

/**
 * Add model backend and Remove backend for the Serving page, over every
 * reachable installation in scope whose backend proxies a model-manager
 * (`useModelManagerInstallations`, the serving source's own gate — so a portal
 * without one never offers the dialog, and an installation whose
 * model-manager has no backend yet is offered although it has no group) and
 * the muster plugin, which is how the tools are reached as the person. Reads
 * the registered backends once for the source labels, the kinds still free
 * and the Remove confirm.
 */
export function useModelBackendControls(): ModelBackendControls {
  const musterApi = useMusterPluginApi();
  const { installations: configured } = useInstallations();
  const { scope } = useInstallationScope();
  const { installations: reachable } = useReachableInstallations(
    configured.map(installation => installation.name),
  );
  const reachableInstallations = applyInstallationScope(reachable, scope);
  const { installations } = useModelManagerInstallations(
    reachableInstallations,
  );
  const registered = useRegisteredBackends(installations);
  const toastApi = useApi(toastApiRef);
  const [isAddOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<{
    installation: string;
    kind: BackendKind;
    servedModels: string[];
  }>();

  const available = Boolean(musterApi) && installations.length > 0;

  const registeredKinds = useCallback(
    (installation: string) =>
      registered.backends
        .filter(backend => backend.installation === installation)
        .map(backend => backend.kind),
    [registered.backends],
  );

  const addButton = useMemo(
    () =>
      available ? (
        <Button
          variant="secondary"
          iconStart={<AddIcon />}
          onPress={() => setAddOpen(true)}
        >
          Add model backend
        </Button>
      ) : undefined,
    [available],
  );

  const dialogs = available ? (
    <>
      <AddModelBackendDialog
        installations={installations}
        registeredKinds={registeredKinds}
        isOpen={isAddOpen}
        onOpenChange={setAddOpen}
        onDeployed={(installation, result) =>
          toastApi.post({
            title: `Registered ${result.configMap.name} on ${installation}`,
            description:
              'model-manager reads the backend document; its models appear here as the inventory answers.',
            status: 'success',
            timeout: TOAST_TIMEOUT_MS,
          })
        }
      />
      {removing && (
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
          onRemoved={() =>
            toastApi.post({
              title: `Removed the ${removing.kind} backend from ${removing.installation}`,
              description:
                'Its model configs are unwired and its group leaves this page; the backend itself keeps running where it is.',
              status: 'success',
              timeout: TOAST_TIMEOUT_MS,
            })
          }
        />
      )}
    </>
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
              variant="tertiary"
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

  const renderBackendsWithoutModels = useCallback<
    ModelBackendControls['renderBackendsWithoutModels']
  >(
    present => {
      if (!available) {
        return null;
      }
      const backends = backendsWithoutModels(registered.backends, present);
      if (backends.length === 0) {
        return null;
      }
      return (
        <BackendsWithoutModels
          backends={backends}
          showInstallation={installations.length > 1}
          renderActions={(backend: RegisteredBackend) =>
            renderGroupActions({
              installation: backend.installation,
              backend: backend.kind,
              rows: [],
            })
          }
        />
      );
    },
    [available, installations.length, registered.backends, renderGroupActions],
  );

  return {
    available,
    addButton,
    dialogs,
    renderGroupActions,
    renderBackendsWithoutModels,
  };
}
