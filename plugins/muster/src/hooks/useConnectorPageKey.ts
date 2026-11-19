import { useParams } from 'react-router-dom';
import { connectorPageKey } from '../lib/connectorAddress';

/**
 * The page key of the connector page the address names
 * (`lib/connectorAddress.ts`): `:server`, or `-/<namespace>/<name>` under an
 * organization connector's route.
 */
export function useConnectorPageKey(): string {
  const { server, namespace } = useParams();
  return connectorPageKey({ server, namespace });
}
