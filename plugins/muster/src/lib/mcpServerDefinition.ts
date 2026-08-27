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

import type { MCPServerAuth } from './k8s';
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
  | 'platform-sso';

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
};

/** The flat definition muster's `core_mcpserver_*` tools take. */
export type McpServerDefinition = {
  name: string;
  type: McpServerTransport;
  url: string;
  autoStart: boolean;
  description?: string;
  auth?: MCPServerAuth;
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
    default:
      return undefined;
  }
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

  return errors;
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
 */
export function toMusterCliCommand(definition: McpServerDefinition): string {
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
} {
  const ownAccount = state.authMode === 'own-account';
  const platformSso = state.authMode === 'platform-sso';

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

  return {
    authorizationServer,
    scopes,
    requiredAudiences: platformSso
      ? AVAILABLE
      : {
          available: false,
          reason:
            'Required audiences apply to the forwarded platform identity token, which only Platform SSO sends.',
        },
  };
}
