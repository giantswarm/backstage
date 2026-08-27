// Composes and validates the MCPServer definition behind the registration
// wizard (details → auth → review & register).
//
// `composeMcpServerDefinition` produces the flat argument shape muster's
// `core_mcpserver_validate`/`_create`/`_update` tools take (see
// internal/mcpserver/api_adapter.go) — the live write path the wizard uses, the
// same one the raw-JSON dialog uses today.
//
// Validation mirrors the CRD's own rules — the type/url dependency and the auth
// mutual exclusions its CEL rules enforce — so the wizard cannot compose a
// definition the API server would reject. The mutual exclusions are exposed as
// field *availability* (a verdict plus a reason) so the UI can disable a field
// with an explanation instead of failing on submit.
//
// Attribution needs nothing from here: muster stamps the authenticated subject
// into `ui.giantswarm.io/registered-by` itself on create (muster#1021). Sending
// annotations through the create tool would in fact fail the registration — its
// request parsing rejects unknown fields.

import type { MCPServerAuth, MCPServerSigV4 } from './k8s';
import { toYaml } from './gitops';

/**
 * Transports the wizard offers. `stdio` is a CRD option but not a wizard one:
 * it runs a local process next to muster, which is platform wiring, not user
 * registration.
 */
export type McpServerTransport = 'streamable-http' | 'sse';

/**
 * The auth question the wizard asks ("How do users authenticate to this
 * server?"), one choice per supported muster auth shape. Cross-cluster token
 * exchange stays out: it needs an out-of-band client-credentials Secret.
 */
export type McpServerAuthMode =
  /** Public or network-trusted server: `auth` is omitted entirely. */
  | 'none'
  /** The backend runs its own authorization server: `auth.type: oauth`. */
  | 'own-account'
  /** Platform-administered backend: `auth.forwardToken: true`. */
  | 'platform-sso'
  /**
   * AWS-hosted backend signed with muster's own machine identity:
   * `auth.type: sigv4` plus the `auth.sigv4` block. The odd one out — it is not
   * SSO and grants every user the same shared AWS identity (see
   * {@link SIGV4_SHARED_IDENTITY_WARNING}).
   */
  | 'sigv4';

/**
 * What choosing sigv4 actually grants, stated where the choice is made.
 *
 * The other three modes all resolve to the *calling user's* identity; this one
 * does not, and nothing else in the composed definition says so. CloudTrail
 * records muster (STS session name `muster-aggregator`), never a named
 * engineer, so anyone who can reach the server's tools acts as everyone else.
 */
export const SIGV4_SHARED_IDENTITY_WARNING =
  'Every request is signed as muster itself, never as the user making the ' +
  'call. All users of this server share one AWS identity, and CloudTrail ' +
  'attributes their actions to muster (STS session name muster-aggregator), ' +
  'not to a named engineer.';

/** One `spec.meta` entry, kept as a list so the editor can round-trip order. */
export type McpServerMetaEntry = { key: string; value: string };

/**
 * `NAME=value` lines → metadata entries, the shape the Details step's textarea
 * edits. A line without `=` is a name with no value yet, so a half-typed entry
 * survives the round trip instead of vanishing under the cursor.
 */
export function parseMetaEntries(text: string): McpServerMetaEntry[] {
  return text
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      const separator = line.indexOf('=');
      return separator === -1
        ? { key: line.trim(), value: '' }
        : {
            key: line.slice(0, separator).trim(),
            value: line.slice(separator + 1).trim(),
          };
    });
}

/** Metadata entries → the `NAME=value` lines they were parsed from. */
export function formatMetaEntries(entries: McpServerMetaEntry[]): string {
  return entries.map(({ key, value }) => `${key}=${value}`).join('\n');
}

export type NewMcpServerFormState = {
  /** Display name; the slug derives from it. */
  name: string;
  /** Technical name — becomes the MCPServer CR name. */
  slug: string;
  description: string;
  /** Installation (management cluster) the server is registered on. */
  installation: string | undefined;
  url: string;
  transport: McpServerTransport;
  authMode: McpServerAuthMode;
  /**
   * `own-account` only: authorization server issuer, for backends that don't
   * publish RFC 9728 metadata. Empty means "discover it" (the default).
   */
  issuer: string;
  /** `own-account` only: space-separated OAuth scopes for the issuer override. */
  scopes: string;
  /** `platform-sso` only: audiences the forwarded token must carry. */
  requiredAudiences: string[];
  /** `sigv4` only: the SigV4 signing region. Required for that mode. */
  sigv4Region: string;
  /** `sigv4` only: signing service name. Empty derives it from the URL host. */
  sigv4Service: string;
  /** `sigv4` only: IAM role assumed before signing. Empty signs as muster. */
  sigv4RoleArn: string;
  /**
   * `spec.meta`: entries merged into `params._meta` of every outbound request.
   * Not an auth field — it belongs to the endpoint and applies to every remote
   * transport — but it is what carries `AWS_REGION` to the AWS-hosted server.
   */
  meta: McpServerMetaEntry[];
};

