import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MCPServer } from '../../lib/k8s';
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
      'Enter a name for the connector.',
      'Choose an environment.',
      'Enter the URL, e.g. https://mcp.example.com/mcp.',
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

  it('keeps the answer when the current mode is picked again', () => {
    // The selected card fires onSelect too; that is no switch.
    const { result, fillDetails } = renderForm();
    fillDetails();
    act(() => result.current.setAuthMode('platform-sso'));
    act(() => result.current.setRequiredAudiences(['aud-a']));

    act(() => result.current.setAuthMode('platform-sso'));

    expect(result.current.state.requiredAudiences).toEqual(['aud-a']);
    expect(result.current.definition.auth).toEqual({
      forwardToken: true,
      requiredAudiences: ['aud-a'],
    });
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

  it('offers the signing configuration only for AWS SigV4 on streamable-http', () => {
    const { result, fillDetails } = renderForm();
    fillDetails();

    expect(result.current.authFields.sigv4.available).toBe(false);

    act(() => result.current.setAuthMode('sigv4'));
    expect(result.current.authFields.sigv4.available).toBe(true);
    // The per-user auth fields are the ones the CRD rejects next to sigv4.
    expect(result.current.authFields.authorizationServer.available).toBe(false);
    expect(result.current.authFields.requiredAudiences.available).toBe(false);

    act(() => result.current.setTransport('sse'));
    expect(result.current.authFields.sigv4).toEqual({
      available: false,
      reason: expect.stringContaining('Streamable HTTP transport'),
    });
  });

  it('blocks an incomplete or misplaced sigv4 answer', () => {
    const { result, fillDetails } = renderForm();
    fillDetails();
    act(() => result.current.setAuthMode('sigv4'));

    expect(result.current.isComplete).toBe(false);
    expect(result.current.validationErrors).toEqual([
      'Enter the signing region for AWS SigV4, e.g. eu-central-1.',
    ]);

    act(() => result.current.setSigv4Region('eu-central-1'));
    expect(result.current.isComplete).toBe(true);

    act(() => result.current.setTransport('sse'));
    expect(result.current.validationErrors).toEqual([
      expect.stringContaining(
        'AWS SigV4 signing needs the Streamable HTTP transport',
      ),
    ]);
  });

  it('advises about the wrong-region traps without blocking on them', () => {
    const { result, fillDetails } = renderForm();
    fillDetails();
    act(() => result.current.setAuthMode('sigv4'));
    act(() => result.current.setSigv4Region('eu-central-1'));

    // weather.example.com carries no region, and no AWS_REGION is set.
    expect(result.current.authAdvisories).toEqual([
      expect.stringContaining('The URL does not mention eu-central-1'),
      expect.stringContaining('No AWS_REGION in request metadata'),
    ]);
    expect(result.current.isComplete).toBe(true);

    act(() => {
      result.current.setUrl('https://aws-mcp.eu-central-1.api.aws/mcp');
      result.current.setMeta([{ key: 'AWS_REGION', value: 'eu-central-1' }]);
    });
    expect(result.current.authAdvisories).toEqual([]);
  });

  it('drops the sigv4 answer when the mode changes', () => {
    const { result, fillDetails } = renderForm();
    fillDetails();
    act(() => result.current.setAuthMode('sigv4'));
    act(() => {
      result.current.setSigv4Region('eu-central-1');
      result.current.setSigv4RoleArn('arn:aws:iam::123456789012:role/muster');
    });
    expect(result.current.definition.auth).toEqual({
      type: 'sigv4',
      sigv4: {
        region: 'eu-central-1',
        roleArn: 'arn:aws:iam::123456789012:role/muster',
      },
    });

    act(() => result.current.setAuthMode('none'));
    expect(result.current.state.sigv4Region).toBe('');
    expect(result.current.definition).not.toHaveProperty('auth');
  });

  it('keeps request metadata across an auth-mode change', () => {
    // `spec.meta` belongs to the endpoint, not the auth answer, so switching
    // modes must not drop it the way it drops the mode's own fields.
    const { result, fillDetails } = renderForm();
    fillDetails();
    act(() =>
      result.current.setMeta([{ key: 'AWS_REGION', value: 'eu-north-1' }]),
    );
    act(() => result.current.setAuthMode('sigv4'));

    expect(result.current.definition.meta).toEqual({
      AWS_REGION: 'eu-north-1',
    });
  });

  it('exposes the composed definition for the review step', () => {
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
      displayName: 'Weather MCP',
      type: 'sse',
      url: 'https://weather.example.com/mcp',
      autoStart: true,
      description: 'Forecasts and observations',
      auth: {
        forwardToken: true,
        requiredAudiences: ['dex-k8s-authenticator'],
      },
    });
  });

  describe('editing a registered server', () => {
    const server = new MCPServer(
      {
        apiVersion: 'muster.giantswarm.io/v1alpha1',
        kind: 'MCPServer',
        metadata: { name: 'weather-mcp' },
        spec: {
          type: 'streamable-http',
          url: 'https://weather.example.com/mcp',
          timeout: 90,
        },
      } as never,
      'gaggle',
    );

    it('seeds the form as an update to that server', () => {
      const { result } = renderForm();

      act(() => result.current.startEdit(server));

      expect(result.current.registeredName).toBe('weather-mcp');
      expect(result.current.startedFromEdit).toBe(true);
      expect(result.current.isComplete).toBe(true);
      expect(result.current.definition).toMatchObject({
        name: 'weather-mcp',
        url: 'https://weather.example.com/mcp',
        timeout: 90,
      });
      // The CR name stays locked to the server even when the name changes.
      act(() => result.current.setName('Weather (EU)'));
      expect(result.current.definition.name).toBe('weather-mcp');
    });

    it('pins the edit to the server’s installation', () => {
      const { result } = renderForm();
      act(() => result.current.startEdit(server));

      expect(result.current.registeredInstallation).toBe('gaggle');
      expect(result.current.state.installation).toBe('gaggle');
    });

    it('requires a name, now that an edit can change it', () => {
      const { result } = renderForm();
      act(() => result.current.startEdit(server));

      act(() => result.current.setName(''));

      expect(result.current.fieldErrors.name).toBe(
        'Enter a name for the connector.',
      );
    });

    it('changes the display name, never the technical name', () => {
      const named = new MCPServer(
        {
          apiVersion: 'muster.giantswarm.io/v1alpha1',
          kind: 'MCPServer',
          metadata: {
            name: 'weather-mcp',
            annotations: { 'ui.giantswarm.io/display-name': 'Weather' },
          },
          spec: { type: 'streamable-http', url: 'https://w.example.com/mcp' },
        } as never,
        'gaggle',
      );
      const { result } = renderForm();
      act(() => result.current.startEdit(named));

      expect(result.current.state.name).toBe('Weather');
      // Unchanged: the update leaves the annotation as it is.
      expect(result.current.definition).not.toHaveProperty('displayName');

      act(() => result.current.setName('Weather forecasts'));
      expect(result.current.state.slug).toBe('weather-mcp');
      expect(result.current.definition).toMatchObject({
        name: 'weather-mcp',
        displayName: 'Weather forecasts',
      });

      // Saved, it is the name a later save compares with.
      act(() => result.current.markSaved(result.current.definition));
      expect(result.current.definition).not.toHaveProperty('displayName');

      // Back to the technical name removes the annotation.
      act(() => result.current.setName('weather-mcp'));
      expect(result.current.definition.displayName).toBe('');
    });

    it('names the connector by its technical name after a save that could not keep the typed one', () => {
      // An installation whose muster does not take a display name saves the
      // definition without it: the connector is then called by its technical
      // name, and the form says so rather than showing a name it does not have.
      const { result, fillDetails } = renderForm();
      fillDetails();
      const { displayName: _dropped, ...sent } = result.current.definition;

      act(() => result.current.markSaved(sent));

      expect(result.current.state.name).toBe('weather-mcp');
      expect(result.current.definition).not.toHaveProperty('displayName');
    });

    it('keeps the typed name in the form after a save that kept it', () => {
      const { result, fillDetails } = renderForm();
      fillDetails();

      act(() => result.current.markSaved(result.current.definition));

      expect(result.current.state.name).toBe('Weather MCP');
      expect(result.current.definition).not.toHaveProperty('displayName');
    });

    it('lays later saves over what was saved, not over the server as it was', () => {
      const { result } = renderForm();
      act(() =>
        result.current.startEdit(
          new MCPServer(
            {
              apiVersion: 'muster.giantswarm.io/v1alpha1',
              kind: 'MCPServer',
              metadata: { name: 'weather-mcp' },
              spec: {
                type: 'streamable-http',
                url: 'https://weather.example.com/mcp',
                description: 'Old',
              },
            } as never,
            'gaggle',
          ),
        ),
      );
      act(() => result.current.setDescription('New'));
      act(() => result.current.markSaved(result.current.definition));
      expect(result.current.lastSave).toBe('update');

      // muster keeps a description an update clears, so the definition shows
      // the one now live: the saved one.
      act(() => result.current.setDescription(''));
      expect(result.current.definition.description).toBe('New');
    });

    it('remembers that a save stored a client, with no value in its base', () => {
      const { result, fillDetails } = renderForm();
      fillDetails();
      act(() => {
        result.current.setAuthMode('own-account');
        result.current.setIssuer('https://app.hubspot.com');
      });
      expect(result.current.storedClientCredentials).toBe(false);

      // The wizard hands markSaved what it sent, without the credentials.
      act(() =>
        result.current.markSaved(result.current.definition, {
          storedClientCredentials: true,
        }),
      );

      expect(result.current.storedClientCredentials).toBe(true);
      // A later save sends no reference: muster keeps the client it stored.
      expect(result.current.definition.auth?.authorizationServer).toEqual({
        issuer: 'https://app.hubspot.com',
      });

      act(() => result.current.reset());
      expect(result.current.storedClientCredentials).toBe(false);
    });

    it('forgets the replaced reference after a save that stored a client', () => {
      const { result } = renderForm();
      act(() =>
        result.current.startEdit(
          new MCPServer(
            {
              apiVersion: 'muster.giantswarm.io/v1alpha1',
              kind: 'MCPServer',
              metadata: { name: 'weather-mcp' },
              spec: {
                type: 'streamable-http',
                url: 'https://weather.example.com/mcp',
                auth: {
                  type: 'oauth',
                  authorizationServer: {
                    issuer: 'https://idp',
                    clientCredentialsSecretRef: {
                      name: 'weather-mcp-oauth-client-old01',
                    },
                  },
                },
              },
            } as never,
            'gaggle',
          ),
        ),
      );
      expect(
        result.current.definition.auth?.authorizationServer
          ?.clientCredentialsSecretRef,
      ).toEqual({ name: 'weather-mcp-oauth-client-old01' });

      act(() =>
        result.current.markSaved(result.current.definition, {
          storedClientCredentials: true,
        }),
      );

      expect(result.current.state.clientSecretName).toBe('');
      expect(result.current.definition.auth?.authorizationServer).toEqual({
        issuer: 'https://idp',
      });
      expect(result.current.authorizationServerChanged).toBe(false);
      act(() => result.current.setIssuer('https://other-idp'));
      expect(result.current.authorizationServerChanged).toBe(true);
    });

    it('forgets the stored client after a save without an authorization server', () => {
      const { result, fillDetails } = renderForm();
      fillDetails();
      act(() => {
        result.current.setAuthMode('own-account');
        result.current.setIssuer('https://idp');
      });
      act(() =>
        result.current.markSaved(result.current.definition, {
          storedClientCredentials: true,
        }),
      );
      act(() => result.current.setIssuer(''));
      act(() => result.current.markSaved(result.current.definition));

      expect(result.current.storedClientCredentials).toBe(false);
    });

    it('composes an existing Secret only while "Use an existing Secret" is ticked', () => {
      const { result, fillDetails } = renderForm();
      fillDetails();
      act(() => {
        result.current.setAuthMode('own-account');
        result.current.setIssuer('https://github.com');
        result.current.setUseExistingSecret(true);
        result.current.setClientSecretName('github-oauth-client');
      });
      expect(
        result.current.definition.auth?.authorizationServer
          ?.clientCredentialsSecretRef,
      ).toEqual({ name: 'github-oauth-client' });

      act(() => result.current.setUseExistingSecret(false));
      expect(
        result.current.definition.auth?.authorizationServer,
      ).not.toHaveProperty('clientCredentialsSecretRef');
    });

    it('records a create as the base of the "Edit details" loop', () => {
      const { result, fillDetails } = renderForm();
      fillDetails();

      act(() => result.current.markSaved(result.current.definition));

      expect(result.current.lastSave).toBe('create');
      expect(result.current.registeredName).toBe('weather-mcp');
      expect(result.current.registeredInstallation).toBe('gaggle');
      // Later saves correct the registration; the run is still an Add.
      expect(result.current.startedFromEdit).toBe(false);
    });

    it('brings the registered auth answer back when its mode is picked again', () => {
      const { result } = renderForm();
      act(() =>
        result.current.startEdit(
          new MCPServer(
            {
              apiVersion: 'muster.giantswarm.io/v1alpha1',
              kind: 'MCPServer',
              metadata: { name: 'weather-mcp' },
              spec: {
                type: 'streamable-http',
                url: 'https://weather.example.com/mcp',
                auth: { forwardToken: true, requiredAudiences: ['aud-a'] },
              },
            } as never,
            'gaggle',
          ),
        ),
      );

      act(() => result.current.setAuthMode('none'));
      expect(result.current.state.requiredAudiences).toEqual([]);
      act(() => result.current.setAuthMode('platform-sso'));

      expect(result.current.state.requiredAudiences).toEqual(['aud-a']);
    });

    it('sets an unfinished registration aside and brings it back on reset', () => {
      const { result } = renderForm();
      act(() => result.current.setUrl('https://draft.example.com/mcp'));

      act(() => result.current.startEdit(server));
      expect(result.current.state.url).toBe('https://weather.example.com/mcp');
      // Another edit replaces this one without touching the draft.
      act(() => result.current.startEdit(server));

      act(() => result.current.reset());
      expect(result.current.registeredName).toBeUndefined();
      expect(result.current.startedFromEdit).toBe(false);
      expect(result.current.state.url).toBe('https://draft.example.com/mcp');

      // Brought back once; the next reset is an empty form.
      act(() => result.current.reset());
      expect(result.current.state.url).toBe('');
    });

    it('keeps its run-level actions stable across renders', () => {
      const { result } = renderForm();
      const { reset, startEdit, markSaved } = result.current;

      act(() => result.current.setUrl('https://x.example.com'));
      act(() => result.current.startEdit(server));

      expect(result.current.reset).toBe(reset);
      expect(result.current.startEdit).toBe(startEdit);
      expect(result.current.markSaved).toBe(markSaved);
    });

    it('forgets the edited server on reset', () => {
      const { result } = renderForm();
      act(() => result.current.startEdit(server));

      act(() => result.current.reset());

      expect(result.current.registeredName).toBeUndefined();
      expect(result.current.state.url).toBe('');
      expect(result.current.definition).not.toHaveProperty('timeout');
    });
  });
});
