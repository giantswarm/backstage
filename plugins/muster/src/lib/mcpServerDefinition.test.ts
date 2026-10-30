import Ajv from 'ajv';
import mcpServersCrd from './__fixtures__/mcpservers.crd.json';
import {
  authFieldAvailability,
  composeMcpServerDefinition,
  deriveSlug,
  displayNameArgument,
  emptyFormState,
  formStateFromServer,
  hasUserInput,
  mergeOntoExisting,
  wizardEditBlocker,
  wizardAuthModeLabel,
  WIZARD_ANSWER_MODES,
  WIZARD_AUTH_MODES,
  sigv4Advisories,
  takesDisplayName,
  validateNewMcpServerForm,
  clientBindingChanged,
  clientCredentialsArgument,
  clientCredentialsProblems,
  hasStoredClientSecret,
  isStoredClientSecret,
  withoutClientSecretRef,
  type NewMcpServerFormState,
} from './mcpServerDefinition';
import { toMcpServerDefinition } from './gitops';
import { MCPServer } from './k8s';
import { AUTH_MODE_LABELS, serverAuthMode } from './serverAuthMode';

function state(
  overrides: Partial<NewMcpServerFormState> = {},
): NewMcpServerFormState {
  return {
    ...emptyFormState,
    name: 'Weather MCP',
    slug: 'weather-mcp',
    description: 'Forecasts and observations',
    installation: 'gaggle',
    url: 'https://weather.example.com/mcp',
    ...overrides,
  };
}

const ROLE_ARN = 'arn:aws:iam::123456789012:role/muster-mcp';

/** A complete, valid AWS SigV4 answer. */
function sigv4State(
  overrides: Partial<NewMcpServerFormState> = {},
): NewMcpServerFormState {
  return state({
    url: 'https://aws-mcp.eu-central-1.api.aws/mcp',
    authMode: 'sigv4',
    sigv4Region: 'eu-central-1',
    ...overrides,
  });
}

