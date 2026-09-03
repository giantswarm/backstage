import Ajv from 'ajv';
import mcpServersCrd from './__fixtures__/mcpservers.crd.json';
import {
  authFieldAvailability,
  composeMcpServerDefinition,
  deriveSlug,
  emptyFormState,
  formatMetaEntries,
  parseMetaEntries,
  sigv4Advisories,
  toMcpServerManifestYaml,
  toMusterCliCommand,
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

  it('requires a signing region for AWS SigV4', () => {
    expect(validateNewMcpServerForm(sigv4State({ sigv4Region: '  ' }))).toEqual(
      ['Signing region is required for AWS SigV4'],
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

describe('request metadata text round trip', () => {
  it.each([
    ['AWS_REGION=eu-central-1', [{ key: 'AWS_REGION', value: 'eu-central-1' }]],
    // A value containing '=' keeps everything after the first separator.
    ['A=b=c', [{ key: 'A', value: 'b=c' }]],
    // Half-typed entries survive, so the field doesn't fight the cursor.
    ['AWS_REGION', [{ key: 'AWS_REGION', value: '' }]],
    ['  ', []],
  ])('parses %j', (text, entries) => {
    expect(parseMetaEntries(text)).toEqual(entries);
  });

  it('drops blank lines but keeps order', () => {
    expect(parseMetaEntries('A=1\n\nB=2')).toEqual([
      { key: 'A', value: '1' },
      { key: 'B', value: '2' },
    ]);
  });

  it('renders entries back to the lines they came from', () => {
    const text = 'AWS_REGION=eu-central-1\nAWS_PROFILE=default';
    expect(formatMetaEntries(parseMetaEntries(text))).toBe(text);
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
    expect(sigv4.scopes.available).toBe(false);
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

  const conjunction = (): boolean => {
    let value = asBoolean(equality());
    while (peek() === '&&') {
      next('&&');
      value = asBoolean(equality()) && value;
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

describe('toMcpServerManifestYaml', () => {
  it('renders the definition as an MCPServer manifest', () => {
    const yaml = toMcpServerManifestYaml(
      composeMcpServerDefinition(
        state({ authMode: 'own-account', issuer: 'https://auth.example.com' }),
      ),
    );

    expect(yaml).toContain('apiVersion: muster.giantswarm.io/v1alpha1');
    expect(yaml).toContain('kind: MCPServer');
    expect(yaml).toContain('name: weather-mcp');
    expect(yaml).toContain('namespace: agent-platform');
    expect(yaml).toContain('type: streamable-http');
    // toYaml quotes scalars containing YAML-special characters (the colon).
    expect(yaml).toContain('url: "https://weather.example.com/mcp"');
    expect(yaml).toContain('issuer: "https://auth.example.com"');
    // The name lives in metadata, not the spec (unlike the tool argument shape).
    expect(yaml).not.toMatch(/spec:[\s\S]*name: weather-mcp/);
  });

  it('renders the sigv4 block and request metadata for the GitOps path', () => {
    const yaml = toMcpServerManifestYaml(
      composeMcpServerDefinition(
        sigv4State({
          sigv4RoleArn: ROLE_ARN,
          meta: [{ key: 'AWS_REGION', value: 'eu-central-1' }],
        }),
      ),
    );

    expect(yaml).toContain('type: sigv4');
    expect(yaml).toContain('region: eu-central-1');
    expect(yaml).toContain(`roleArn: "${ROLE_ARN}"`);
    expect(yaml).toContain('AWS_REGION: eu-central-1');
  });
});

describe('toMusterCliCommand', () => {
  it('renders a create command for a no-auth server', () => {
    expect(toMusterCliCommand(composeMcpServerDefinition(state()))).toBe(
      'muster create mcpserver weather-mcp --type=streamable-http ' +
        '--url=https://weather.example.com/mcp --auto-start=true ' +
        "--description='Forecasts and observations'",
    );
  });

  it('adds the oauth flags for an own-account server with issuer override', () => {
    const cmd = toMusterCliCommand(
      composeMcpServerDefinition(
        state({
          description: '',
          authMode: 'own-account',
          issuer: 'https://auth.example.com',
          scopes: 'read write',
        }),
      ),
    );

    expect(cmd).toContain('--auth-type=oauth');
    expect(cmd).toContain('--auth-issuer=https://auth.example.com');
    expect(cmd).toContain("--auth-scopes='read write'");
  });

  it('adds the forward-token flags for a platform-sso server', () => {
    const cmd = toMusterCliCommand(
      composeMcpServerDefinition(
        state({
          description: '',
          authMode: 'platform-sso',
          requiredAudiences: ['aud-a', 'aud-b'],
        }),
      ),
    );

    expect(cmd).toContain('--forward-token');
    expect(cmd).toContain('--required-audiences=aud-a,aud-b');
    expect(cmd).not.toContain('--auth-type');
  });

  it('shell-quotes values that need it', () => {
    const cmd = toMusterCliCommand(
      composeMcpServerDefinition(state({ description: "it's; rm -rf /" })),
    );

    expect(cmd).toContain(`--description='it'\\''s; rm -rf /'`);
  });
  it('has no command for a definition the CLI cannot express', () => {
    // `muster create mcpserver` has no sigv4 or meta flags (cmd/create.go as of
    // muster v5.4.0). `--auth-type=sigv4` alone would compose a CR the CRD
    // rejects, so the review step must offer the manifest instead.
    expect(
      toMusterCliCommand(composeMcpServerDefinition(sigv4State())),
    ).toBeUndefined();
    expect(
      toMusterCliCommand(
        composeMcpServerDefinition(
          state({ meta: [{ key: 'AWS_REGION', value: 'eu-north-1' }] }),
        ),
      ),
    ).toBeUndefined();
  });
});
