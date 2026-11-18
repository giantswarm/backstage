import { PropsWithChildren } from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SignedIn } from '@giantswarm/backstage-plugin-muster';

import {
  modelManagerBackendsQueryKey,
  modelManagerModelsQueryKey,
  modelManagerNodesQueryKey,
} from '../../lib/queryKeys';
import { ModelManagerSignInAlerts } from './ModelManagerSignInAlerts';

const signIns: Record<string, (signedIn: SignedIn) => void> = {};

jest.mock('../ConnectAgentManagerAlert', () => ({
  ConnectAgentManagerAlert: (props: {
    installation: string;
    server: string;
    action: string;
    signInRequired: boolean;
    onSignedIn: (signedIn: SignedIn) => void;
  }) => {
    signIns[props.installation] = props.onSignedIn;
    return (
      <div data-testid={`sign-in-${props.installation}`}>
        {props.server} · {props.action} ·{' '}
        {props.signInRequired ? 'sign-in' : 'connect'}
      </div>
    );
  },
}));

function renderAlerts(installations: string[]) {
  const queryClient = new QueryClient();
  for (const installation of ['gpu', 'lab']) {
    for (const key of [
      modelManagerBackendsQueryKey(installation),
      modelManagerModelsQueryKey(installation),
      modelManagerNodesQueryKey(installation),
    ]) {
      queryClient.setQueryData(key, []);
    }
  }
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(<ModelManagerSignInAlerts installations={installations} />, {
    wrapper,
  });
  return queryClient;
}

describe('ModelManagerSignInAlerts', () => {
  it("offers muster's sign-in to model-manager, one card per installation", () => {
    renderAlerts(['gpu', 'lab']);

    expect(screen.getByTestId('sign-in-gpu')).toHaveTextContent(
      'model-manager · Served models are read · sign-in',
    );
    expect(screen.getByTestId('sign-in-lab')).toBeInTheDocument();
  });

  it("reads every model-manager read of the installation again once the sign-in lands, and only that installation's", async () => {
    const queryClient = renderAlerts(['gpu']);

    await act(async () => signIns.gpu({ here: true }));

    const invalidated = (installation: string) =>
      [
        modelManagerBackendsQueryKey(installation),
        modelManagerModelsQueryKey(installation),
        modelManagerNodesQueryKey(installation),
      ].map(key => queryClient.getQueryState(key)?.isInvalidated);
    expect(invalidated('gpu')).toEqual([true, true, true]);
    expect(invalidated('lab')).toEqual([false, false, false]);
  });
});