describe('composeMcpServerDefinition', () => {
  it('composes a no-auth server without an auth block', () => {
    expect(composeMcpServerDefinition(state())).toEqual({
      name: 'weather-mcp',
      displayName: 'Weather MCP',
      type: 'streamable-http',
      url: 'https://weather.example.com/mcp',
      autoStart: true,
      description: 'Forecasts and observations',
    });
  });

  it('composes "sign in with your own account" as oauth with RFC 9728 discovery', () => {
    expect(
      composeMcpServerDefinition(state({ authMode: 'own-account' })),
    ).toEqual({
      name: 'weather-mcp',
      displayName: 'Weather MCP',
      type: 'streamable-http',
      url: 'https://weather.example.com/mcp',
      autoStart: true,
      description: 'Forecasts and observations',
      auth: { type: 'oauth' },
    });
  });

  it('composes the issuer/scopes override for backends without RFC 9728 metadata', () => {
    expect(
      composeMcpServerDefinition(
        state({
          authMode: 'own-account',
          issuer: 'https://auth.example.com',
          scopes: 'openid profile mcp:read',
        }),
      ),
    ).toEqual({
      name: 'weather-mcp',
      displayName: 'Weather MCP',
      type: 'streamable-http',
      url: 'https://weather.example.com/mcp',
      autoStart: true,
      description: 'Forecasts and observations',
      auth: {
        type: 'oauth',
        authorizationServer: {
          issuer: 'https://auth.example.com',
          scopes: 'openid profile mcp:read',
        },
      },
    });
  });

  it('composes the GitHub-grade advanced override: pinned endpoints, Secret-held client credentials and grant scope', () => {
    expect(
      composeMcpServerDefinition(
        state({
          authMode: 'own-account',
          issuer: 'https://github.com',
          scopes: 'repo read:user',
          authorizationEndpoint: 'https://github.com/login/oauth/authorize',
          tokenEndpoint: 'https://github.com/login/oauth/access_token',
          useExistingSecret: true,
          clientSecretName: 'github-oauth-client',
          clientSecretNamespace: 'muster',
          clientIdKey: 'clientId',
          clientSecretKey: 'clientSecret',
          grantScope: 'subject',
        }),
      ).auth,
    ).toEqual({
      type: 'oauth',
      authorizationServer: {
        issuer: 'https://github.com',
        scopes: 'repo read:user',
        authorizationEndpoint: 'https://github.com/login/oauth/authorize',
        tokenEndpoint: 'https://github.com/login/oauth/access_token',
        clientCredentialsSecretRef: {
          name: 'github-oauth-client',
          namespace: 'muster',
          clientIdKey: 'clientId',
          clientSecretKey: 'clientSecret',
        },
        grantScope: 'subject',
      },
    });
  });

  it('omits a lone pinned endpoint, empty Secret keys and the default grant scope', () => {
    expect(
      composeMcpServerDefinition(
        state({
          authMode: 'own-account',
          issuer: 'https://auth.example.com',
          // Only one endpoint typed so far: composing just it would compose a
          // definition the CRD's set-together rule rejects.
          authorizationEndpoint: 'https://auth.example.com/authorize',
          useExistingSecret: true,
          clientSecretName: 'oauth-client',
          grantScope: 'session',
        }),
      ).auth,
    ).toEqual({
      type: 'oauth',
      authorizationServer: {
        issuer: 'https://auth.example.com',
        clientCredentialsSecretRef: { name: 'oauth-client' },
      },
    });
  });

  it('composes Platform SSO as forwardToken with required audiences', () => {
    expect(
      composeMcpServerDefinition(
        state({
          transport: 'sse',
          authMode: 'platform-sso',
          requiredAudiences: ['dex-k8s-authenticator', ' ', ''],
        }),
      ),
    ).toEqual({
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

  it('omits requiredAudiences when none were given', () => {
    expect(
      composeMcpServerDefinition(state({ authMode: 'platform-sso' })).auth,
    ).toEqual({ forwardToken: true });
  });

  it('composes AWS request signing as auth.type sigv4 plus the sigv4 block', () => {
    expect(
      composeMcpServerDefinition(
        sigv4State({ sigv4Service: '  aws-mcp ', sigv4RoleArn: ROLE_ARN }),
      ).auth,
    ).toEqual({
      type: 'sigv4',
      sigv4: {
        region: 'eu-central-1',
        service: 'aws-mcp',
        roleArn: ROLE_ARN,
      },
    });
  });

  it('omits the sigv4 overrides muster derives or defaults itself', () => {
    // No service → derived from the URL host; no roleArn → muster's own
    // identity. Sending empty strings would say the same thing less clearly.
    expect(composeMcpServerDefinition(sigv4State()).auth).toEqual({
      type: 'sigv4',
      sigv4: { region: 'eu-central-1' },
    });
  });

  it('never composes forwardToken or tokenExchange next to sigv4', () => {
    // The CRD rejects both alongside sigv4. The exclusive auth modes make that
    // structural, so a stale Platform SSO answer cannot ride along.
    const definition = composeMcpServerDefinition(
      sigv4State({ requiredAudiences: ['dex-k8s-authenticator'] }),
    );
    expect(definition.auth).not.toHaveProperty('forwardToken');
    expect(definition.auth).not.toHaveProperty('tokenExchange');
    expect(definition.auth).not.toHaveProperty('requiredAudiences');
  });

  it('composes request metadata as a string map, trimmed and without blanks', () => {
    expect(
      composeMcpServerDefinition(
        state({
          meta: [
            { key: ' AWS_REGION ', value: ' eu-north-1 ' },
            { key: '', value: '' },
          ],
        }),
      ).meta,
    ).toEqual({ AWS_REGION: 'eu-north-1' });
  });

  it('omits meta when no entry has a name', () => {
    expect(
      composeMcpServerDefinition(state({ meta: [{ key: '  ', value: 'x' }] })),
    ).not.toHaveProperty('meta');
  });

  it('carries request metadata for a server without sigv4 too', () => {
    // `spec.meta` belongs to the endpoint, not to auth: the CRD allows it for
    // every non-stdio server.
    expect(
      composeMcpServerDefinition(
        state({
          transport: 'sse',
          meta: [{ key: 'AWS_REGION', value: 'eu-north-1' }],
        }),
      ).meta,
    ).toEqual({ AWS_REGION: 'eu-north-1' });
  });

  it('omits an empty description', () => {
    expect(
      composeMcpServerDefinition(state({ description: '   ' })),
    ).not.toHaveProperty('description');
  });

  // muster owns `ui.giantswarm.io/registered-by`: it stamps the authenticated
  // subject on create and preserves it on update. A client-side stamp would not
  // just be redundant, it would break registration — the create tool rejects
  // unknown fields, and it has no annotations argument to put it in.
  it('carries no attribution or metadata of its own', () => {
    for (const authMode of [
      'none',
      'own-account',
      'platform-sso',
      'sigv4',
    ] as const) {
      const definition = composeMcpServerDefinition(state({ authMode }));
      expect(Object.keys(definition).sort()).toEqual(
        expect.not.arrayContaining(['annotations', 'labels', 'metadata']),
      );
      expect(JSON.stringify(definition)).not.toContain('registered-by');
    }
  });
});

describe('deriveSlug', () => {
  it.each([
    ['Weather MCP', 'weather-mcp'],
    ['  GitHub (remote) ', 'github-remote'],
    ['Ümlaut Server', 'mlaut-server'],
    ['--dashes--', 'dashes'],
    ['', ''],
  ])('derives %j → %j', (name, expected) => {
    expect(deriveSlug(name)).toBe(expected);
  });

  it('truncates to a valid 63-character DNS label', () => {
    const slug = deriveSlug(`${'a'.repeat(62)} b`);
    expect(slug).toHaveLength(62);
    expect(validateNewMcpServerForm(state({ slug }))).toEqual([]);
  });
});

describe('displayNameArgument', () => {
  it('keeps the typed name on create where it is not the technical name', () => {
    expect(displayNameArgument('Stack Overflow', 'stack-overflow')).toBe(
      'Stack Overflow',
    );
    expect(displayNameArgument('  Jira  ', 'jira')).toBe('Jira');
  });

  it('sends none on create for a plain id', () => {
    expect(displayNameArgument('jira', 'jira')).toBeUndefined();
    expect(displayNameArgument(' jira ', 'jira')).toBeUndefined();
    expect(displayNameArgument('', '')).toBeUndefined();
  });

  it.each([
    // unchanged: omitted keeps the annotation
    ['Stack Overflow', 'Stack Overflow', undefined],
    ['stack-overflow', undefined, undefined],
    // blank: the field shows the error, nothing to send
    ['  ', 'Stack Overflow', undefined],
    // a new name
    ['Stack Exchange', 'Stack Overflow', 'Stack Exchange'],
    ['Stack Overflow', undefined, 'Stack Overflow'],
    // back to the technical name: remove the annotation
    ['stack-overflow', 'Stack Overflow', ''],
  ])(
    'on edit sends for %j over a stored %j: %j',
    (typed, current, expected) => {
      expect(
        displayNameArgument(typed, 'stack-overflow', { stored: current }),
      ).toBe(expected);
    },
  );
});

describe('takesDisplayName', () => {
  it('reads the argument from the tool’s input schema', () => {
    expect(
      takesDisplayName({
        properties: {
          name: { type: 'string' },
          displayName: { type: 'string' },
        },
      }),
    ).toBe(true);
  });

  it('is false for a muster from before display names, or no schema', () => {
    expect(takesDisplayName({ properties: { name: { type: 'string' } } })).toBe(
      false,
    );
    expect(takesDisplayName({})).toBe(false);
    expect(takesDisplayName(undefined)).toBe(false);
  });
});

describe('validateNewMcpServerForm', () => {
  it('accepts a complete state', () => {
    expect(validateNewMcpServerForm(state())).toEqual([]);
  });

  it('reports every missing field of an empty form, in form order', () => {
    expect(validateNewMcpServerForm(emptyFormState)).toEqual([
      'Enter a name for the connector.',
      'Choose an environment.',
      'Enter the URL, e.g. https://mcp.example.com/mcp.',
    ]);
  });

  it('asks for a technical name only once the display name is set', () => {
    expect(validateNewMcpServerForm(state({ slug: '' }))).toEqual([
      'Enter a technical name.',
    ]);
  });

  it.each([['My Server'], ['server_1'], ['-server'], ['a'.repeat(64)]])(
    'rejects %j as a technical name',
    slug => {
      expect(validateNewMcpServerForm(state({ slug }))).toEqual([
        expect.stringContaining('Technical name must be lowercase'),
      ]);
    },
  );

  it.each([
    ['mcp.example.com/mcp'],
    ['https://has space/mcp'],
    ['ftp://mcp.example.com'],
  ])('rejects %j as a URL', url => {
    expect(validateNewMcpServerForm(state({ url }))).toEqual([
      expect.stringContaining('URL must be an http(s) URL'),
    ]);
  });

  it('accepts plain http URLs (in-cluster servers)', () => {
    expect(
      validateNewMcpServerForm(state({ url: 'http://mcp-server:8080/mcp' })),
    ).toEqual([]);
  });

  it('rejects a description over the CRD limit', () => {
    expect(
      validateNewMcpServerForm(state({ description: 'x'.repeat(501) })),
    ).toEqual(['Description must be at most 500 characters']);
  });

  it.each([
    ['http://auth.example.com'],
    ['https://auth.example.com?a=b'],
    ['https://auth.example.com#frag'],
  ])('rejects %j as an issuer override', issuer => {
    expect(
      validateNewMcpServerForm(state({ authMode: 'own-account', issuer })),
    ).toEqual([expect.stringContaining('Issuer must be an https URL')]);
  });

  it('rejects scopes without an issuer', () => {
    expect(
      validateNewMcpServerForm(
        state({ authMode: 'own-account', scopes: 'openid' }),
      ),
    ).toEqual([expect.stringContaining('Scopes apply to the issuer override')]);
  });

  it('rejects the advanced authorization-server settings without an issuer', () => {
    for (const overrides of [
      { tokenEndpoint: 'https://idp/token' },
      { useExistingSecret: true, clientSecretName: 'oauth-client' },
      { grantScope: 'subject' as const },
    ]) {
      expect(
        validateNewMcpServerForm(
          state({ authMode: 'own-account', ...overrides }),
        ),
      ).toContainEqual(expect.stringContaining('set an issuer too'));
    }
  });

  it('requires the pinned endpoints to be set together, as https URLs', () => {
    const pinned = (overrides: Partial<NewMcpServerFormState>) =>
      validateNewMcpServerForm(
        state({
          authMode: 'own-account',
          issuer: 'https://auth.example.com',
          ...overrides,
        }),
      );

    expect(
      pinned({ authorizationEndpoint: 'https://idp/authorize' }),
    ).toContainEqual(expect.stringContaining('set both or neither'));
    expect(
      pinned({
        authorizationEndpoint: 'http://idp/authorize',
        tokenEndpoint: 'https://idp/token',
      }),
    ).toContainEqual('Authorization endpoint must be an https URL');
    expect(
      pinned({
        authorizationEndpoint: 'https://idp/authorize',
        tokenEndpoint: 'https://idp/token',
      }),
    ).toEqual([]);
  });

  it('requires a name for an existing client-credentials Secret', () => {
    expect(
      validateNewMcpServerForm(
        state({
          authMode: 'own-account',
          issuer: 'https://auth.example.com',
          useExistingSecret: true,
          clientIdKey: 'clientId',
        }),
      ),
    ).toEqual(["Enter the Secret's name."]);
  });

  it('ignores Secret fields of the other source when New Secret is chosen', () => {
    const leftOver = state({
      authMode: 'own-account',
      issuer: 'https://auth.example.com',
      clientSecretName: 'oauth-client',
      clientIdKey: 'clientId',
    });
    expect(validateNewMcpServerForm(leftOver)).toEqual([]);
    expect(
      composeMcpServerDefinition(leftOver).auth?.authorizationServer,
    ).toEqual({ issuer: 'https://auth.example.com' });
  });

  it('requires a signing region for AWS SigV4', () => {
    expect(validateNewMcpServerForm(sigv4State({ sigv4Region: '  ' }))).toEqual(
      ['Enter the signing region for AWS SigV4, e.g. eu-central-1.'],
    );
  });

  it('rejects AWS SigV4 on the SSE transport, and says where to fix it', () => {
    expect(validateNewMcpServerForm(sigv4State({ transport: 'sse' }))).toEqual([
      expect.stringContaining(
        'AWS SigV4 signing needs the Streamable HTTP transport',
      ),
    ]);
  });

  it('flags request metadata that the composed map would silently swallow', () => {
    expect(
      validateNewMcpServerForm(
        state({ meta: [{ key: '', value: 'eu-north-1' }] }),
      ),
    ).toEqual(['Request metadata needs a name for every value']);
    expect(
      validateNewMcpServerForm(
        state({
          meta: [
            { key: 'AWS_REGION', value: 'eu-north-1' },
            { key: 'AWS_REGION', value: 'eu-central-1' },
          ],
        }),
      ),
    ).toEqual(['Request metadata has AWS_REGION more than once']);
  });

  it('ignores auth-mode-specific fields left over from another mode', () => {
    expect(
      validateNewMcpServerForm(
        state({
          authMode: 'platform-sso',
          issuer: 'not-a-url',
          scopes: 'openid',
        }),
      ),
    ).toEqual([]);
  });
});

describe('sigv4Advisories', () => {
  it('says nothing for a server that does not sign requests', () => {
    expect(sigv4Advisories(state({ authMode: 'platform-sso' }))).toEqual([]);
  });

  it('warns when the signing region is not the endpoint’s region', () => {
    expect(sigv4Advisories(sigv4State({ sigv4Region: 'us-east-1' }))).toEqual([
      expect.stringContaining('The URL does not mention us-east-1'),
      expect.anything(),
    ]);
  });

  it('warns when the operating region is missing, the silent-wrong-answer case', () => {
    expect(sigv4Advisories(sigv4State())).toEqual([
      expect.stringContaining('No AWS_REGION in request metadata'),
    ]);
  });

  it('goes quiet once both are set', () => {
    expect(
      sigv4Advisories(
        sigv4State({ meta: [{ key: 'AWS_REGION', value: 'eu-north-1' }] }),
      ),
    ).toEqual([]);
  });

  it('never blocks: advisories are not validation errors', () => {
    const advised = sigv4State();
    expect(sigv4Advisories(advised).length).toBeGreaterThan(0);
    expect(validateNewMcpServerForm(advised)).toEqual([]);
  });
});

describe('authFieldAvailability', () => {
  it('offers the issuer override only for "own account"', () => {
    const withIssuer = authFieldAvailability(
      state({ authMode: 'own-account', issuer: 'https://auth.example.com' }),
    );
    expect(withIssuer.authorizationServer.available).toBe(true);
    expect(withIssuer.requiredAudiences.available).toBe(false);

    const withoutIssuer = authFieldAvailability(
      state({ authMode: 'own-account' }),
    );
    expect(withoutIssuer.authorizationServer.available).toBe(true);
  });

  it('offers required audiences only for Platform SSO, and explains the exclusion', () => {
    const sso = authFieldAvailability(state({ authMode: 'platform-sso' }));
    expect(sso.requiredAudiences.available).toBe(true);
    expect(sso.authorizationServer).toEqual({
      available: false,
      reason: expect.stringContaining('the CRD rejects both together'),
    });
  });

  it('disables every auth field for a server without authentication', () => {
    const none = authFieldAvailability(state({ authMode: 'none' }));
    expect(none.authorizationServer.available).toBe(false);
    expect(none.requiredAudiences.available).toBe(false);
    expect(none.authorizationServer.reason).toContain(
      'needs no authentication',
    );
  });

  it('offers the signing configuration only for AWS SigV4', () => {
    expect(authFieldAvailability(sigv4State()).sigv4.available).toBe(true);
    expect(authFieldAvailability(state()).sigv4).toEqual({
      available: false,
      reason: expect.stringContaining('AWS SigV4 request signing'),
    });
  });

  it('withdraws the signing configuration on a transport the CRD forbids', () => {
    expect(
      authFieldAvailability(sigv4State({ transport: 'sse' })).sigv4,
    ).toEqual({
      available: false,
      reason: expect.stringContaining(
        'only with the Streamable HTTP transport',
      ),
    });
  });

  it('disables the per-user auth fields for sigv4, naming the machine identity', () => {
    // The CRD's other two sigv4 rules — no forwardToken, no authorizationServer
    // — as field states rather than submit-time errors.
    const sigv4 = authFieldAvailability(sigv4State());
    expect(sigv4.authorizationServer).toEqual({
      available: false,
      reason: expect.stringContaining("muster's own machine identity"),
    });
    expect(sigv4.requiredAudiences).toEqual({
      available: false,
      reason: expect.stringContaining('AWS SigV4 forwards no token at all'),
    });
  });

  it('always explains why a field is unavailable', () => {
    for (const authMode of [
      'none',
      'own-account',
      'platform-sso',
      'sigv4',
    ] as const) {
      for (const field of Object.values(
        authFieldAvailability(state({ authMode })),
      )) {
        expect(field.available || Boolean(field.reason)).toBe(true);
      }
    }
  });
});

// --- CRD conformance -------------------------------------------------------
//
// The composed manifest is checked against muster's real MCPServer CRD: its
// structural schema (ajv) and its CEL rules, both read from the vendored CRD
// rather than restated here — so a rule muster adds or changes lands in this
// test as soon as the fixture is refreshed.
//
// The fixture is giantswarm/muster's helm/muster/crds/
// muster.giantswarm.io_mcpservers.yaml, converted to JSON (frontend packages
// may not import `fs`, so the schema arrives as a module). Refresh it with:
//
//   node -e "const y=require('js-yaml'),f=require('fs');f.writeFileSync(
//     'plugins/muster/src/lib/__fixtures__/mcpservers.crd.json',
//     JSON.stringify(y.load(f.readFileSync(process.argv[1],'utf-8')),null,2)+'\n')" \
//     ../muster/helm/muster/crds/muster.giantswarm.io_mcpservers.yaml

type CrdSchema = {
  default?: unknown;
  properties?: Record<string, CrdSchema>;
  'x-kubernetes-validations'?: { rule: string; message: string }[];
};

const openApiSchema = mcpServersCrd.spec.versions[0].schema
  .openAPIV3Schema as CrdSchema;

/**
 * Evaluates the CEL subset the MCPServer CRD uses — `has()`, `!`, `&&`, `||`,
 * `==`, `!=`, parentheses, string and boolean literals — against a candidate
 * object, so the rules can be run as written instead of paraphrased in test
 * assertions.
 *
 * Comparison operands are values, not just paths: the sigv4 pairing rule
 * (`has(self.sigv4) == (self.type == 'sigv4')`) compares two boolean
 * sub-expressions.
 *
 * ponytail: a hand-rolled evaluator for the shapes this CRD actually carries,
 * deliberately loud (it throws) about anything outside them, so an unsupported
 * rule fails the test rather than silently passing. Upgrade path if muster's
 * rules grow beyond this: a real CEL package.
 */
function evaluateCel(rule: string, self: unknown): boolean {
  const tokens = rule.match(/'[^']*'|[A-Za-z_][\w.]*|&&|\|\||==|!=|[!()]/g);
  if (!tokens || tokens.join('').length !== rule.replace(/\s+/g, '').length) {
    throw new Error(`CEL rule uses unsupported syntax: ${rule}`);
  }

  let pos = 0;
  const peek = () => tokens[pos];
  const next = (expected?: string) => {
    const token = tokens[pos++];
    if (expected !== undefined && token !== expected) {
      throw new Error(`expected ${expected}, got ${token} in: ${rule}`);
    }
    return token;
  };

  // `self.spec.command` → the value at that path, undefined if any parent is
  // missing (CEL would error; every rule guards with has() before reading).
  const resolve = (path: string): unknown =>
    path.split('.').reduce<unknown>((value, key) => {
      if (key === 'self') {
        return self;
      }
      return value === null || value === undefined
        ? undefined
        : (value as Record<string, unknown>)[key];
    }, undefined);

  const literal = (token: string): unknown => {
    if (token.startsWith("'")) {
      return token.slice(1, -1);
    }
    if (token === 'true' || token === 'false') {
      return token === 'true';
    }
    throw new Error(`unsupported literal ${token} in: ${rule}`);
  };

  const asBoolean = (value: unknown): boolean => {
    if (typeof value !== 'boolean') {
      throw new Error(`expected a boolean, got ${String(value)} in: ${rule}`);
    }
    return value;
  };

  const primary = (): unknown => {
    if (peek() === '!') {
      next('!');
      return !asBoolean(primary());
    }
    if (peek() === '(') {
      next('(');
      const value = disjunction();
      next(')');
      // A sub-expression's held-back error resurfaces here: outside a
      // short-circuit it must fail loudly, never compare as a value.
      if (value instanceof Error) {
        throw value;
      }
      return value;
    }
    if (peek() === 'has') {
      next('has');
      next('(');
      const path = next();
      next(')');
      return resolve(path) !== undefined;
    }
    const token = next();
    return token.startsWith("'") || token === 'true' || token === 'false'
      ? literal(token)
      : resolve(token);
  };

  const equality = (): unknown => {
    let value = primary();
    while (peek() === '==' || peek() === '!=') {
      const operator = next();
      const right = primary();
      value = operator === '==' ? value === right : value !== right;
    }
    return value;
  };

  // CEL's && and || are commutative short-circuits: `true || error` is true
  // and `false && error` is false (the guard pattern `!has(self.x) || !self.x`
  // relies on it). Operands are still parsed left to right — only their
  // evaluation errors are held back until the other operand cannot decide.
  const tryEval = (operand: () => unknown): boolean | Error => {
    try {
      return asBoolean(operand());
    } catch (error) {
      return error as Error;
    }
  };

  const conjunction = (): boolean | Error => {
    let value = tryEval(equality);
    while (peek() === '&&') {
      next('&&');
      const right = tryEval(equality);
      if (value === false || right === false) {
        value = false;
      } else if (!(value instanceof Error)) {
        value = right;
      }
    }
    return value;
  };

  function disjunction(): boolean | Error {
    let value = conjunction();
    while (peek() === '||') {
      next('||');
      const right = conjunction();
      if (value === true || right === true) {
        value = true;
      } else if (!(value instanceof Error)) {
        value = right;
      }
    }
    return value;
  }

  const result = disjunction();
  if (result instanceof Error) {
    throw result;
  }
  if (pos !== tokens.length) {
    throw new Error(`trailing tokens in: ${rule}`);
  }
  return result;
}

/**
 * Applies the CRD's `default`s the way the API server does — before its CEL
 * rules run. Without this, a rule that reads a defaulted field (`sigv4 signs as
 * muster's own machine identity...` checks `self.forwardToken == false`) would
 * see `undefined` for a field the wizard legitimately omits, and report a
 * violation the API server never would.
 */
function applyCrdDefaults(schema: CrdSchema, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const defaulted = { ...(value as Record<string, unknown>) };
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    if (defaulted[key] === undefined) {
      if (property.default !== undefined) {
        defaulted[key] = property.default;
      }
    } else {
      defaulted[key] = applyCrdDefaults(property, defaulted[key]);
    }
  }
  return defaulted;
}

function celViolations(schema: CrdSchema, self: unknown): string[] {
  return (schema['x-kubernetes-validations'] ?? [])
    .filter(({ rule }) => !evaluateCel(rule, self))
    .map(({ message }) => message);
}

const authSchema = ((openApiSchema.properties?.spec as CrdSchema).properties
  ?.auth as CrdSchema) ?? { 'x-kubernetes-validations': [] };

// strict: false — the schema carries k8s vocabulary (x-kubernetes-validations,
// descriptions on every node) ajv doesn't know; formats are only used by status
// timestamps, which the wizard never writes.
const validateStructure = new Ajv({
  strict: false,
  validateFormats: false,
}).compile(openApiSchema);

/**
 * The custom resource the API server would see for this form state: muster's
 * create tool turns the flat definition into exactly this (api_adapter.go
 * convertRequestToCRD), so validating it validates what the wizard causes.
 */
function customResource(formState: NewMcpServerFormState): Record<
  string,
  unknown
> & {
  spec: { auth?: unknown };
} {
  const { name, ...spec } = composeMcpServerDefinition(formState);
  return {
    apiVersion: 'muster.giantswarm.io/v1alpha1',
    kind: 'MCPServer',
    metadata: { name, namespace: 'agent-platform' },
    spec,
  };
}

describe('CRD conformance', () => {
  const cases: [string, NewMcpServerFormState][] = [
    ['no auth', state()],
    ['own account (discovery)', state({ authMode: 'own-account' })],
    [
      'own account (issuer override)',
      state({
        authMode: 'own-account',
        issuer: 'https://auth.example.com',
        scopes: 'openid mcp:read',
      }),
    ],
    [
      'own account (pinned endpoints, client-credentials Secret, subject grant)',
      state({
        authMode: 'own-account',
        issuer: 'https://github.com',
        scopes: 'repo',
        authorizationEndpoint: 'https://github.com/login/oauth/authorize',
        tokenEndpoint: 'https://github.com/login/oauth/access_token',
        useExistingSecret: true,
        clientSecretName: 'github-oauth-client',
        clientSecretNamespace: 'muster',
        clientIdKey: 'clientId',
        clientSecretKey: 'clientSecret',
        grantScope: 'subject',
      }),
    ],
    [
      'platform SSO',
      state({
        authMode: 'platform-sso',
        requiredAudiences: ['dex-k8s-authenticator'],
      }),
    ],
    ['sse transport', state({ transport: 'sse' })],
    [
      'sigv4 (signing region only)',
      state({
        url: 'https://aws-mcp.eu-central-1.api.aws/mcp',
        authMode: 'sigv4',
        sigv4Region: 'eu-central-1',
      }),
    ],
    [
      'sigv4 (service, assumed role and operating region)',
      state({
        url: 'https://aws-mcp.eu-central-1.api.aws/mcp',
        authMode: 'sigv4',
        sigv4Region: 'eu-central-1',
        sigv4Service: 'aws-mcp',
        sigv4RoleArn: 'arn:aws:iam::123456789012:role/muster-mcp',
        meta: [{ key: 'AWS_REGION', value: 'eu-central-1' }],
      }),
    ],
    [
      'request metadata without sigv4',
      state({ meta: [{ key: 'AWS_REGION', value: 'eu-north-1' }] }),
    ],
    [
      'longest allowed description',
      state({ description: 'x'.repeat(500), url: 'http://mcp:8080/mcp' }),
    ],
  ];

  it.each(cases)('%s: matches the CRD structural schema', (_, formState) => {
    expect(validateStructure(customResource(formState))).toBe(true);
    expect(validateStructure.errors).toBeNull();
  });

  it.each(cases)('%s: satisfies every CEL rule', (_, formState) => {
    // Defaulted first, because that is the order the API server works in.
    const cr = applyCrdDefaults(
      openApiSchema,
      customResource(formState),
    ) as ReturnType<typeof customResource>;
    expect(celViolations(openApiSchema, cr)).toEqual([]);
    expect(cr.spec.auth ? celViolations(authSchema, cr.spec.auth) : []).toEqual(
      [],
    );
  });

  // Guards the guard: an evaluator that accepted everything would make the
  // conformance cases above pass vacuously.
  it('catches definitions the CEL rules reject', () => {
    expect(
      celViolations(openApiSchema, {
        spec: { type: 'stdio', url: 'https://mcp.example.com/mcp' },
      }),
    ).toEqual(['command is required when type is stdio']);
    expect(celViolations(openApiSchema, { spec: { type: 'sse' } })).toEqual([
      'url is required when type is streamable-http or sse',
    ]);
    // The two exclusions the wizard's auth modes make unreachable.
    expect(
      celViolations(authSchema, {
        type: 'none',
        authorizationServer: { issuer: 'https://auth.example.com' },
      }),
    ).toEqual(['authorizationServer is only valid when type is oauth']);
    expect(
      celViolations(authSchema, {
        type: 'oauth',
        forwardToken: true,
        authorizationServer: { issuer: 'https://auth.example.com' },
      }),
    ).toEqual([
      expect.stringContaining('forwardToken bypasses per-backend OAuth'),
    ]);
    // The sigv4 rules, in both directions of the pairing.
    expect(
      celViolations(authSchema, { type: 'sigv4', forwardToken: false }),
    ).toEqual([
      expect.stringContaining("type 'sigv4' requires the sigv4 block"),
    ]);
    expect(
      celViolations(authSchema, {
        type: 'oauth',
        forwardToken: false,
        sigv4: { region: 'eu-central-1' },
      }),
    ).toEqual([
      expect.stringContaining("type 'sigv4' requires the sigv4 block"),
    ]);
    expect(
      celViolations(authSchema, {
        type: 'sigv4',
        forwardToken: true,
        sigv4: { region: 'eu-central-1' },
      }),
    ).toEqual([
      expect.stringContaining("sigv4 signs as muster's own machine identity"),
    ]);
    expect(
      celViolations(authSchema, {
        type: 'sigv4',
        forwardToken: false,
        sigv4: { region: 'eu-central-1' },
        tokenExchange: { enabled: true },
      }),
    ).toEqual([
      expect.stringContaining("sigv4 signs as muster's own machine identity"),
    ]);
    // ...and the two spec-level rules sigv4 brought with it.
    expect(
      celViolations(openApiSchema, {
        spec: {
          type: 'sse',
          url: 'https://aws-mcp.eu-central-1.api.aws/mcp',
          auth: { type: 'sigv4', sigv4: { region: 'eu-central-1' } },
        },
      }),
    ).toEqual(['auth.sigv4 is only allowed when type is streamable-http']);
    expect(
      celViolations(openApiSchema, {
        spec: {
          type: 'stdio',
          command: 'mcp-server',
          meta: { AWS_REGION: 'x' },
        },
      }),
    ).toEqual([
      'meta field is only allowed when type is streamable-http or sse',
    ]);
  });

  it('rejects a URL the CRD pattern refuses (so validation must catch it first)', () => {
    expect(
      validateStructure(customResource(state({ url: 'mcp.example.com' }))),
    ).toBe(false);
    expect(validateNewMcpServerForm(state({ url: 'mcp.example.com' }))).toEqual(
      [expect.stringContaining('URL must be an http(s) URL')],
    );
  });
});

function registered(spec: Record<string, unknown>): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name: 'weather-mcp' },
      spec: {
        type: 'streamable-http',
        url: 'https://w.example.com/mcp',
        ...spec,
      },
    } as never,
    'gaggle',
  );
}

