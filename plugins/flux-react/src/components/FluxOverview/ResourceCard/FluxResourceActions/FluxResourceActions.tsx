import { MouseEvent } from 'react';
import { alertApiRef, useApi } from '@backstage/core-plugin-api';
import { Box, Button, Flex } from '@backstage/ui';
import { Tooltip } from '@material-ui/core';
import PauseIcon from '@material-ui/icons/Pause';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import RefreshIcon from '@material-ui/icons/Refresh';
import {
  FluxObject,
  KubeObject,
  useFluxResourceActions,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { supportsFluxActions } from '../utils/fluxActions';

const SUSPENDED_HINT =
  'Suspended resources are not reconciled. Resume it first.';
const REQUEST_PENDING_HINT =
  'A reconciliation has been requested and is waiting to be picked up.';

function describe(resource: FluxObject): string {
  const namespace = resource.getNamespace();
  const name = resource.getName();

  return `${resource.getKind()} ${namespace ? `${namespace}/` : ''}${name}`;
}

function buildManagedSuspendHint(owners: string[]): string {
  const by = owners.length === 1 ? owners[0] : owners.join(' and ');

  return `spec.suspend is applied by ${by}, so a change made here would be reverted on the next reconciliation. Change it in Git instead.`;
}

const FluxResourceActionsContent = ({ resource }: { resource: FluxObject }) => {
  const alertApi = useApi(alertApiRef);
  const {
    canPatch,
    isCheckingPermission,
    requestReconciliation,
    setSuspended,
    isRequestingReconciliation,
    isSettingSuspended,
  } = useFluxResourceActions(resource);

  const isSuspended = resource.isSuspended();
  const label = describe(resource);

  // Keep Reconcile disabled from the click until the controller has picked the
  // request up. `isRequestingReconciliation` only covers the in-flight PATCH;
  // the resource's own annotation-vs-status comparison covers the gap after it,
  // and survives a reload or a request someone else made.
  const isReconcileRequestPending = resource.isReconcileRequestPending();

  let reconcileHint = '';
  if (isSuspended) {
    reconcileHint = SUSPENDED_HINT;
  } else if (isReconcileRequestPending) {
    reconcileHint = REQUEST_PENDING_HINT;
  }

  // Reconcile is deliberately *not* gated on declarative management: the
  // `reconcile.fluxcd.io/requestedAt` annotation is never part of an applied
  // manifest, so no apply-owner ever asserts or prunes it. Only `spec.suspend`
  // can be contested.
  const suspendFieldApplyOwners = resource.getSuspendFieldApplyOwners();
  const isSuspendFieldManaged = suspendFieldApplyOwners.length > 0;
  const suspendHint = isSuspendFieldManaged
    ? buildManagedSuspendHint(suspendFieldApplyOwners)
    : '';

  const notifyFailure = (error: unknown, action: string) => {
    const forbidden = error instanceof Error && error.name === 'ForbiddenError';

    alertApi.post({
      message: forbidden
        ? `You are not allowed to ${action} ${label} on cluster ${resource.cluster}.`
        : `Failed to ${action} ${label}. ${
            error instanceof Error ? error.message : ''
          }`.trim(),
      severity: 'error',
    });
  };

  const handleReconcile = async () => {
    try {
      await requestReconciliation();
      alertApi.post({
        message: `Reconciliation requested for ${label}.`,
        severity: 'success',
        display: 'transient',
      });
    } catch (error) {
      notifyFailure(error, 'reconcile');
    }
  };

  const handleToggleSuspended = async () => {
    const suspend = !isSuspended;

    try {
      await setSuspended(suspend);
      alertApi.post({
        message: suspend ? `Suspended ${label}.` : `Resumed ${label}.`,
        severity: 'success',
        display: 'transient',
      });
    } catch (error) {
      notifyFailure(error, suspend ? 'suspend' : 'resume');
    }
  };

  // Stop the click from bubbling up to any wrapping tree/list anchor so acting
  // on the resource doesn't also trigger navigation.
  const stopPropagation = (event: MouseEvent) => {
    event.stopPropagation();
  };

  // Render nothing until we know the user may write, so a read-only user never
  // sees buttons appear and then disappear.
  if (isCheckingPermission || !canPatch) {
    return null;
  }

  return (
    <Box onClick={stopPropagation}>
      <Flex align="center" gap="2">
        {/*
          A disabled react-aria button sets the `disabled` attribute and so
          receives no hover events, which means the bui Tooltip would never
          appear. The MUI v4 Tooltip wrapped around a plain span is the
          documented way to explain a disabled control.
        */}
        <Tooltip title={reconcileHint}>
          <span>
            <Button
              variant="secondary"
              size="small"
              iconStart={<RefreshIcon fontSize="small" />}
              isDisabled={isSuspended || isReconcileRequestPending}
              isPending={isRequestingReconciliation}
              onPress={handleReconcile}
            >
              Reconcile
            </Button>
          </span>
        </Tooltip>
        <Tooltip title={suspendHint}>
          <span>
            <Button
              variant="secondary"
              size="small"
              iconStart={
                isSuspended ? (
                  <PlayArrowIcon fontSize="small" />
                ) : (
                  <PauseIcon fontSize="small" />
                )
              }
              isDisabled={isSuspendFieldManaged}
              isPending={isSettingSuspended}
              onPress={handleToggleSuspended}
            >
              {isSuspended ? 'Resume' : 'Suspend'}
            </Button>
          </span>
        </Tooltip>
      </Flex>
    </Box>
  );
};

/**
 * Reconcile and suspend/resume buttons for the Flux resources that support
 * them, shown only to users whose cluster RBAC allows the write.
 */
export const FluxResourceActions = ({ resource }: { resource: KubeObject }) => {
  // Guard before the inner component mounts so unsupported kinds (e.g.
  // ImagePolicy) issue no access review at all.
  if (!supportsFluxActions(resource)) {
    return null;
  }

  return <FluxResourceActionsContent resource={resource} />;
};
