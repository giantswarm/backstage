import { CredentialOperation, destinations } from './credentialOperations';

function operationWithModel(
  spec: Record<string, unknown>,
): CredentialOperation {
  return {
    changes: [
      {
        action: 'create',
        object: {
          apiVersion: 'kagent.dev/v1alpha2',
          kind: 'ModelConfig',
          metadata: { name: 'claude-sonnet' },
          spec,
        },
      },
    ],
    references: [],
  } as unknown as CredentialOperation;
}

describe('destinations', () => {
  it('names the provider of a model without an endpoint', () => {
    expect(destinations(operationWithModel({ provider: 'Anthropic' }))).toEqual(
      ['Anthropic'],
    );
  });

  it('names the endpoint of a model that sets one', () => {
    expect(
      destinations(
        operationWithModel({
          provider: 'Anthropic',
          anthropic: { baseUrl: 'https://llm-proxy.example.com' },
        }),
      ),
    ).toEqual(['https://llm-proxy.example.com']);
  });
});
