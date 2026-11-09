import { ServerPageRow, selectRepresentative } from '../../lib/serverGrouping';
import { useMusterIcon } from './useMusterIcon';

/**
 * The icon a connector's logo (`ConnectorLogo`) shows, by one rule for every
 * surface: muster's own row the icon muster announces (`useMusterIcon`), a
 * singular server its MCPServer's `.status.icon`, a family its representative
 * instance's (the active installation's own, else a connected one). Unchecked:
 * `ConnectorLogo` decides whether it is shown. Session-scoped for muster's
 * row, so callers disable it without a muster session.
 */
export function useConnectorIcon(
  row: ServerPageRow,
  installation: string,
  enabled: boolean,
): string | undefined {
  const musterIcon = useMusterIcon(
    installation,
    enabled && row.kind === 'core',
  );
  switch (row.kind) {
    case 'core':
      return musterIcon;
    case 'server':
      return row.server.getStatusIcon();
    default:
      return selectRepresentative(
        row.servers,
        installation,
      )?.server.getStatusIcon();
  }
}