/**
 * `spec` as the cluster returns it: the CRD defaults `type`, `forwardToken`
 * and `forwardIdentity` inside any auth block, whatever it was created with.
 */
function stored(spec: Record<string, unknown>): Record<string, unknown> {
  if (!spec.auth) {
    return spec;
  }
  return {
    ...spec,
    auth: {
      type: 'none',
      forwardToken: false,
      forwardIdentity: false,
      ...(spec.auth as object),
    },
  };
}

describe('editing a registered server in the wizard', () => {
  it.each([
    [{}, 'none'],
    [{ auth: { type: 'oauth' } }, 'own-account'],
    [{ auth: { forwardToken: true } }, 'platform-sso'],
    [{ auth: { type: 'sigv4', sigv4: { region: 'eu-west-1' } } }, 'sigv4'],
  ])('reads the auth mode back from %j', (spec, mode) => {
    expect(formStateFromServer(registered(spec)).authMode).toBe(mode);
    expect(formStateFromServer(registered(stored(spec))).authMode).toBe(mode);
  });

  it('round-trips what the wizard models', () => {
    const server = registered({
      type: 'sse',
      description: 'Forecasts',
      auth: {
        type: 'oauth',
        authorizationServer: { issuer: 'https://idp', scopes: 'read' },
      },
      meta: { AWS_REGION: 'eu-west-1' },
    });
    const form = formStateFromServer(server);

    expect(form).toMatchObject({
      name: 'weather-mcp',
      slug: 'weather-mcp',
      installation: 'gaggle',
      transport: 'sse',
      issuer: 'https://idp',
      scopes: 'read',
      meta: [{ key: 'AWS_REGION', value: 'eu-west-1' }],
    });
    expect(validateNewMcpServerForm(form)).toEqual([]);
    const { name, type, url, description, auth, meta } =
      toMcpServerDefinition(server);
    expect(composeMcpServerDefinition(form)).toEqual({
      name,
      type,
      url,
      description,
      auth,
      meta,
      autoStart: true,
    });
  });

  it.each([
    // forwardToken implies OAuth in muster, so an explicit `type: oauth` next
    // to it is still Platform SSO — and nothing else to fill in.
    [
      { auth: { type: 'oauth', forwardToken: true, requiredAudiences: ['a'] } },
      { authMode: 'platform-sso', requiredAudiences: ['a'], issuer: '' },
    ],
    // OAuth with discovery: no issuer override to pre-fill.
    [
      { auth: { type: 'oauth' } },
      { authMode: 'own-account', issuer: '', scopes: '' },
    ],
    [{ auth: { type: 'none' } }, { authMode: 'none' }],
  ])('pre-fills the auth answer of %j', (spec, expected) => {
    expect(formStateFromServer(registered(spec))).toMatchObject(expected);
  });

  it('round-trips the advanced authorization-server settings', () => {
    const server = registered({
      auth: {
        type: 'oauth',
        authorizationServer: {
          issuer: 'https://github.com',
          authorizationEndpoint: 'https://github.com/login/oauth/authorize',
          tokenEndpoint: 'https://github.com/login/oauth/access_token',
          clientCredentialsSecretRef: {
            name: 'github-oauth-client',
            namespace: 'muster',
            clientIdKey: 'clientId',
            clientSecretKey: 'clientSecret',
          },
          grantScope: 'subject',
        },
      },
    });

    // Such a server is editable in the wizard now that it models every key.
    expect(wizardEditBlocker(server)).toBeUndefined();
    const form = formStateFromServer(server);
    expect(form).toMatchObject({
      authMode: 'own-account',
      issuer: 'https://github.com',
      authorizationEndpoint: 'https://github.com/login/oauth/authorize',
      tokenEndpoint: 'https://github.com/login/oauth/access_token',
      useExistingSecret: true,
      clientSecretName: 'github-oauth-client',
      clientSecretNamespace: 'muster',
      clientIdKey: 'clientId',
      clientSecretKey: 'clientSecret',
      grantScope: 'subject',
    });
    expect(validateNewMcpServerForm(form)).toEqual([]);
    expect(composeMcpServerDefinition(form).auth).toEqual(server.getAuth());
  });

  it('names the form by the server’s display name, keeping its technical name', () => {
    const server = registered({});
    server.jsonData.metadata.annotations = {
      'ui.giantswarm.io/display-name': 'Weather',
    };
    const form = formStateFromServer(server);

    expect(form).toMatchObject({ name: 'Weather', slug: 'weather-mcp' });
    // Unchanged, the update leaves the annotation alone.
    expect(
      composeMcpServerDefinition(form, { stored: 'Weather' }),
    ).not.toHaveProperty('displayName');
    expect(
      composeMcpServerDefinition(
        { ...form, name: 'Weather forecasts' },
        { stored: 'Weather' },
      ).displayName,
    ).toBe('Weather forecasts');
  });

  it('sends a changed display name, never one carried from the last save', () => {
    const saved = composeMcpServerDefinition(state());
    expect(saved.displayName).toBe('Weather MCP');

    const unchanged = mergeOntoExisting(
      saved,
      composeMcpServerDefinition(state(), { stored: 'Weather MCP' }),
    );
    expect(unchanged).not.toHaveProperty('displayName');
  });

  it('trims request metadata values on the round trip', () => {
    // The wizard composes trimmed values, so a stored value with surrounding
    // whitespace is saved back without it once the server is edited.
    const form = formStateFromServer(
      registered({ meta: { AWS_REGION: ' eu-west-1 ' } }),
    );

    expect(form.meta).toEqual([{ key: 'AWS_REGION', value: ' eu-west-1 ' }]);
    expect(composeMcpServerDefinition(form).meta).toEqual({
      AWS_REGION: 'eu-west-1',
    });
  });

  it('keeps the fields the wizard has no control for on update', () => {
    const existing = toMcpServerDefinition(
      registered({
        autoStart: true,
        timeout: 90,
        toolPrefix: 'wx',
        headers: { 'X-Team': 'bumblebee' },
      }),
    );
    const edited = composeMcpServerDefinition(state({ slug: 'weather-mcp' }));

    expect(mergeOntoExisting(existing, edited)).toMatchObject({
      name: 'weather-mcp',
      url: 'https://weather.example.com/mcp',
      autoStart: true,
      timeout: 90,
      toolPrefix: 'wx',
      headers: { 'X-Team': 'bumblebee' },
    });
  });

  it('keeps the server’s autoStart, reading a missing one as off', () => {
    // muster's update always overwrites autoStart (omitted = false), and the
    // wizard's `true` is only a registration default: an edit must not turn
    // it on.
    const edited = composeMcpServerDefinition(state({ slug: 'weather-mcp' }));

    expect(
      mergeOntoExisting(
        toMcpServerDefinition(registered({ autoStart: false })),
        edited,
      ).autoStart,
    ).toBe(false);
    expect(
      mergeOntoExisting(toMcpServerDefinition(registered({})), edited)
        .autoStart,
    ).toBe(false);
  });

  it('sends a cleared auth answer or metadata explicitly', () => {
    // muster's update keeps a stored auth/meta block it is not sent, so
    // omitting them would silently keep the old values.
    const existing = toMcpServerDefinition(
      registered({
        auth: { type: 'oauth' },
        meta: { AWS_REGION: 'eu-west-1' },
      }),
    );
    const merged = mergeOntoExisting(
      existing,
      composeMcpServerDefinition(state({ slug: 'weather-mcp' })),
    );

    expect(merged.auth).toEqual({ type: 'none' });
    expect(merged.meta).toEqual({});
    // A server that never had either gets neither.
    const plain = mergeOntoExisting(
      toMcpServerDefinition(registered({})),
      composeMcpServerDefinition(state({ slug: 'weather-mcp' })),
    );
    expect(plain).not.toHaveProperty('auth');
    expect(plain).not.toHaveProperty('meta');
  });

  it('keeps the stored description when it is cleared', () => {
    // muster only replaces a description with a non-empty one, so the review
    // step shows the description the server keeps.
    const merged = mergeOntoExisting(
      toMcpServerDefinition(registered({ description: 'Old' })),
      composeMcpServerDefinition(
        state({ slug: 'weather-mcp', description: '' }),
      ),
    );

    expect(merged.description).toBe('Old');
  });

  it('leaves suspended out of the update', () => {
    // muster's update treats an omitted suspended as "keep the current
    // lifecycle state", so a deactivated server stays deactivated.
    const merged = mergeOntoExisting(
      toMcpServerDefinition(registered({ suspended: true })),
      composeMcpServerDefinition(state({ slug: 'weather-mcp' })),
    );

    expect(merged).not.toHaveProperty('suspended');
  });

  it.each([
    [{ type: 'stdio' }, /only covers remote/],
    [
      { auth: { forwardToken: true, tokenExchange: { enabled: true } } },
      /uses token exchange \(cross-cluster SSO\), which the registration wizard does not offer/,
    ],
    // tokenExchange-only once read as "No authentication".
    [{ auth: { tokenExchange: { enabled: true } } }, /does not offer/],
    // A disabled block is still a setting the wizard would drop.
    [
      { auth: { forwardToken: true, tokenExchange: { enabled: false } } },
      /cannot show or keep/,
    ],
    [
      { auth: { forwardToken: true, localMint: { enabled: true } } },
      /cannot show or keep/,
    ],
    // Pinned endpoints are wizard fields now; `expectedIssuer` is not.
    [
      {
        auth: {
          type: 'oauth',
          authorizationServer: {
            issuer: 'https://idp',
            authorizationEndpoint: 'https://idp/authorize',
            tokenEndpoint: 'https://idp/token',
            expectedIssuer: 'https://idp',
          },
        },
      },
      /cannot show or keep: authorizationServer.expectedIssuer/,
    ],
    // Keys the wizard knows, but of another answer than the server's: the
    // answer it is pre-filled with would compose the auth block without them.
    [
      { auth: { type: 'oauth', requiredAudiences: ['x'] } },
      /cannot show or keep/,
    ],
    [
      { auth: { type: 'none', authorizationServer: { issuer: 'https://i' } } },
      /cannot show or keep/,
    ],
    [
      {
        auth: {
          forwardToken: true,
          authorizationServer: { issuer: 'https://i' },
        },
      },
      /cannot show or keep/,
    ],
    // An auth type this frontend does not know is not "No authentication".
    [
      { auth: { type: 'mtls' } },
      /uses unrecognised authentication, which the registration wizard does not offer/,
    ],
  ])('keeps %j out of the wizard, pointing to the JSON editor', (spec, why) => {
    for (const read of [spec, stored(spec)]) {
      const reason = wizardEditBlocker(registered(read));
      expect(reason).toMatch(why);
      expect(reason).toMatch(/Edit as JSON/);
    }
  });

  it('names the settings that keep a server out of the wizard', () => {
    expect(
      wizardEditBlocker(
        registered(
          stored({ auth: { type: 'oauth', requiredAudiences: ['x'] } }),
        ),
      ),
    ).toMatch(/cannot show or keep: requiredAudiences\./);
    expect(
      wizardEditBlocker(
        registered(
          stored({
            auth: {
              type: 'oauth',
              forwardIdentity: true,
              authorizationServer: { issuer: 'https://i', expectedIssuer: 'x' },
            },
          }),
        ),
      ),
    ).toMatch(/forwardIdentity, authorizationServer\.expectedIssuer\./);
  });

  it('lets every auth answer the wizard offers through', () => {
    for (const spec of [
      {},
      { auth: { type: 'none' } },
      { auth: { type: 'oauth' } },
      { auth: { type: 'oauth', authorizationServer: { issuer: 'https://i' } } },
      { auth: { forwardToken: true, requiredAudiences: ['a'] } },
      { auth: { type: 'oauth', forwardToken: true, requiredAudiences: ['a'] } },
      { auth: { type: 'sigv4', sigv4: { region: 'eu-west-1' } } },
      { type: 'sse' },
    ]) {
      // As composed, and as the cluster returns it with the CRD's defaults.
      expect(wizardEditBlocker(registered(spec))).toBeUndefined();
      expect(wizardEditBlocker(registered(stored(spec)))).toBeUndefined();
    }
  });
});

