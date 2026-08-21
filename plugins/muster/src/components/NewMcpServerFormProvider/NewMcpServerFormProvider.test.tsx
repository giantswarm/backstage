import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  NewMcpServerFormProvider,
  useNewMcpServerForm,
} from './NewMcpServerFormProvider';

function wrapper({ children }: { children: ReactNode }) {
  return <NewMcpServerFormProvider>{children}</NewMcpServerFormProvider>;
}

function renderForm() {
  const { result } = renderHook(() => useNewMcpServerForm(), { wrapper });
  /** Fills in everything the Details step asks for. */
  const fillDetails = () =>
    act(() => {
      result.current.setName('Weather MCP');
      result.current.setInstallation('gaggle');
      result.current.setUrl('https://weather.example.com/mcp');
    });
  return { result, fillDetails };
}

describe('NewMcpServerFormProvider', () => {
  it('throws when used outside the provider', () => {
    // React logs the thrown error via console.error; silence it for this case.
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    expect(() => renderHook(() => useNewMcpServerForm())).toThrow(
      /must be used within a NewMcpServerFormProvider/,
    );
    consoleError.mockRestore();
  });

  it('starts incomplete and names what is missing', () => {
    const { result } = renderForm();

    expect(result.current.isComplete).toBe(false);
    expect(result.current.validationErrors).toEqual([
      'Name is required',
      'Select an installation',
      'URL is required',
    ]);
  });

  it('completes once details are filled in', () => {
    const { result, fillDetails } = renderForm();
    fillDetails();

    expect(result.current.validationErrors).toEqual([]);
    expect(result.current.isComplete).toBe(true);
  });

  it('derives the technical name from the display name until it is edited', () => {
    const { result } = renderForm();

    act(() => result.current.setName('GitHub (remote)'));
    expect(result.current.state.slug).toBe('github-remote');

    act(() => result.current.setSlug('github-mcp'));
    act(() => result.current.setName('GitHub Enterprise'));
    expect(result.current.state.slug).toBe('github-mcp');

    // reset() re-arms the derivation.
    act(() => result.current.reset());
    act(() => result.current.setName('GitHub Enterprise'));
    expect(result.current.state.slug).toBe('github-enterprise');
  });

  it('rejects a hand-edited technical name that is not a DNS label', () => {
    const { result, fillDetails } = renderForm();
    fillDetails();

    act(() => result.current.setSlug('Weather MCP'));
    expect(result.current.isComplete).toBe(false);
    expect(result.current.validationErrors).toEqual([
      expect.stringContaining('Technical name must be lowercase'),
    ]);
  });

  it('rejects a URL the CRD would reject', () => {
    const { result, fillDetails } = renderForm();
    fillDetails();

    act(() => result.current.setUrl('weather.example.com'));
    expect(result.current.validationErrors).toEqual([
      expect.stringContaining('URL must be an http(s) URL'),
    ]);
  });

  it('offers the issuer override only for "sign in with your own account"', () => {
    const { result, fillDetails } = renderForm();
    fillDetails();

    expect(result.current.authFields.authorizationServer.available).toBe(false);

    act(() => result.current.setAuthMode('own-account'));
    expect(result.current.authFields.authorizationServer.available).toBe(true);
    // Scopes only make sense together with an issuer.
    expect(result.current.authFields.scopes.available).toBe(false);
    act(() => result.current.setIssuer('https://auth.example.com'));
    expect(result.current.authFields.scopes.available).toBe(true);
  });

  it('offers required audiences only for Platform SSO, explaining the exclusion', () => {
    const { result, fillDetails } = renderForm();
    fillDetails();
    act(() => result.current.setAuthMode('platform-sso'));

    expect(result.current.authFields.requiredAudiences.available).toBe(true);
    expect(result.current.authFields.authorizationServer).toEqual({
      available: false,
      reason: expect.stringContaining('the CRD rejects both together'),
    });
  });

  it('drops the previous mode’s auth fields when the mode changes', () => {
    const { result, fillDetails } = renderForm();
    fillDetails();

    act(() => result.current.setAuthMode('own-account'));
    act(() => {
      result.current.setIssuer('https://auth.example.com');
      result.current.setScopes('openid');
    });
    expect(result.current.definition.auth).toEqual({
      type: 'oauth',
      authorizationServer: {
        issuer: 'https://auth.example.com',
        scopes: 'openid',
      },
    });

    act(() => result.current.setAuthMode('platform-sso'));
    expect(result.current.state.issuer).toBe('');
    expect(result.current.definition.auth).toEqual({ forwardToken: true });
  });

  it('flags scopes set without an issuer', () => {
    const { result, fillDetails } = renderForm();
    fillDetails();
    act(() => result.current.setAuthMode('own-account'));
    act(() => result.current.setScopes('openid'));

    expect(result.current.validationErrors).toEqual([
      expect.stringContaining('Scopes apply to the issuer override'),
    ]);
  });

  it('exposes the composed definition and manifest for the review step', () => {
    const { result, fillDetails } = renderForm();
    fillDetails();
    act(() => {
      result.current.setDescription('Forecasts and observations');
      result.current.setTransport('sse');
      result.current.setAuthMode('platform-sso');
      result.current.setRequiredAudiences(['dex-k8s-authenticator']);
    });

    expect(result.current.definition).toEqual({
      name: 'weather-mcp',
      type: 'sse',
      url: 'https://weather.example.com/mcp',
      autoStart: true,
      description: 'Forecasts and observations',
      auth: {
        forwardToken: true,
        requiredAudiences: ['dex-k8s-authenticator'],
      },
    });
    expect(
      result.current.manifest({ registeredBy: 'timo@giantswarm.io' }),
    ).toMatchObject({
      kind: 'MCPServer',
      metadata: {
        name: 'weather-mcp',
        namespace: 'agent-platform',
        annotations: { 'ui.giantswarm.io/registered-by': 'timo@giantswarm.io' },
      },
    });
  });
});
