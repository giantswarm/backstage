import { crds } from '@giantswarm/k8s-types';
import {
  deriveModelConfigReadiness,
  ModelConfig,
  ModelConfigCondition,
} from './ModelConfig';

type ModelConfigInterface = crds.kagent.v1alpha3.ModelConfig;

const AT = '2026-07-31T10:00:00Z';

function condition(
  type: string,
  status: 'True' | 'False' | 'Unknown',
  message = '',
): ModelConfigCondition {
  return { type, status, reason: type, message, lastTransitionTime: AT };
}

function makeModelConfig(
  conditions?: ModelConfigCondition[],
  { generation = 1, observedGeneration = 1 as number | undefined } = {},
): ModelConfig {
  return new ModelConfig(
    {
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: { name: 'opus', namespace: 'kagent', generation },
      spec: { provider: 'Anthropic', model: 'claude-opus-4-7' },
      status: conditions ? { conditions, observedGeneration } : undefined,
    } as ModelConfigInterface,
    'gazelle',
  );
}

describe('ModelConfig', () => {
  it('is the v1alpha3 ModelConfig, single version', () => {
    expect(ModelConfig.group).toBe('kagent.dev');
    expect(ModelConfig.plural).toBe('modelconfigs');
    expect(ModelConfig.supportedVersions).toEqual(['v1alpha3']);
  });

  describe('readiness', () => {
    it('is accepted when both Accepted and ResolvedRefs are True', () => {
      const modelConfig = makeModelConfig([
        condition('Accepted', 'True'),
        condition('ResolvedRefs', 'True'),
      ]);

      expect(modelConfig.getReadiness()).toBe('accepted');
      expect(modelConfig.getReadinessMessage()).toBeUndefined();
    });

    it('is notAccepted when the spec is rejected, and says why', () => {
      const modelConfig = makeModelConfig([
        condition('Accepted', 'False', 'unknown provider Foo'),
        condition('ResolvedRefs', 'True'),
      ]);

      expect(modelConfig.getReadiness()).toBe('notAccepted');
      expect(modelConfig.getReadinessMessage()).toBe('unknown provider Foo');
    });

    // The two verdicts are written separately: a valid spec whose Secret is
    // missing is rejected by ResolvedRefs alone.
    it('is notAccepted when a reference does not resolve, and says which', () => {
      const modelConfig = makeModelConfig([
        condition('Accepted', 'True'),
        condition('ResolvedRefs', 'False', 'secrets "kagent-opus" not found'),
      ]);

      expect(modelConfig.getReadiness()).toBe('notAccepted');
      expect(modelConfig.getReadinessMessage()).toBe(
        'secrets "kagent-opus" not found',
      );
    });

    it('is pending until both verdicts are written', () => {
      expect(makeModelConfig().getReadiness()).toBe('pending');
      expect(makeModelConfig([]).getReadiness()).toBe('pending');
      expect(
        makeModelConfig([condition('Accepted', 'True')]).getReadiness(),
      ).toBe('pending');
      expect(
        makeModelConfig([
          condition('Accepted', 'True'),
          condition('ResolvedRefs', 'Unknown'),
        ]).getReadiness(),
      ).toBe('pending');
    });

    it('is pending when the status lags the current generation', () => {
      expect(
        deriveModelConfigReadiness(
          makeModelConfig(
            [condition('Accepted', 'True'), condition('ResolvedRefs', 'True')],
            { generation: 3, observedGeneration: 2 },
          ).jsonData,
        ),
      ).toBe('pending');
    });

    it('does not report pending when observedGeneration is absent', () => {
      expect(
        makeModelConfig(
          [condition('Accepted', 'True'), condition('ResolvedRefs', 'True')],
          { observedGeneration: undefined },
        ).getReadiness(),
      ).toBe('accepted');
    });
  });
});