/** The flat definition muster's `core_mcpserver_*` tools take. */
export type McpServerDefinition = {
  name: string;
  type: McpServerTransport;
  url: string;
  autoStart: boolean;
  description?: string;
  auth?: MCPServerAuth;
  meta?: Record<string, string>;
};

export const emptyFormState: NewMcpServerFormState = {
  name: '',
  slug: '',
  description: '',
  installation: undefined,
  url: '',
  transport: 'streamable-http',
  authMode: 'none',
  issuer: '',
  scopes: '',
  requiredAudiences: [],
  sigv4Region: '',
  sigv4Service: '',
  sigv4RoleArn: '',
  meta: [],
};

/** `spec.url` pattern from the CRD. */
const URL_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/;

/**
 * Whether a URL is complete enough to act on -- the same predicate details
 * validation applies to `spec.url`, shared so transport detection only probes
 * URLs that would pass validation anyway.
 */
export function isCompleteMcpUrl(url: string): boolean {
  return URL_PATTERN.test(url.trim());
}

/** `spec.auth.authorizationServer.issuer` pattern from the CRD. */
const ISSUER_PATTERN = /^https:\/\/[^/?#]+(\/[^?#]*[^/?#])?$/;

/**
 * The `spec.meta` entry the AWS-hosted MCP server reads its *operating* region
 * from. Distinct from the sigv4 signing region even when the two strings match.
 */
export const AWS_REGION_META_KEY = 'AWS_REGION';

/**
 * Why sigv4 and the SSE transport cannot be combined — the CRD's spec-level
 * rule, in the terms the wizard asked its questions in. Shared between the
 * choice card that offers sigv4 and the field availability it drives.
 */
export const SIGV4_TRANSPORT_REQUIREMENT =
  'AWS SigV4 signing needs a request body and a single request/response ' +
  'exchange, so the CRD allows it only with the Streamable HTTP transport. ' +
  'Change the transport on the Details step.';

/** `spec.description` maxLength from the CRD. */
const DESCRIPTION_MAX_LENGTH = 500;

// RFC1123 DNS label: the slug becomes the MCPServer CR name, so it must be a
// valid k8s object name. Same rule (and same reason) as agent creation.
const DNS_LABEL_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

/**
 * Derives the technical name from the display name. Same behaviour as agent
 * creation (agent-platform's `slugify`).
 */
export function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
}

function isValidSlug(slug: string): boolean {
  return slug.length <= 63 && DNS_LABEL_PATTERN.test(slug);
}

function composeAuth(state: NewMcpServerFormState): MCPServerAuth | undefined {
  switch (state.authMode) {
    case 'none':
      // Omitted rather than `type: none`: the CRD defaults to none, and an
      // absent block is what fleet servers without auth look like.
      return undefined;
    case 'own-account': {
      const auth: MCPServerAuth = { type: 'oauth' };
      // No issuer → RFC 9728 discovery, which is the default and needs no
      // config. The override only exists for backends without that metadata.
      if (state.issuer.trim()) {
        auth.authorizationServer = {
          issuer: state.issuer.trim(),
          ...(state.scopes.trim() ? { scopes: state.scopes.trim() } : {}),
        };
      }
      return auth;
    }
    case 'platform-sso': {
      // forwardToken implies OAuth in muster (connection_helper.go), so no
      // `type` is set — and `authorizationServer` must stay absent, which the
      // exclusive auth modes guarantee structurally.
      const audiences = state.requiredAudiences
        .map(a => a.trim())
        .filter(Boolean);
      return {
        forwardToken: true,
        ...(audiences.length ? { requiredAudiences: audiences } : {}),
      };
    }
    case 'sigv4': {
      // `forwardToken`/`tokenExchange`/`authorizationServer` all stay absent —
      // the CRD rejects each of them next to `sigv4`, and the exclusive auth
      // modes guarantee that structurally rather than by omission here.
      const sigv4: MCPServerSigV4 = { region: state.sigv4Region.trim() };
      // Both optional overrides are omitted when empty: muster derives the
      // service from the URL host, and an empty roleArn means "sign as
      // muster's own identity" — sending `''` would say the same thing less
      // clearly.
      if (state.sigv4Service.trim()) {
        sigv4.service = state.sigv4Service.trim();
      }
      if (state.sigv4RoleArn.trim()) {
        sigv4.roleArn = state.sigv4RoleArn.trim();
      }
      return { type: 'sigv4', sigv4 };
    }
    default:
      return undefined;
  }
}

