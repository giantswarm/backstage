import {
  CredentialOperation,
  credentialFormOf,
  destinations,
} from './credentialOperations';

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

describe('credentialFormOf', () => {
  const params = {
    installation: 'gazelle',
    namespace: 'org-acme',
    operation: 'op-1',
  };

  it("links to the portal's form for the operation", () => {
    const formLink = ({ installation, namespace, operation }: typeof params) =>
      `/customize/models/credentials/${installation}/${namespace}/${operation}`;

    expect(credentialFormOf(formLink, params, 'no form here')).toBe(
      '/customize/models/credentials/gazelle/org-acme/op-1',
    );
  });

  it("refuses in the caller's words where this portal binds no form", () => {
    expect(() => credentialFormOf(undefined, params, 'no form here')).toThrow(
      new Error('no form here'),
    );
  });
});
