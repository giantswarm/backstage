import {
  StatusAborted,
  StatusError,
  StatusOK,
  StatusWarning,
} from '@backstage/core-components';

type StatusComponentProps = {
  status: string;
  value?: number;
};

export const StatusComponent = ({ status, value }: StatusComponentProps) => {
  switch (status) {
    case 'pass':
      return <StatusOK>{value ?? 'PASS'}</StatusOK>;
    case 'error':
      return <StatusError>{value ?? 'ERROR'}</StatusError>;
    case 'fail':
      return <StatusError>{value ?? 'FAIL'}</StatusError>;
    case 'skip':
      return <StatusAborted>{value ?? 'SKIP'}</StatusAborted>;
    case 'warn':
      return <StatusWarning>{value ?? 'WARN'}</StatusWarning>;
    default:
      return null;
  }
};
