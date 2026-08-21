import Ajv from 'ajv';
import mcpServersCrd from './__fixtures__/mcpservers.crd.json';
import {
  authFieldAvailability,
  composeMcpServerDefinition,
  deriveSlug,
  emptyFormState,
  validateNewMcpServerForm,
  type NewMcpServerFormState,
} from './mcpServerDefinition';

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

describe('composeMcpServerDefinition', () => {
  it('composes a no-auth server without an auth block', () => {
    expect(composeMcpServerDefinition(state())).toEqual({
      name: 'weather-mcp',
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
    for (const authMode of ['none', 'own-account', 'platform-sso'] as const) {
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

describe('validateNewMcpServerForm', () => {
  it('accepts a complete state', () => {
    expect(validateNewMcpServerForm(state())).toEqual([]);
  });

  it('reports every missing field of an empty form, in form order', () => {
    expect(validateNewMcpServerForm(emptyFormState)).toEqual([
      'Name is required',
      'Select an installation',
      'URL is required',
    ]);
  });

  it('asks for a technical name only once the display name is set', () => {
    expect(validateNewMcpServerForm(state({ slug: '' }))).toEqual([
      'Technical name is required',
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

describe('authFieldAvailability', () => {
  it('offers the issuer override and scopes only for "own account"', () => {
    const withIssuer = authFieldAvailability(
      state({ authMode: 'own-account', issuer: 'https://auth.example.com' }),
    );
    expect(withIssuer.authorizationServer.available).toBe(true);
    expect(withIssuer.scopes.available).toBe(true);
    expect(withIssuer.requiredAudiences.available).toBe(false);

    const withoutIssuer = authFieldAvailability(
      state({ authMode: 'own-account' }),
    );
    expect(withoutIssuer.authorizationServer.available).toBe(true);
    // Scopes belong to the override, so they stay disabled until an issuer is set.
    expect(withoutIssuer.scopes).toEqual({
      available: false,
      reason: expect.stringContaining('set an issuer first'),
    });
  });

  it('offers required audiences only for Platform SSO, and explains the exclusion', () => {
    const sso = authFieldAvailability(state({ authMode: 'platform-sso' }));
    expect(sso.requiredAudiences.available).toBe(true);
    expect(sso.authorizationServer).toEqual({
      available: false,
      reason: expect.stringContaining('the CRD rejects both together'),
    });
    expect(sso.scopes.available).toBe(false);
  });

  it('disables every auth field for a server without authentication', () => {
    const none = authFieldAvailability(state({ authMode: 'none' }));
    expect(none.authorizationServer.available).toBe(false);
    expect(none.scopes.available).toBe(false);
    expect(none.requiredAudiences.available).toBe(false);
    expect(none.authorizationServer.reason).toContain(
      'needs no authentication',
    );
  });

  it('always explains why a field is unavailable', () => {
    for (const authMode of ['none', 'own-account', 'platform-sso'] as const) {
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
  properties?: Record<string, unknown>;
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

  const primary = (): boolean => {
    if (peek() === '!') {
      next('!');
      return !primary();
    }
    if (peek() === '(') {
      next('(');
      const value = disjunction();
      next(')');
      return value;
    }
    if (peek() === 'has') {
      next('has');
      next('(');
      const path = next();
      next(')');
      return resolve(path) !== undefined;
    }
    const path = next();
    const operator = peek();
    if (operator !== '==' && operator !== '!=') {
      throw new Error(`expected a comparison after ${path} in: ${rule}`);
    }
    next();
    const expected = literal(next());
    return operator === '=='
      ? resolve(path) === expected
      : resolve(path) !== expected;
  };

  const conjunction = (): boolean => {
    let value = primary();
    while (peek() === '&&') {
      next('&&');
      value = primary() && value;
    }
    return value;
  };

  function disjunction(): boolean {
    let value = conjunction();
    while (peek() === '||') {
      next('||');
      value = conjunction() || value;
    }
    return value;
  }

  const result = disjunction();
  if (pos !== tokens.length) {
    throw new Error(`trailing tokens in: ${rule}`);
  }
  return result;
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
      'platform SSO',
      state({
        authMode: 'platform-sso',
        requiredAudiences: ['dex-k8s-authenticator'],
      }),
    ],
    ['sse transport', state({ transport: 'sse' })],
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
    const cr = customResource(formState);
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