describe('client credentials typed into the wizard', () => {
  const ownAccount = (overrides: Partial<NewMcpServerFormState> = {}) =>
    state({
      authMode: 'own-account',
      issuer: 'https://app.hubspot.com',
      ...overrides,
    });
  const typed = { clientId: ' id-1 ', clientSecret: ' s3cret ' };
  const none = { clientId: '', clientSecret: '' };

  it('tells the Secret muster stored for the server from any other', () => {
    expect(isStoredClientSecret('hubspot', 'hubspot-oauth-client-a1b2c')).toBe(
      true,
    );
    for (const name of [
      'hubspot-oauth-client',
      'hubspot-oauth-client-a1b2',
      'hubspot-oauth-client-A1B2C',
      'hubspot-oauth-client-a1b2c3',
      'other-oauth-client-a1b2c',
      'github-oauth-client',
    ]) {
      expect(isStoredClientSecret('hubspot', name)).toBe(false);
    }
    // muster cuts a long server name so the Secret's name stays a DNS label.
    const long = 'a'.repeat(60);
    expect(
      isStoredClientSecret(long, `${'a'.repeat(44)}-oauth-client-zz999`),
    ).toBe(true);
  });

  it('wants both values and an issuer, or neither', () => {
    expect(clientCredentialsProblems(ownAccount(), none)).toEqual([]);
    expect(clientCredentialsProblems(ownAccount(), typed)).toEqual([]);
    expect(
      clientCredentialsProblems(ownAccount(), { ...typed, clientSecret: ' ' }),
    ).toEqual([
      { field: 'clientSecret', message: 'Enter the client secret too.' },
    ]);
    expect(
      clientCredentialsProblems(ownAccount(), { ...typed, clientId: '' }),
    ).toEqual([{ field: 'clientId', message: 'Enter the client ID too.' }]);
    expect(
      clientCredentialsProblems(ownAccount({ issuer: '' }), typed),
    ).toEqual([{ field: 'issuer', message: 'Enter an issuer too.' }]);
  });

  it('asks for both values when they are required, typed or not', () => {
    expect(
      clientCredentialsProblems(ownAccount(), none, { required: true }),
    ).toEqual([
      { field: 'clientId', message: 'Enter the client ID.' },
      { field: 'clientSecret', message: 'Enter the client secret.' },
    ]);
    expect(
      clientCredentialsProblems(ownAccount(), typed, { required: true }),
    ).toEqual([]);
  });

  it('tells a stored client is pointed at another authorization server', () => {
    const saved = {
      issuer: 'https://idp',
      authorizationEndpoint: 'https://idp/authorize',
      tokenEndpoint: 'https://idp/token',
      revocationEndpoint: 'https://idp/revoke',
    };
    expect(clientBindingChanged({ ...saved, scopes: 'read' }, saved)).toBe(
      false,
    );
    expect(
      clientBindingChanged({ ...saved, grantScope: 'subject' }, saved),
    ).toBe(false);
    for (const changed of [
      { issuer: 'https://other' },
      { authorizationEndpoint: 'https://idp/oauth/authorize' },
      { tokenEndpoint: 'https://idp/oauth/token' },
      { revocationEndpoint: undefined },
    ]) {
      expect(clientBindingChanged({ ...saved, ...changed }, saved)).toBe(true);
    }
    expect(clientBindingChanged(undefined, saved)).toBe(true);
  });

  it('keeps a revocation endpoint the wizard does not show on an edit', () => {
    const server = registered({
      auth: {
        type: 'oauth',
        authorizationServer: {
          issuer: 'https://idp',
          revocationEndpoint: 'https://idp/revoke',
          clientCredentialsSecretRef: {
            name: 'weather-mcp-oauth-client-x7k2p',
          },
        },
      },
    });
    expect(wizardEditBlocker(server)).toBeUndefined();
    const form = formStateFromServer(server);
    const existing = toMcpServerDefinition(server);

    const edited = mergeOntoExisting(
      existing,
      composeMcpServerDefinition({ ...form, scopes: 'read' }),
    );
    expect(edited.auth?.authorizationServer).toEqual({
      issuer: 'https://idp',
      scopes: 'read',
      revocationEndpoint: 'https://idp/revoke',
      clientCredentialsSecretRef: { name: 'weather-mcp-oauth-client-x7k2p' },
    });
    expect(
      clientBindingChanged(
        edited.auth?.authorizationServer,
        server.getAuth()?.authorizationServer,
      ),
    ).toBe(false);

    // Another issuer is another server: its endpoints are discovered.
    const moved = mergeOntoExisting(
      existing,
      composeMcpServerDefinition({ ...form, issuer: 'https://other' }),
    );
    expect(moved.auth?.authorizationServer).not.toHaveProperty(
      'revocationEndpoint',
    );
  });

  it('lets an issuer be cleared on a connector with a stored client', () => {
    const form = ownAccount({
      issuer: '',
      clientSecretName: 'weather-mcp-oauth-client-x7k2p',
    });
    expect(validateNewMcpServerForm(form)).toEqual([]);
    expect(composeMcpServerDefinition(form).auth).toEqual({ type: 'oauth' });
  });

  it('sends only complete, applicable credentials, trimmed', () => {
    expect(clientCredentialsArgument(ownAccount(), typed)).toEqual({
      clientId: 'id-1',
      clientSecret: 's3cret',
    });
    expect(
      clientCredentialsArgument(ownAccount(), { ...typed, clientId: '' }),
    ).toBeUndefined();
    expect(
      clientCredentialsArgument(ownAccount({ issuer: '' }), typed),
    ).toBeUndefined();
    expect(
      clientCredentialsArgument(ownAccount({ useExistingSecret: true }), typed),
    ).toBeUndefined();
    expect(
      clientCredentialsArgument(state({ authMode: 'none' }), typed),
    ).toBeUndefined();
  });

  it('never puts typed values into the form state or the definition', () => {
    const form = ownAccount();
    expect(JSON.stringify(form)).not.toContain('s3cret');
    expect(JSON.stringify(composeMcpServerDefinition(form))).not.toContain(
      's3cret',
    );
  });

  it('reads a stored client back as stored, and keeps its reference on an edit', () => {
    const ref = { name: 'weather-mcp-oauth-client-x7k2p' };
    const server = registered({
      auth: {
        type: 'oauth',
        authorizationServer: {
          issuer: 'https://idp',
          clientCredentialsSecretRef: ref,
        },
      },
    });
    const form = formStateFromServer(server);

    expect(form.useExistingSecret).toBe(false);
    expect(hasStoredClientSecret(form)).toBe(true);
    expect(validateNewMcpServerForm(form)).toEqual([]);
    // An ordinary edit sends the stored reference back as it was.
    const edited = mergeOntoExisting(
      toMcpServerDefinition(server),
      composeMcpServerDefinition({ ...form, scopes: 'read' }),
    );
    expect(edited.auth?.authorizationServer).toEqual({
      issuer: 'https://idp',
      scopes: 'read',
      clientCredentialsSecretRef: ref,
    });
    // A replacement goes without it: muster sets the reference itself.
    expect(withoutClientSecretRef(edited).auth?.authorizationServer).toEqual({
      issuer: 'https://idp',
      scopes: 'read',
    });
  });

  it('reads any other named Secret back as an existing one', () => {
    const form = formStateFromServer(
      registered({
        auth: {
          type: 'oauth',
          authorizationServer: {
            issuer: 'https://idp',
            clientCredentialsSecretRef: { name: 'github-oauth-client' },
          },
        },
      }),
    );
    expect(form.useExistingSecret).toBe(true);
    expect(hasStoredClientSecret(form)).toBe(false);
  });

  it('leaves a definition without a reference as it is', () => {
    const definition = composeMcpServerDefinition(ownAccount());
    expect(withoutClientSecretRef(definition)).toBe(definition);
  });
});

