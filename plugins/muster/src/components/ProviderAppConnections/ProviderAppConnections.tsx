import { type ReactNode } from 'react';
import { QueryClientProvider } from '../QueryClientProvider';
import { useMcpServersAwaitingSignIn } from '../McpAuthDialog/useMcpServersAwaitingSignIn';
import { ProviderAppList } from '../ProviderAppSignIn/ProviderAppList';

export type ProviderAppConnectionsProps = {
  /** The muster installation that keeps the person's grants. */
  installation: string;
  /**
   * Wraps the list once muster lists an App (a heading, a section); nothing
   * renders while it lists none.
   */
  children?: (list: ReactNode) => ReactNode;
};

function Connections({ installation, children }: ProviderAppConnectionsProps) {
  const { providerApps } = useMcpServersAwaitingSignIn(installation, {
    servers: [],
  });
  if (providerApps.length === 0) {
    return null;
  }
  const list = (
    <ProviderAppList apps={providerApps} installation={installation} />
  );
  return <>{children ? children(list) : list}</>;
}

/**
 * The person's connections to the provider Apps muster keeps (their ChatGPT
 * subscription, a Git provider's App), each with its state and the action
 * that changes it: where a person connects or disconnects one without a
 * feature asking. Read under muster's own query client, shared with the
 * sign-in dialog, so a connection made there shows here at once.
 */
export function ProviderAppConnections(props: ProviderAppConnectionsProps) {
  return (
    <QueryClientProvider>
      <Connections {...props} />
    </QueryClientProvider>
  );
}
