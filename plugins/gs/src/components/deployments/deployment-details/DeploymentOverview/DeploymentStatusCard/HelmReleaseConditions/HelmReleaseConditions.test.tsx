import { screen } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { HelmRelease } from '@giantswarm/backstage-plugin-kubernetes-react';
import { aiChatApiRef } from '@giantswarm/backstage-plugin-ai-chat-react';
import { HelmReleaseConditions } from './HelmReleaseConditions';

function createMockHelmRelease(options: {
  readyCondition: { status: 'True' | 'False'; message: string };
}): HelmRelease {
  const json = {
    apiVersion: 'helm.toolkit.fluxcd.io/v2',
    kind: 'HelmRelease',
    metadata: {
      name: 'test-helmrelease',
      namespace: 'default',
    },
    spec: {},
    status: {
      conditions: [
        {
          type: 'Ready',
          status: options.readyCondition.status,
          reason: 'InstallFailed',
          message: options.readyCondition.message,
          lastTransitionTime: '2026-01-01T00:00:00Z',
        },
      ],
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new HelmRelease(json as any, 'test-installation');
}

describe('HelmReleaseConditions', () => {
  it('shows an "Explain this error" button for failing conditions when ai-chat is enabled', async () => {
    const helmrelease = createMockHelmRelease({
      readyCondition: { status: 'False', message: 'install failed' },
    });

    await renderInTestApp(
      <TestApiProvider apis={[[aiChatApiRef, {}]]}>
        <HelmReleaseConditions
          helmrelease={helmrelease}
          workloadsEnabled={false}
        />
      </TestApiProvider>,
    );

    expect(screen.getByText('Explain this error')).toBeInTheDocument();
  });

  it('does not show the button when ai-chat is not enabled', async () => {
    const helmrelease = createMockHelmRelease({
      readyCondition: { status: 'False', message: 'install failed' },
    });

    await renderInTestApp(
      <TestApiProvider apis={[]}>
        <HelmReleaseConditions
          helmrelease={helmrelease}
          workloadsEnabled={false}
        />
      </TestApiProvider>,
    );

    expect(screen.queryByText('Explain this error')).not.toBeInTheDocument();
  });

  it('does not show the button for healthy conditions', async () => {
    const helmrelease = createMockHelmRelease({
      readyCondition: { status: 'True', message: 'Release reconciled' },
    });

    await renderInTestApp(
      <TestApiProvider apis={[[aiChatApiRef, {}]]}>
        <HelmReleaseConditions
          helmrelease={helmrelease}
          workloadsEnabled={false}
        />
      </TestApiProvider>,
    );

    expect(screen.queryByText('Explain this error')).not.toBeInTheDocument();
  });
});
