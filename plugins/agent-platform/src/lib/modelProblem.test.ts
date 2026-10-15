import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { modelProblem } from './modelProblem';

type Condition = {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason: string;
  message?: string;
};

function model(
  conditions: Condition[] | undefined,
  { generation = 1, observedGeneration = 1 } = {},
) {
  return new ModelConfig(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: { name: 'sonnet', namespace: 'kagent', generation },
      spec: { provider: 'Anthropic', model: 'claude-sonnet-4-5' },
      status: conditions
        ? {
            observedGeneration,
            conditions: conditions.map(condition => ({
              message: '',
              lastTransitionTime: '2026-10-01T10:00:00Z',
              ...condition,
            })),
          }
        : undefined,
    } as ModelConfigInterface,
    'inst-1',
  );
}

const ACCEPTED: Condition = {
  type: 'Accepted',
  status: 'True',
  reason: 'Accepted',
};
const RESOLVED: Condition = {
  type: 'ResolvedRefs',
  status: 'True',
  reason: 'Resolved',
};
const refs = (reason: string, message = ''): Condition => ({
  type: 'ResolvedRefs',
  status: 'False',
  reason,
  message,
});
const rejected = (reason: string): Condition => ({
  type: 'Accepted',
  status: 'False',
  reason,
});

const EDITOR = { canEdit: true };
const READER = { canEdit: false };

describe('modelProblem', () => {
  it('is none for a model kagent accepted', () => {
    expect(modelProblem(model([ACCEPTED, RESOLVED]), EDITOR)).toBeUndefined();
  });

  it('explains a missing key when kagent accepted the settings but cannot find it', () => {
    const problem = modelProblem(
      model([
        ACCEPTED,
        refs('APIKeySecretNotFound', 'secret kagent/sonnet-key not found'),
      ]),
      EDITOR,
    );

    expect(problem).toEqual({
      status: 'danger',
      title: 'Agents cannot use this model',
      description:
        'The API key it needs cannot be found. Enter the key again with Edit.',
    });
    // Neither kagent's words nor its terms: those are Technical details'.
    expect(problem?.description).not.toMatch(
      /accept|ResolvedRefs|APIKeySecretNotFound|secret kagent/i,
    );
  });

  it('says whom to ask when the person cannot edit the model', () => {
    const missing = model([ACCEPTED, refs('APIKeySecretNotFound')]);

    expect(modelProblem(missing, { canEdit: false, owner: 'Helm' })).toEqual(
      expect.objectContaining({
        description:
          'The API key it needs cannot be found. Ask whoever maintains it in Helm to add the key.',
      }),
    );
    expect(modelProblem(missing, READER)?.description).toBe(
      'The API key it needs cannot be found. Ask your platform team to add the key.',
    );
  });

  it.each([
    ['APIKeySecretKeyNotFound', 'Its stored API key is incomplete.'],
    ['BedrockCredentialKeyNotFound', 'Its stored API key is incomplete.'],
    ['SAPAICoreCredentialKeyNotFound', 'Its stored API key is incomplete.'],
    ['SecretNotFound', 'The API key it needs cannot be found.'],
    [
      'EndpointConfigMapNotFound',
      'The address of its endpoint cannot be found.',
    ],
    [
      'EndpointConfigMapKeyNotFound',
      'The address of its endpoint cannot be found.',
    ],
    [
      'EndpointConfigMapKeyEmpty',
      'The address of its endpoint cannot be found.',
    ],
    [
      'SomethingNew',
      'Something it needs, such as its API key, cannot be found.',
    ],
  ])('explains the reference failure %s in plain words', (reason, problem) => {
    expect(
      modelProblem(model([ACCEPTED, refs(reason)]), READER)?.description,
    ).toMatch(new RegExp(`^${problem.replace(/[.,]/g, '\\$&')} `));
  });

  it('does not offer Edit for an endpoint the form cannot set', () => {
    expect(
      modelProblem(model([ACCEPTED, refs('EndpointConfigMapNotFound')]), EDITOR)
        ?.description,
    ).toBe(
      'The address of its endpoint cannot be found. Ask your platform team to set the endpoint address.',
    );
  });

  it.each([
    [
      'InvalidProviderConfig',
      'Its settings are incomplete for its provider. Complete them with Edit.',
    ],
    [
      'UnsupportedProvider',
      'kagent does not support its provider. Choose a supported provider with Edit.',
    ],
    [
      'ModelConfigMissing',
      'kagent rejected its settings. Check its settings with Edit.',
    ],
  ])('explains the rejected settings %s', (reason, description) => {
    expect(
      modelProblem(model([rejected(reason), RESOLVED]), EDITOR)?.description,
    ).toBe(description);
  });

  it('explains the settings first when both conditions fail', () => {
    expect(
      modelProblem(
        model([
          refs('APIKeySecretNotFound'),
          rejected('InvalidProviderConfig'),
        ]),
        EDITOR,
      )?.description,
    ).toMatch(/^Its settings are incomplete/);
  });

  it('says kagent has not checked a model yet, or its latest change', () => {
    expect(modelProblem(model(undefined), EDITOR)).toEqual({
      status: 'info',
      title: 'kagent has not checked this model yet',
      description:
        'Agents may not be able to use it until then. Check back in a moment.',
    });
    expect(
      modelProblem(
        model([ACCEPTED, refs('APIKeySecretNotFound')], {
          generation: 2,
          observedGeneration: 1,
        }),
        EDITOR,
      )?.title,
    ).toBe('kagent has not checked the latest change yet');
  });
});