/**
 * `spec.meta` from the entry list, dropping entries with no key. Later entries
 * win on a duplicate key, which validation flags separately rather than
 * silently resolving.
 */
function composeMeta(
  state: NewMcpServerFormState,
): Record<string, string> | undefined {
  const meta: Record<string, string> = {};
  for (const entry of state.meta) {
    const key = entry.key.trim();
    if (key) {
      meta[key] = entry.value.trim();
    }
  }
  return Object.keys(meta).length ? meta : undefined;
}

/**
 * Wizard state → the definition passed to `core_mcpserver_validate` and
 * `core_mcpserver_create`.
 *
 * `autoStart: true` so the server connects as soon as it is registered — the
 * flow's promise is that registration is the only step before the tools show
 * up. `timeout` is left out on purpose: the CRD defaults it to 30s and the
 * wizard doesn't ask.
 */
export function composeMcpServerDefinition(
  state: NewMcpServerFormState,
): McpServerDefinition {
  const definition: McpServerDefinition = {
    name: state.slug.trim(),
    type: state.transport,
    url: state.url.trim(),
    autoStart: true,
  };
  if (state.description.trim()) {
    definition.description = state.description.trim();
  }
  const auth = composeAuth(state);
  if (auth) {
    definition.auth = auth;
  }
  // `meta` needs no transport guard: the CRD only forbids it for `stdio`, which
  // the wizard never offers.
  const meta = composeMeta(state);
  if (meta) {
    definition.meta = meta;
  }
  return definition;
}

/**
 * Validation problems of the Details step's fields only, in form order. Split
 * from {@link validateMcpServerAuth} so the auth step can guard "may I be
 * shown?" on the details alone — a bad issuer typed on the auth step must not
 * bounce the user back to step 1.
 */
