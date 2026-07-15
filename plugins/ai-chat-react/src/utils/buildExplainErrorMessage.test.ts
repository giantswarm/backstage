import { buildExplainErrorMessage } from './buildExplainErrorMessage';

describe('buildExplainErrorMessage', () => {
  it('includes all provided context fields', () => {
    const message = buildExplainErrorMessage({
      kind: 'Kustomization',
      name: 'apps',
      namespace: 'flux-system',
      cluster: 'test-mc',
      message: 'MyService/default/my-service dry-run failed',
      reason: 'BuildFailed',
      revision: 'main@sha1:abcdef',
    });

    expect(message).toContain("Kustomization resource named 'apps'");
    expect(message).toContain("in namespace 'flux-system'");
    expect(message).toContain("on management cluster 'test-mc'");
    expect(message).toContain("with reason 'BuildFailed'");
    expect(message).toContain("at revision 'main@sha1:abcdef'");
    expect(message).toContain('MyService/default/my-service dry-run failed');
    expect(message).toContain('explain in plain language');
  });

  it('omits optional fields when they are not provided', () => {
    const message = buildExplainErrorMessage({
      kind: 'HelmRelease',
      name: 'my-app',
      cluster: 'test-mc',
      message: 'install retries exhausted',
    });

    expect(message).toContain("HelmRelease resource named 'my-app'");
    expect(message).not.toContain('in namespace');
    expect(message).not.toContain('with reason');
    expect(message).not.toContain('at revision');
  });

  it('truncates very long error messages', () => {
    const message = buildExplainErrorMessage({
      kind: 'Kustomization',
      name: 'apps',
      cluster: 'test-mc',
      message: 'x'.repeat(10000),
    });

    expect(message.length).toBeLessThan(5000);
    expect(message).toContain('…');
  });
});
