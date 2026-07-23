import { Badge, Box } from '@backstage/ui';
import { Status } from '../../../UI/Status';
import { FluxResourceStatus } from '@giantswarm/backstage-plugin-kubernetes-react';

const STATUS_DOT_COLOR: Record<'ok' | 'error' | 'aborted', string> = {
  ok: 'var(--bui-fg-success)',
  error: 'var(--bui-fg-danger)',
  aborted: 'var(--bui-fg-secondary)',
};

type ResourceStatusProps = FluxResourceStatus & {
  emphasized?: boolean;
};

export const ResourceStatus = ({
  readyStatus,
  isDependencyNotReady,
  isReconciling,
  isSuspended,
  emphasized = false,
}: ResourceStatusProps) => {
  let elText = 'Unknown';
  let elStatus: 'aborted' | 'ok' | 'error' = 'aborted';
  if (readyStatus === 'True') {
    elText = 'Ready';
    elStatus = 'ok';
  } else if (readyStatus === 'False' && !isDependencyNotReady) {
    elText = 'Not ready';
    elStatus = 'error';
  } else if (readyStatus === 'False' && isDependencyNotReady) {
    elText = 'Not ready (dep)';
    elStatus = 'error';
  }
  if (isReconciling) {
    elText += ', reconciling';
  }

  if (isSuspended) {
    elText = 'Suspended';
    elStatus = 'aborted';
  }

  if (emphasized) {
    return (
      <Badge
        size="medium"
        icon={
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: STATUS_DOT_COLOR[elStatus],
            }}
          />
        }
      >
        {elText}
      </Badge>
    );
  }

  return (
    <Box style={{ whiteSpace: 'nowrap' }}>
      <Status text={elText} status={elStatus} />
    </Box>
  );
};
