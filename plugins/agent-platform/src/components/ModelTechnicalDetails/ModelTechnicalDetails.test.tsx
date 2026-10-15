import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { STALE_MODEL_DETAIL } from '../../lib/customize';
import { ModelTechnicalDetails } from './ModelTechnicalDetails';

// The Helm release card reads its HelmRelease; it has its own tests.
jest.mock('./ModelHelmReleaseCard', () => ({
  ModelHelmReleaseCard: () => null,
}));

function modelConfig(
  status: ModelConfigInterface['status'],
  generation = 2,
): ModelConfig {
  return new ModelConfig(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: { name: 'sonnet', namespace: 'kagent', generation },
      spec: { provider: 'Anthropic', model: 'claude-sonnet-4-5' },
      status,
    } as ModelConfigInterface,
    'inst-1',
  );
}

const resolved = {
  type: 'ResolvedRefs',
  status: 'False' as const,
  reason: 'SecretNotFound',
  message: 'Secret kagent/sonnet-key not found',
  lastTransitionTime: '2026-09-01T10:00:00Z',
};

describe('ModelTechnicalDetails', () => {
  it('says the conditions describe the previous version when they are stale', async () => {
    await renderInTestApp(
      <ModelTechnicalDetails
        modelConfig={modelConfig({
          observedGeneration: 1,
          conditions: [resolved],
        })}
        installation="inst-1"
      />,
    );

    expect(
      screen.getByText(new RegExp(STALE_MODEL_DETAIL)),
    ).toBeInTheDocument();
  });

  it('says only that the controller has not reported when there are no conditions', async () => {
    await renderInTestApp(
      <ModelTechnicalDetails
        modelConfig={modelConfig({ observedGeneration: 1, conditions: [] })}
        installation="inst-1"
      />,
    );

    expect(
      screen.getByText(/has not reported on this model yet/),
    ).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(STALE_MODEL_DETAIL))).toBeNull();
  });
});