export function validateMcpServerDetails(
  state: NewMcpServerFormState,
): string[] {
  const errors: string[] = [];

  if (!state.name.trim()) {
    errors.push('Name is required');
  }
  if (state.slug.trim()) {
    if (!isValidSlug(state.slug)) {
      errors.push(
        'Technical name must be lowercase letters, numbers and hyphens (max 63 characters), e.g. my-server',
      );
    }
  } else if (state.name.trim()) {
    // Only flag a missing slug once there's a name (it derives from the name).
    errors.push('Technical name is required');
  }
  if (state.description.trim().length > DESCRIPTION_MAX_LENGTH) {
    errors.push(
      `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
    );
  }
  if (!state.installation) {
    errors.push('Select an installation');
  }
  if (!state.url.trim()) {
    errors.push('URL is required');
  } else if (!URL_PATTERN.test(state.url.trim())) {
    errors.push(
      'URL must be an http(s) URL without spaces, e.g. https://mcp.example.com/mcp',
    );
  }
  errors.push(...validateMeta(state.meta));

  return errors;
}

/**
 * Problems in the request-metadata entries. The CRD accepts any string map, so
 * these are the two ways an entry list can mean something the map cannot
 * express: a value whose key was never typed (silently dropped) and a key typed
 * twice (silently last-wins).
 */
function validateMeta(entries: McpServerMetaEntry[]): string[] {
  const errors: string[] = [];
  const keys = entries.map(entry => entry.key.trim());

  if (entries.some((entry, i) => !keys[i] && entry.value.trim())) {
    errors.push('Request metadata needs a name for every value');
  }
  const duplicate = keys.find(
    (key, i) => Boolean(key) && keys.indexOf(key) < i,
  );
  if (duplicate) {
    errors.push(`Request metadata has ${duplicate} more than once`);
  }

  return errors;
}

/** Validation problems of the Authentication step's fields only. */
export function validateMcpServerAuth(state: NewMcpServerFormState): string[] {
  const errors: string[] = [];

  if (state.authMode === 'own-account') {
    const issuer = state.issuer.trim();
    if (issuer && !ISSUER_PATTERN.test(issuer)) {
      errors.push(
        'Issuer must be an https URL without query or fragment, e.g. https://auth.example.com',
      );
    }
    if (!issuer && state.scopes.trim()) {
      errors.push('Scopes apply to the issuer override — set an issuer too');
    }
  }

  if (state.authMode === 'sigv4') {
    // The CRD's spec-level rule: `auth.sigv4` is only allowed with
    // `streamable-http`. Reported here rather than on the Details step so the
    // user reads it next to the choice that caused it; the fix is a step back.
    if (state.transport !== 'streamable-http') {
      errors.push(
        'AWS SigV4 signing needs the Streamable HTTP transport — change the transport on the Details step',
      );
    }
    // Not defaultable: the endpoint checks the signature's credential scope, so
    // a guessed region surfaces as a signature error rather than a config one.
    if (!state.sigv4Region.trim()) {
      errors.push('Signing region is required for AWS SigV4');
    }
  }

  return errors;
}

/**
 * Non-blocking advisories for the sigv4 choice: things that pass every rule the
 * CRD and muster check, yet produce a server that fails at request time or —
 * worse — answers confidently about the wrong AWS region.
 *
 * Kept apart from {@link validateMcpServerAuth} precisely because they must not
 * block: both are heuristics over a URL the user may legitimately point
 * somewhere unusual (a VPC endpoint, a proxy).
 */
export function sigv4Advisories(state: NewMcpServerFormState): string[] {
  if (state.authMode !== 'sigv4') {
    return [];
  }

  const advisories: string[] = [];
  const region = state.sigv4Region.trim();
  const url = state.url.trim();

  // The credential scope is checked against the endpoint, so a region that
  // doesn't appear in the host is almost always a typo.
  if (region && url && !url.includes(region)) {
    advisories.push(
      `The URL does not mention ${region}. The signing region must match the region of the endpoint, or the endpoint rejects the signature.`,
    );
  }

  // The trap the muster docs call out: without it the AWS-hosted server falls
  // back to its own region and returns a correct-looking answer about the
  // wrong one, so nothing errors and nobody notices.
  const hasOperatingRegion = state.meta.some(
    entry => entry.key.trim() === AWS_REGION_META_KEY && entry.value.trim(),
  );
  if (!hasOperatingRegion) {
    advisories.push(
      `No ${AWS_REGION_META_KEY} in request metadata. An AWS-hosted server reads the region it operates in from there — a different value from the signing region — and without it answers about its own default region instead of failing. Add it on the Details step.`,
    );
  }

  return advisories;
}

/**
 * Human-readable validation problems, in form order. Empty when the state is
 * valid. Mirrors the CRD's structural rules so nothing fails later at apply
 * time; the auth mutual exclusions are handled by {@link authFieldAvailability}
 * instead, since the wizard's exclusive auth modes make them unreachable rather
 * than merely invalid.
 */
export function validateNewMcpServerForm(
  state: NewMcpServerFormState,
): string[] {
  return [...validateMcpServerDetails(state), ...validateMcpServerAuth(state)];
}

/**
 * The composed definition as an MCPServer manifest — the review step's manual
 * fallback for users who prefer to commit the CR to a GitOps repo instead of
 * registering live. Same namespace default as the GitOps dialog's
 * `toManifestYaml`.
 */
export function toMcpServerManifestYaml(
  definition: McpServerDefinition,
  namespace = 'agent-platform',
): string {
  const { name, ...spec } = definition;
  return toYaml({
    apiVersion: 'muster.giantswarm.io/v1alpha1',
    kind: 'MCPServer',
    metadata: { name, namespace },
    spec,
  });
}

// Quote a CLI argument value for a POSIX shell when it needs it.
function shellQuote(value: string): string {
  if (/^[A-Za-z0-9@%+=:,./_-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * The composed definition as a `muster create mcpserver` invocation — the
 * review step's CLI fallback. Flag names follow muster's cmd/create.go
 * (auth flags landed with muster#1026).
 *
 * Returns undefined for a definition the CLI cannot express. `muster create
 * mcpserver` has no flags for `auth.sigv4` or `meta` (cmd/create.go as of
 * muster v5.4.0), and `--auth-type=sigv4` alone composes a CR the CRD rejects —
 * so the caller must offer the manifest instead of a command that looks right
 * and fails.
 */
export function toMusterCliCommand(
  definition: McpServerDefinition,
): string | undefined {
  if (definition.auth?.sigv4 || definition.meta) {
    return undefined;
  }
  const parts = [
    'muster create mcpserver',
    definition.name,
    `--type=${definition.type}`,
    `--url=${shellQuote(definition.url)}`,
    `--auto-start=${definition.autoStart}`,
  ];
  if (definition.description) {
    parts.push(`--description=${shellQuote(definition.description)}`);
  }
  const auth = definition.auth;
  if (auth?.type === 'oauth') {
    parts.push('--auth-type=oauth');
    if (auth.authorizationServer) {
      parts.push(
        `--auth-issuer=${shellQuote(auth.authorizationServer.issuer)}`,
      );
      if (auth.authorizationServer.scopes) {
        parts.push(
          `--auth-scopes=${shellQuote(auth.authorizationServer.scopes)}`,
        );
      }
    }
  }
  if (auth?.forwardToken) {
    parts.push('--forward-token');
    if (auth.requiredAudiences?.length) {
      parts.push(
        `--required-audiences=${shellQuote(auth.requiredAudiences.join(','))}`,
      );
    }
  }
  return parts.join(' ');
}

export type FieldAvailability = {
  available: boolean;
  /** Why the field is unavailable. Undefined when it is available. */
  reason?: string;
};

const AVAILABLE: FieldAvailability = { available: true };

/**
 * Which auth fields the current state may set, and why not when it may not.
 * These encode the CRD's CEL auth rules — `authorizationServer` is only valid
 * with `type: oauth` and is mutually exclusive with `forwardToken: true` — as
 * disabled states with explanations rather than submit-time errors.
 */
export function authFieldAvailability(state: NewMcpServerFormState): {
  authorizationServer: FieldAvailability;
  scopes: FieldAvailability;
  requiredAudiences: FieldAvailability;
  sigv4: FieldAvailability;
} {
  const ownAccount = state.authMode === 'own-account';
  const platformSso = state.authMode === 'platform-sso';
  const sigv4Mode = state.authMode === 'sigv4';

  let authorizationServer: FieldAvailability = AVAILABLE;
  if (state.authMode === 'none') {
    authorizationServer = {
      available: false,
      reason:
        'This server needs no authentication, so there is no authorization server to point at.',
    };
  } else if (platformSso) {
    authorizationServer = {
      available: false,
      reason:
        'Platform SSO forwards the platform identity token; a per-server authorization server would contradict it and the CRD rejects both together.',
    };
  } else if (sigv4Mode) {
    authorizationServer = {
      available: false,
      reason:
        "AWS SigV4 signs with muster's own machine identity — there is no authorization server in that flow, and the CRD rejects the two together.",
    };
  }

  // Scopes are part of the issuer override, so they follow it and additionally
  // wait for an issuer to exist (the CRD requires one).
  let scopes: FieldAvailability = AVAILABLE;
  if (!ownAccount) {
    scopes = { available: false, reason: authorizationServer.reason };
  } else if (!state.issuer.trim()) {
    scopes = {
      available: false,
      reason:
        'Scopes belong to the issuer override — set an issuer first, or leave both empty to discover them.',
    };
  }

  // The CRD's `auth.sigv4` rules as availability: the block belongs to the
  // sigv4 auth type (`has(self.sigv4) == (self.type == 'sigv4')`) and only to
  // the streamable-http transport. Its counterpart — that choosing sigv4 rules
  // out forwardToken and tokenExchange — needs no field of its own here,
  // because the wizard's auth modes are exclusive: picking sigv4 IS unpicking
  // Platform SSO.
  let sigv4: FieldAvailability = AVAILABLE;
  if (!sigv4Mode) {
    sigv4 = {
      available: false,
      reason:
        'The signing configuration applies to AWS SigV4 request signing, which this server does not use.',
    };
  } else if (state.transport !== 'streamable-http') {
    sigv4 = { available: false, reason: SIGV4_TRANSPORT_REQUIREMENT };
  }

  return {
    authorizationServer,
    scopes,
    requiredAudiences: platformSso
      ? AVAILABLE
      : {
          available: false,
          reason: sigv4Mode
            ? "Required audiences apply to the forwarded platform identity token. AWS SigV4 forwards no token at all — it signs as muster's own machine identity."
            : 'Required audiences apply to the forwarded platform identity token, which only Platform SSO sends.',
        },
    sigv4,
  };
}