describe('hasUserInput', () => {
  it('ignores the mirrored installation but not what was typed', () => {
    expect(hasUserInput({ ...emptyFormState, installation: 'gaggle' })).toBe(
      false,
    );
    expect(hasUserInput({ ...emptyFormState, url: 'https://x' })).toBe(true);
    expect(
      hasUserInput({
        ...emptyFormState,
        meta: [{ key: 'A', value: '' }],
      }),
    ).toBe(true);
  });
});

describe('wizardAuthModeLabel', () => {
  it.each([
    ['none', state()],
    ['own-account', state({ authMode: 'own-account' })],
    ['platform-sso', state({ authMode: 'platform-sso' })],
    ['sigv4', sigv4State()],
  ])(
    'names the %s answer as the servers table names the server it registers',
    (_, answer) => {
      const server = registered(
        composeMcpServerDefinition(answer) as unknown as Record<
          string,
          unknown
        >,
      );

      expect(wizardAuthModeLabel(answer.authMode)).toBe(
        AUTH_MODE_LABELS[serverAuthMode(server)],
      );
    },
  );

  it('maps every answer to a mode and back to itself', () => {
    for (const [answer, mode] of Object.entries(WIZARD_ANSWER_MODES)) {
      expect(WIZARD_AUTH_MODES[mode]).toBe(answer);
    }
  });

  it('gives every answer a name of its own', () => {
    const labels = (
      ['none', 'own-account', 'platform-sso', 'sigv4'] as const
    ).map(wizardAuthModeLabel);

    expect(new Set(labels).size).toBe(labels.length);
  });
});
