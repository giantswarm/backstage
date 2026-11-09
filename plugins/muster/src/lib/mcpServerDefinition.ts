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
//
// The name the person typed is kept as the connector's display name (the
// `ui.giantswarm.io/display-name` annotation) through the tools' own
// `displayName` argument, which muster takes since v5.43.0 (muster#1518). An
// older muster refuses it as an unknown field, so the write only sends it to a
// tool whose input schema declares it ({@link takesArgument}). Tags
// (`ui.giantswarm.io/tags`) go the same way, through the tools' `tags`
// argument where its schema declares one.

import { isValidDNSSubdomainName } from '@giantswarm/backstage-plugin-kubernetes-react';
import type {
  MCPServer,
  MCPServerAuth,
  MCPServerAuthorizationServer,
  MCPServerClientCredentialsSecretRef,
  MCPServerSigV4,
} from './k8s';
import { draftProblem, sameTags } from '@giantswarm/backstage-plugin-ui-react';
import {
  AUTH_MODE_LABELS,
  serverAuthMode,
  type ServerAuthMode,
} from './serverAuthMode';

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
  'Every request is signed as Muster itself, never as the user making the ' +
  'call. All users of this connector share one AWS identity, and CloudTrail ' +
  'attributes their actions to Muster (STS session name muster-aggregator), ' +
  'not to a named engineer.';

/** One `spec.meta` entry, kept as a list so the editor can round-trip order. */
export type McpServerMetaEntry = { key: string; value: string };

export type NewMcpServerFormState = {
  /**
   * Display name; the slug derives from it. Sent as `displayName` where it
   * differs from the slug (see {@link displayNameArgument}).
   */
  name: string;
  /** Technical name — becomes the MCPServer CR name. */
  slug: string;
  description: string;
  /** Keywords to find the connector by, normalized and unique, as added. */
  tags: string[];
  /**
   * What the Tags field holds but has not added yet. Not part of the
   * connector; kept here so a draft that cannot be a tag blocks Continue.
   */
  tagDraft: string;
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
  /**
   * `own-account` only: pinned authorization endpoint, for authorization
   * servers without RFC 8414 discovery (GitHub-style). Set together with
   * {@link NewMcpServerFormState.tokenEndpoint} — the CRD requires both.
   */
  authorizationEndpoint: string;
  /** `own-account` only: pinned token endpoint, set with the one above. */
  tokenEndpoint: string;
  /**
   * `own-account` only: whether the client credentials come from a Secret
   * someone created (the fields below) rather than being typed into the
   * wizard, which muster stores in a Secret of its own (see
   * {@link ClientCredentials}). Typed values are never part of this state.
   */
  useExistingSecret: boolean;
  /**
   * `own-account` only: name of the Kubernetes Secret holding an out-of-band
   * registered OAuth client's credentials. Empty means muster registers itself
   * dynamically (RFC 7591) or identifies by its CIMD URL. Composed when
   * {@link NewMcpServerFormState.useExistingSecret} is set, or when it is the
   * Secret muster stored for this connector ({@link isStoredClientSecret}).
   */
  clientSecretName: string;
  /** `own-account` only: the Secret's namespace. Empty uses muster's default. */
  clientSecretNamespace: string;
  /** `own-account` only: key of the client id inside the Secret. */
  clientIdKey: string;
  /** `own-account` only: key of the client secret inside the Secret. */
  clientSecretKey: string;
  /**
   * `own-account` only: whether a person's grant lives per muster session
   * (`session`, muster's default) or is reused across their sessions
   * (`subject`, the wizard's default). muster only takes it on a pinned
   * authorization server, so it reaches the definition only with an issuer:
   * see {@link effectiveGrantScope}.
   */
  grantScope: 'session' | 'subject';
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
  /**
   * The `ui.giantswarm.io/display-name` annotation. Omitted keeps (on update)
   * or sets none (on create); an empty string removes it (on update).
   */
  displayName?: string;
  /**
   * The `ui.giantswarm.io/tags` annotation, the whole list. Omitted keeps (on
   * update) or sets none (on create); an empty list removes them (on update).
   */
  tags?: string[];
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
  tags: [],
  tagDraft: '',
  installation: undefined,
  url: '',
  transport: 'streamable-http',
  authMode: 'none',
  issuer: '',
  scopes: '',
  authorizationEndpoint: '',
  tokenEndpoint: '',
  useExistingSecret: false,
  clientSecretName: '',
  clientSecretNamespace: '',
  clientIdKey: '',
  clientSecretKey: '',
  // One sign-in for all of a person's sessions: the portal is one muster
  // session and every agent conversation another, so `session` would have the
  // agents ask again in each conversation.
  grantScope: 'subject',
  requiredAudiences: [],
  sigv4Region: '',
  sigv4Service: '',
  sigv4RoleArn: '',
  meta: [],
};

/**
 * Whether the state holds anything the user entered, compared with what an
 * untouched registration starts from (`baseline`, the empty form unless the
 * wizard starts with another sign-in answer). The installation does not count:
 * it mirrors the page header's selector rather than being typed in.
 */
export function hasUserInput(
  state: NewMcpServerFormState,
  baseline: NewMcpServerFormState = emptyFormState,
): boolean {
  return (Object.keys(baseline) as Array<keyof NewMcpServerFormState>)
    .filter(key => key !== 'installation')
    .some(key => JSON.stringify(state[key]) !== JSON.stringify(baseline[key]));
}

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

/**
 * The `displayName` to send for what the person typed as the name, or
 * `undefined` to send none.
 *
 * A name that is the technical name already (a plain id like `jira`) needs no
 * annotation: the resource name reads the same. On create that is all. On an
 * edit (`stored` is the server's annotation, `undefined` without one) the
 * argument is only sent when the shown name changes — muster keeps the stored
 * annotation when it is omitted — and a name changed back to the technical
 * name removes the annotation rather than repeating the resource name in it.
 */
export function displayNameArgument(
  typed: string,
  slug: string,
  edit?: { stored: string | undefined },
): string | undefined {
  const name = typed.trim();
  const technical = slug.trim();
  if (!edit) {
    return name && name !== technical ? name : undefined;
  }
  if (!name || name === (edit.stored ?? technical)) {
    return undefined;
  }
  return name === technical ? '' : name;
}

/**
 * The `tags` to send for the tags added, or `undefined` to send none: on
 * create, any there are; on an edit (`stored` is the server's tags), the whole
 * list only when it differs, as muster keeps the stored tags when it is
 * omitted.
 */
export function tagsArgument(
  tags: readonly string[],
  edit?: { stored: readonly string[] },
): string[] | undefined {
  if (!edit) {
    return tags.length > 0 ? [...tags] : undefined;
  }
  return sameTags(tags, edit.stored) ? undefined : [...tags];
}

/**
 * Whether a muster tool takes the `argument`, read from its input schema as
 * `describe_tool` returns it. Older muster releases do not declare
 * `displayName` (before v5.43.0), `tags` or `clientCredentials`
 * (giantswarm/muster#1737), and refuse them as unknown fields, so a tool
 * without a schema counts as not taking it.
 */
export function takesArgument(
  inputSchema: { properties?: Record<string, unknown> } | undefined,
  argument: 'displayName' | 'tags' | 'clientCredentials',
): boolean {
  return Boolean(inputSchema?.properties?.[argument]);
}

/**
 * A pre-registered OAuth client's credentials as typed into the wizard, for
 * muster to store in a Secret bound to the connector. Held apart from the form
 * state and the definition: they go into the create or update call as its
 * `clientCredentials` argument and nowhere else (not validate, not analytics,
 * not a saved definition or a draft).
 */
export type ClientCredentials = { clientId: string; clientSecret: string };

/**
 * The name muster gives the Secret it stores a connector's client in:
 * `<server>-muster-client-<10 of [a-z0-9]>`, the server's name cut so the
 * whole stays a DNS label and a '.' or '-' the cut ends on trimmed. Mirrors
 * muster's `generatedClientSecretPrefix`.
 */
const STORED_CLIENT_SECRET_INFIX = '-muster-client-';
const STORED_CLIENT_SECRET_SUFFIX = /^[a-z0-9]{10}$/;
const STORED_CLIENT_SECRET_MAX_SERVER =
  63 - STORED_CLIENT_SECRET_INFIX.length - 10;

/**
 * Whether `secretName` is the Secret muster stored the client credentials of
 * the server `serverName` in (typed into the wizard), rather than a Secret
 * someone created and named.
 */
export function isStoredClientSecret(
  serverName: string,
  secretName: string,
): boolean {
  const server =
    serverName.length > STORED_CLIENT_SECRET_MAX_SERVER
      ? serverName
          .slice(0, STORED_CLIENT_SECRET_MAX_SERVER)
          .replace(/[.-]+$/, '')
      : serverName;
  const prefix = `${server}${STORED_CLIENT_SECRET_INFIX}`;
  return (
    Boolean(serverName) &&
    secretName.startsWith(prefix) &&
    STORED_CLIENT_SECRET_SUFFIX.test(secretName.slice(prefix.length))
  );
}

/**
 * Whether the state carries the Secret muster stored this connector's client
 * in — what the sign-in step shows as "Client secret stored".
 */
export function hasStoredClientSecret(state: NewMcpServerFormState): boolean {
  return (
    !state.useExistingSecret &&
    isStoredClientSecret(state.slug.trim(), state.clientSecretName.trim())
  );
}

/**
 * The Secret name the definition names: the one typed for an existing Secret,
 * or the one muster stored this connector's client in. Secret fields of
 * the other source ("New Secret" with no stored client) are not composed.
 */
function composedClientSecretName(state: NewMcpServerFormState): string {
  const name = state.clientSecretName.trim();
  return state.useExistingSecret || hasStoredClientSecret(state) ? name : '';
}

/** Typed client credentials, trimmed. */
function trimmedCredentials(credentials: ClientCredentials): ClientCredentials {
  return {
    clientId: credentials.clientId.trim(),
    clientSecret: credentials.clientSecret.trim(),
  };
}

/**
 * The authorization-server fields muster binds a stored client to (its
 * `AuthorizationServerDigest`). An update that changes one of them while
 * keeping the stored client is refused: the client was registered with that
 * server, so it is entered again.
 */
const CLIENT_BINDING_FIELDS = [
  'issuer',
  'authorizationEndpoint',
  'tokenEndpoint',
  'revocationEndpoint',
] as const;

/**
 * Whether the authorization server a definition sends to differs from the
 * one it was `saved` with (see {@link CLIENT_BINDING_FIELDS}).
 */
export function clientBindingChanged(
  current: MCPServerAuthorizationServer | undefined,
  saved: MCPServerAuthorizationServer | undefined,
): boolean {
  return CLIENT_BINDING_FIELDS.some(
    field => (current?.[field] ?? '').trim() !== (saved?.[field] ?? '').trim(),
  );
}

/**
 * Problems of typed client credentials: both values or neither, and an issuer
 * for the authorization-server block muster needs to use them. `required`
 * (Replace, or a stored client whose server changed) asks for both even when
 * neither is typed. Empty when the credentials do not apply (another mode, or
 * an existing Secret).
 */
export function clientCredentialsProblems(
  state: NewMcpServerFormState,
  credentials: ClientCredentials,
  { required = false }: { required?: boolean } = {},
): McpServerProblem[] {
  if (state.authMode !== 'own-account' || state.useExistingSecret) {
    return [];
  }
  const { clientId, clientSecret } = trimmedCredentials(credentials);
  if (!required && !clientId && !clientSecret) {
    return [];
  }
  const problems: McpServerProblem[] = [];
  if (!state.issuer.trim()) {
    problems.push({ field: 'issuer', message: 'Enter an issuer too.' });
  }
  const too = required ? '' : ' too';
  if (!clientId) {
    problems.push({
      field: 'clientId',
      message: `Enter the client ID${too}.`,
    });
  }
  if (!clientSecret) {
    problems.push({
      field: 'clientSecret',
      message: `Enter the client secret${too}.`,
    });
  }
  return problems;
}

/**
 * The `clientCredentials` argument for muster's create or update, or
 * `undefined` to send none (muster then keeps a client it stored before).
 * Only complete, applicable credentials are sent; see
 * {@link clientCredentialsProblems}.
 */
export function clientCredentialsArgument(
  state: NewMcpServerFormState,
  credentials: ClientCredentials,
): ClientCredentials | undefined {
  const trimmed = trimmedCredentials(credentials);
  // Applicable, with a client ID and no problem: the secret is there too (a
  // half client is a problem), and so is the issuer.
  if (
    state.authMode !== 'own-account' ||
    state.useExistingSecret ||
    !trimmed.clientId ||
    clientCredentialsProblems(state, credentials).length > 0
  ) {
    return undefined;
  }
  return trimmed;
}

/**
 * The definition without a `clientCredentialsSecretRef`: what goes with a
 * `clientCredentials` argument, which muster refuses next to an explicit
 * reference (it sets the reference to the Secret it writes).
 */
export function withoutClientSecretRef(
  definition: McpServerDefinition,
): McpServerDefinition {
  const authorizationServer = definition.auth?.authorizationServer;
  if (!authorizationServer?.clientCredentialsSecretRef) {
    return definition;
  }
  const { clientCredentialsSecretRef: _ref, ...rest } = authorizationServer;
  return {
    ...definition,
    auth: { ...definition.auth, authorizationServer: rest },
  };
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
      // config. The override only exists for backends without that metadata,
      // and every advanced setting below belongs to it (the CRD requires an
      // issuer on the authorizationServer block).
      if (state.issuer.trim()) {
        const authorizationServer: MCPServerAuthorizationServer = {
          issuer: state.issuer.trim(),
        };
        if (state.scopes.trim()) {
          authorizationServer.scopes = state.scopes.trim();
        }
        // The CRD's CEL rule: pinned endpoints are set together. Validation
        // flags a lone one; composing only the pair keeps the definition
        // acceptable even mid-typing.
        const authorizationEndpoint = state.authorizationEndpoint.trim();
        const tokenEndpoint = state.tokenEndpoint.trim();
        if (authorizationEndpoint && tokenEndpoint) {
          authorizationServer.authorizationEndpoint = authorizationEndpoint;
          authorizationServer.tokenEndpoint = tokenEndpoint;
        }
        const secretName = composedClientSecretName(state);
        if (secretName) {
          const secretRef: MCPServerClientCredentialsSecretRef = {
            name: secretName,
          };
          if (state.clientSecretNamespace.trim()) {
            secretRef.namespace = state.clientSecretNamespace.trim();
          }
          if (state.clientIdKey.trim()) {
            secretRef.clientIdKey = state.clientIdKey.trim();
          }
          if (state.clientSecretKey.trim()) {
            secretRef.clientSecretKey = state.clientSecretKey.trim();
          }
          authorizationServer.clientCredentialsSecretRef = secretRef;
        }
        // `session` is muster's default, so only `subject` (the wizard's
        // default) is spelled out — the same omit-muster's-default rule as
        // the rest of the composition.
        if (state.grantScope === 'subject') {
          authorizationServer.grantScope = 'subject';
        }
        auth.authorizationServer = authorizationServer;
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
 * `core_mcpserver_create` — or, with `edit` (the edited server's stored
 * display name, as {@link displayNameArgument} takes it, and its tags), the
 * wizard's part of an update ({@link mergeOntoExisting}).
 *
 * `autoStart: true` so the server connects as soon as it is registered — the
 * flow's promise is that registration is the only step before the tools show
 * up. `timeout` is left out on purpose: the CRD defaults it to 30s and the
 * wizard doesn't ask.
 */
export function composeMcpServerDefinition(
  state: NewMcpServerFormState,
  edit?: { stored: string | undefined; tags?: readonly string[] },
): McpServerDefinition {
  const definition: McpServerDefinition = {
    name: state.slug.trim(),
    type: state.transport,
    url: state.url.trim(),
    autoStart: true,
  };
  const displayName = displayNameArgument(state.name, state.slug, edit);
  if (displayName !== undefined) {
    definition.displayName = displayName;
  }
  const tags = tagsArgument(
    state.tags,
    edit ? { stored: edit.tags ?? [] } : undefined,
  );
  if (tags !== undefined) {
    definition.tags = tags;
  }
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

/** The form fields a validation problem can belong to. */
export type McpServerField =
  | 'name'
  | 'slug'
  | 'description'
  | 'tags'
  | 'installation'
  | 'url'
  | 'meta'
  | 'issuer'
  | 'scopes'
  | 'authorizationEndpoint'
  | 'tokenEndpoint'
  | 'clientSecretName'
  | 'clientSecretNamespace'
  | 'clientIdKey'
  | 'clientSecretKey'
  | 'clientId'
  | 'clientSecret'
  | 'transport'
  | 'sigv4Region';

/** One validation problem and the field that shows it. */
export type McpServerProblem = { field: McpServerField; message: string };

export type McpServerFieldErrors = Partial<Record<McpServerField, string>>;

/** Each field's first problem: what the field shows under itself. */
export function mcpServerFieldErrors(
  problems: readonly McpServerProblem[],
): McpServerFieldErrors {
  const errors: McpServerFieldErrors = {};
  for (const { field, message } of problems) {
    errors[field] ??= message;
  }
  return errors;
}

/**
 * Validation problems of the Details step's fields only, in form order. Split
 * from {@link mcpServerAuthProblems} so the auth step can guard "may I be
 * shown?" on the details alone — a bad issuer typed on the auth step must not
 * bounce the user back to step 1. `storedTags` are an edited server's tags as
 * read: left unchanged, they are not written, so they are not checked.
 * `takesTags` is false where the installation's muster keeps no tags: the
 * Tags field is not offered there, so it cannot hold a problem.
 */
export function mcpServerDetailsProblems(
  state: NewMcpServerFormState,
  {
    storedTags = [],
    takesTags = true,
  }: { storedTags?: readonly string[]; takesTags?: boolean } = {},
): McpServerProblem[] {
  const problems: McpServerProblem[] = [];

  if (!state.name.trim()) {
    problems.push({
      field: 'name',
      message: 'Enter a name for the connector.',
    });
  }
  if (state.slug.trim()) {
    if (!isValidSlug(state.slug)) {
      problems.push({
        field: 'slug',
        message:
          'Technical name must be lowercase letters, numbers and hyphens (max 63 characters), e.g. my-server',
      });
    }
  } else if (state.name.trim()) {
    // Only flag a missing slug once there's a name (it derives from the name).
    problems.push({ field: 'slug', message: 'Enter a technical name.' });
  }
  if (state.description.trim().length > DESCRIPTION_MAX_LENGTH) {
    problems.push({
      field: 'description',
      message: `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
    });
  }
  const tagProblem =
    takesTags && draftProblem(state.tagDraft, state.tags, storedTags);
  if (tagProblem) {
    problems.push({ field: 'tags', message: tagProblem });
  }
  if (!state.installation) {
    problems.push({ field: 'installation', message: 'Choose an environment.' });
  }
  if (!state.url.trim()) {
    problems.push({
      field: 'url',
      message: 'Enter the URL, e.g. https://mcp.example.com/mcp.',
    });
  } else if (!URL_PATTERN.test(state.url.trim())) {
    problems.push({
      field: 'url',
      message:
        'URL must be an http(s) URL without spaces, e.g. https://mcp.example.com/mcp',
    });
  }
  problems.push(
    ...validateMeta(state.meta).map(message => ({
      field: 'meta' as const,
      message,
    })),
  );

  return problems;
}

/**
 * Validation problems of the Details step's fields only, in form order: the
 * messages of {@link mcpServerDetailsProblems}.
 */
export function validateMcpServerDetails(
  state: NewMcpServerFormState,
): string[] {
  return mcpServerDetailsProblems(state).map(problem => problem.message);
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

/** `authorizationEndpoint`/`tokenEndpoint` shape: an https URL, no spaces. */
const ENDPOINT_PATTERN = /^https:\/\/\S+$/;

/**
 * Whether any of the advanced authorization-server settings (pinned endpoints,
 * client-credentials Secret) is filled in — they all live on the
 * `authorizationServer` block, so they need an issuer to hang off. The grant
 * scope lives there too but is no such setting: it has a default either way,
 * and without an issuer it is muster's (`session`), see
 * {@link effectiveGrantScope}.
 */
export function hasAdvancedAuthorizationServer(
  state: NewMcpServerFormState,
): boolean {
  // A client muster stored is no reason to require an issuer: without one
  // the connector stops using it, which the sign-in step says.
  const secretFields = state.useExistingSecret
    ? Boolean(
        state.clientSecretName.trim() ||
        state.clientSecretNamespace.trim() ||
        state.clientIdKey.trim() ||
        state.clientSecretKey.trim(),
      )
    : false;
  return Boolean(
    state.authorizationEndpoint.trim() ||
    state.tokenEndpoint.trim() ||
    secretFields,
  );
}

/**
 * The grant scope an `own-account` connector ends up with: the chosen one
 * where an issuer is pinned, else muster's `session`. muster only takes
 * `grantScope` on a pinned authorization server (`issuer` is required on
 * `spec.auth.authorizationServer`), so a connector whose authorization server
 * muster looks up has every sign-in serve one muster session until muster
 * accepts it there too (giantswarm/muster#1755).
 */
export function effectiveGrantScope(
  state: NewMcpServerFormState,
): 'session' | 'subject' {
  return state.issuer.trim() ? state.grantScope : 'session';
}

// A key of a Secret's `data`, as the API server checks it
// (`IsConfigMapKey`): letters, digits, `-`, `_` and `.`, at most 253, and
// neither `.` nor `..` nor starting with `..`.
const SECRET_DATA_KEY_PATTERN = /^[-._a-zA-Z0-9]{1,253}$/;

function isSecretDataKey(key: string): boolean {
  return (
    SECRET_DATA_KEY_PATTERN.test(key) && key !== '.' && !key.startsWith('..')
  );
}

/**
 * Problems of the Existing Secret fields: the reference must name a Secret
 * the API server could hold, or muster refuses the server once it is saved.
 * Values are trimmed first, as they are composed. All four empty is no client
 * at all, as with New Secret: nothing is composed and nothing is required.
 */
function existingSecretProblems(
  state: NewMcpServerFormState,
): McpServerProblem[] {
  const problems: McpServerProblem[] = [];
  const name = state.clientSecretName.trim();
  const namespace = state.clientSecretNamespace.trim();
  if (
    !name &&
    !namespace &&
    !state.clientIdKey.trim() &&
    !state.clientSecretKey.trim()
  ) {
    return problems;
  }
  if (!name) {
    problems.push({
      field: 'clientSecretName',
      message: "Enter the Secret's name, e.g. github-oauth-client.",
    });
  } else if (!isValidDNSSubdomainName(name)) {
    problems.push({
      field: 'clientSecretName',
      message:
        'Use lowercase letters, numbers, hyphens and dots, starting and ending with a letter or number (at most 253 characters), e.g. github-oauth-client.',
    });
  } else if (isStoredClientSecret(state.slug.trim(), name)) {
    // muster reserves the form for the client Secrets it writes: in any
    // namespace it reads one only with an ownerReference to this connector,
    // so a Secret made by hand under such a name never signs anyone in.
    problems.push({
      field: 'clientSecretName',
      message: `Names like ${state.slug.trim()}-muster-client-a1b2c3d4e5 are kept for the client Muster stores; choose another name.`,
    });
  }
  if (namespace && !isValidSlug(namespace)) {
    problems.push({
      field: 'clientSecretNamespace',
      message:
        'Use lowercase letters, numbers and hyphens, starting and ending with a letter or number (at most 63 characters), e.g. muster.',
    });
  }
  for (const [field, key, example] of [
    ['clientIdKey', state.clientIdKey.trim(), 'client-id'],
    ['clientSecretKey', state.clientSecretKey.trim(), 'client-secret'],
  ] as const) {
    if (key && !isSecretDataKey(key)) {
      problems.push({
        field,
        message: `Use letters, numbers, hyphens, underscores and dots (at most 253 characters, not starting with two dots), e.g. ${example}.`,
      });
    }
  }
  return problems;
}

/**
 * Validation problems of the Authentication step's fields only. A rule about
 * two fields belongs to the one whose change fixes it: the issuer the scopes
 * and advanced settings need, the empty one of the paired endpoints.
 */
export function mcpServerAuthProblems(
  state: NewMcpServerFormState,
): McpServerProblem[] {
  const problems: McpServerProblem[] = [];

  if (state.authMode === 'own-account') {
    const issuer = state.issuer.trim();
    if (issuer && !ISSUER_PATTERN.test(issuer)) {
      problems.push({
        field: 'issuer',
        message:
          'Issuer must be an https URL without query or fragment, e.g. https://auth.example.com',
      });
    }
    if (!issuer && state.scopes.trim()) {
      problems.push({
        field: 'issuer',
        message: 'Scopes apply to the issuer override — set an issuer too',
      });
    }
    if (!issuer && hasAdvancedAuthorizationServer(state)) {
      problems.push({
        field: 'issuer',
        message:
          'The advanced authorization-server settings apply to the issuer override — set an issuer too',
      });
    }
    const authorizationEndpoint = state.authorizationEndpoint.trim();
    const tokenEndpoint = state.tokenEndpoint.trim();
    // The CRD's CEL rule: the pinned endpoints are set together.
    if (Boolean(authorizationEndpoint) !== Boolean(tokenEndpoint)) {
      problems.push({
        field: authorizationEndpoint
          ? 'tokenEndpoint'
          : 'authorizationEndpoint',
        message:
          'The authorization and token endpoints are pinned together — set both or neither',
      });
    }
    for (const [field, label, endpoint] of [
      [
        'authorizationEndpoint',
        'Authorization endpoint',
        authorizationEndpoint,
      ],
      ['tokenEndpoint', 'Token endpoint', tokenEndpoint],
    ] as const) {
      if (endpoint && !ENDPOINT_PATTERN.test(endpoint)) {
        problems.push({ field, message: `${label} must be an https URL` });
      }
    }
    if (state.useExistingSecret) {
      problems.push(...existingSecretProblems(state));
    }
  }

  if (state.authMode === 'sigv4') {
    // The CRD's spec-level rule: `auth.sigv4` is only allowed with
    // `streamable-http`. Reported here rather than on the Details step so the
    // user reads it next to the choice that caused it; the fix is a step back.
    if (state.transport !== 'streamable-http') {
      problems.push({
        field: 'transport',
        message:
          'AWS SigV4 signing needs the Streamable HTTP transport — change the transport on the Details step',
      });
    }
    // Not defaultable: the endpoint checks the signature's credential scope, so
    // a guessed region surfaces as a signature error rather than a config one.
    if (!state.sigv4Region.trim()) {
      problems.push({
        field: 'sigv4Region',
        message: 'Enter the signing region for AWS SigV4, e.g. eu-central-1.',
      });
    }
  }

  return problems;
}

/**
 * Validation problems of the Authentication step's fields only: the messages
 * of {@link mcpServerAuthProblems}.
 */
export function validateMcpServerAuth(state: NewMcpServerFormState): string[] {
  return mcpServerAuthProblems(state).map(problem => problem.message);
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
      `No ${AWS_REGION_META_KEY} in request metadata. An AWS-hosted connector reads the region it operates in from there — a different value from the signing region — and without it answers about its own default region instead of failing. Add it on the Details step.`,
    );
  }

  return advisories;
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
  requiredAudiences: FieldAvailability;
  sigv4: FieldAvailability;
} {
  const platformSso = state.authMode === 'platform-sso';
  const sigv4Mode = state.authMode === 'sigv4';

  let authorizationServer: FieldAvailability = AVAILABLE;
  if (state.authMode === 'none') {
    authorizationServer = {
      available: false,
      reason:
        'This connector needs no authentication, so there is no authorization server to point at.',
    };
  } else if (platformSso) {
    authorizationServer = {
      available: false,
      reason:
        'Platform SSO forwards the platform identity token; a per-connector authorization server would contradict it and the CRD rejects both together.',
    };
  } else if (sigv4Mode) {
    authorizationServer = {
      available: false,
      reason:
        "AWS SigV4 signs with Muster's own machine identity — there is no authorization server in that flow, and the CRD rejects the two together.",
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
        'The signing configuration applies to AWS SigV4 request signing, which this connector does not use.',
    };
  } else if (state.transport !== 'streamable-http') {
    sigv4 = { available: false, reason: SIGV4_TRANSPORT_REQUIREMENT };
  }

  return {
    authorizationServer,
    requiredAudiences: platformSso
      ? AVAILABLE
      : {
          available: false,
          reason: sigv4Mode
            ? "Required audiences apply to the forwarded platform identity token. AWS SigV4 forwards no token at all — it signs as Muster's own machine identity."
            : 'Required audiences apply to the forwarded platform identity token, which only Platform SSO sends.',
        },
    sigv4,
  };
}

/**
 * The way a server registered with each wizard answer is reached
 * ({@link serverAuthMode}, the one classification every surface shares).
 * One mode per answer: the inverse below needs it injective.
 */
export const WIZARD_ANSWER_MODES: Record<McpServerAuthMode, ServerAuthMode> = {
  none: 'anonymous',
  'own-account': 'own-account',
  'platform-sso': 'platform-sso',
  sigv4: 'sigv4',
};

/**
 * The wizard's answer for each way a registered server is reached, the inverse
 * of {@link WIZARD_ANSWER_MODES}. Token exchange has none: the wizard does not
 * offer it.
 */
export const WIZARD_AUTH_MODES: Partial<
  Record<ServerAuthMode, McpServerAuthMode>
> = Object.fromEntries(
  (
    Object.entries(WIZARD_ANSWER_MODES) as [McpServerAuthMode, ServerAuthMode][]
  ).map(([answer, mode]) => [mode, answer] as const),
);

/**
 * A wizard answer's name: the name of the mode it registers, so the wizard
 * calls a mode what the servers table and detail panel call it.
 */
export function wizardAuthModeLabel(answer: McpServerAuthMode): string {
  return AUTH_MODE_LABELS[WIZARD_ANSWER_MODES[answer]];
}

/**
 * The `spec.auth` keys each wizard answer composes (see `composeAuth`). A key
 * outside its own answer — `tokenExchange` (even disabled), `forwardIdentity`,
 * `requiredAudiences` on an OAuth sign-in, an authorization server on an
 * anonymous server — has no field in the wizard, so an edit there would
 * silently drop the setting. Which answer a server gets is
 * {@link serverAuthMode}'s decision, so the `type` needs no check here.
 */
const WIZARD_AUTH_KEYS: Record<McpServerAuthMode, string[]> = {
  none: [],
  'own-account': ['type', 'authorizationServer'],
  // forwardToken implies OAuth in muster, so an explicit `type: oauth` is the
  // same server and composing it without one keeps it.
  'platform-sso': ['type', 'forwardToken', 'requiredAudiences'],
  sigv4: ['type', 'sigv4'],
};
/**
 * `authorizationServer` keys the wizard has no field for but keeps: an edit
 * carries them over from the server unchanged while the issuer or the pinned
 * endpoints stay ({@link mergeOntoExisting}). Kept rather than dropped because muster binds
 * a stored client to the revocation endpoint too. `expectedIssuer` stays out:
 * a server pinning one keeps being edited as JSON rather than silently
 * losing it.
 */
const CARRIED_AUTHORIZATION_SERVER_KEYS = ['revocationEndpoint'] as const;

const WIZARD_AUTHORIZATION_SERVER_KEYS = [
  'issuer',
  'scopes',
  'authorizationEndpoint',
  'tokenEndpoint',
  'clientCredentialsSecretRef',
  'grantScope',
  ...CARRIED_AUTHORIZATION_SERVER_KEYS,
];
const WIZARD_SIGV4_KEYS = ['region', 'service', 'roleArn'];

/**
 * `auth` without the values the CRD defaults (`type: none`, `forwardToken:
 * false`, `forwardIdentity: false`). A server read back from the cluster
 * carries them whatever it was created with, and they mean the same as the
 * key being absent.
 */
export function withoutCrdDefaults(
  auth: MCPServerAuth,
): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...auth };
  if (rest.type === 'none') {
    delete rest.type;
  }
  for (const flag of ['forwardToken', 'forwardIdentity']) {
    if (rest[flag] === false) {
      delete rest[flag];
    }
  }
  return rest;
}

/** The keys of `value` outside `allowed`, prefixed with `path`. */
function extraKeys(
  value: object | undefined,
  allowed: string[],
  path = '',
): string[] {
  return Object.keys(value ?? {})
    .filter(key => !allowed.includes(key))
    .map(key => `${path}${key}`);
}

/** `label` inside a sentence: only the first letter lowercased, not SSO or AWS. */
function inSentence(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/**
 * Where a server the wizard cannot edit is edited instead — the row's JSON
 * editor, which shows and saves the whole definition.
 */
const EDIT_AS_JSON_HINT = 'Use “Edit as JSON” to change its definition.';

/**
 * Why a registered server cannot be edited through the wizard, or undefined
 * when it can. The wizard only speaks the remote transports (a `stdio` server
 * runs a local process next to muster) and its own four auth answers: a server
 * using token exchange or any other auth setting the wizard has no field for
 * would be pre-filled with an answer that is not what it does, and saving
 * would drop the setting.
 */
export function wizardEditBlocker(server: MCPServer): string | undefined {
  const type = server.getType();
  if (type !== 'streamable-http' && type !== 'sse') {
    return `The registration wizard only covers remote (streamable-http or SSE) connectors. ${EDIT_AS_JSON_HINT}`;
  }
  const mode = serverAuthMode(server);
  const answer = WIZARD_AUTH_MODES[mode];
  if (!answer) {
    return `This connector uses ${inSentence(AUTH_MODE_LABELS[mode])}, which the registration wizard does not offer. ${EDIT_AS_JSON_HINT}`;
  }
  const auth = server.getAuth();
  const unsupported = auth
    ? [
        ...extraKeys(withoutCrdDefaults(auth), WIZARD_AUTH_KEYS[answer]),
        ...extraKeys(
          auth.authorizationServer,
          WIZARD_AUTHORIZATION_SERVER_KEYS,
          'authorizationServer.',
        ),
        ...extraKeys(auth.sigv4, WIZARD_SIGV4_KEYS, 'sigv4.'),
      ]
    : [];
  if (unsupported.length > 0) {
    return `This connector has authentication settings the registration wizard cannot show or keep: ${unsupported.join(', ')}. ${EDIT_AS_JSON_HINT}`;
  }
  return undefined;
}

/** The auth-answer fields of the form state, which switch with the mode. */
const AUTH_ANSWER_FIELDS = [
  'issuer',
  'scopes',
  'authorizationEndpoint',
  'tokenEndpoint',
  'useExistingSecret',
  'clientSecretName',
  'clientSecretNamespace',
  'clientIdKey',
  'clientSecretKey',
  'grantScope',
  'requiredAudiences',
  'sigv4Region',
  'sigv4Service',
  'sigv4RoleArn',
] as const;

export type McpServerAuthAnswer = Pick<
  NewMcpServerFormState,
  (typeof AUTH_ANSWER_FIELDS)[number]
>;

/** The auth-answer fields of `state`, for restoring them later. */
export function authAnswerOf(
  state: NewMcpServerFormState,
): McpServerAuthAnswer {
  return Object.fromEntries(
    AUTH_ANSWER_FIELDS.map(key => [key, state[key]]),
  ) as McpServerAuthAnswer;
}

/** No auth answer at all — what switching to another mode starts from. */
export const emptyAuthAnswer: McpServerAuthAnswer =
  authAnswerOf(emptyFormState);

/**
 * A registered server → the wizard state that composes it, so "Edit" opens the
 * registration form pre-filled. The name is the server's display name: its
 * `ui.giantswarm.io/display-name`, else the CR name. Only for servers
 * {@link wizardEditBlocker} lets through, whose auth block is exactly one of
 * the wizard's modes.
 */
export function formStateFromServer(server: MCPServer): NewMcpServerFormState {
  const auth = server.getAuth();
  const clientSecretRef = auth?.authorizationServer?.clientCredentialsSecretRef;
  return {
    ...emptyFormState,
    name: server.getDisplayName(),
    slug: server.getName(),
    description: server.getDescription() ?? '',
    tags: server.getTags(),
    installation: server.cluster,
    url: server.getUrl() ?? '',
    transport: server.getType() === 'sse' ? 'sse' : 'streamable-http',
    authMode: WIZARD_AUTH_MODES[serverAuthMode(server)] ?? 'none',
    issuer: auth?.authorizationServer?.issuer ?? '',
    scopes: auth?.authorizationServer?.scopes ?? '',
    authorizationEndpoint:
      auth?.authorizationServer?.authorizationEndpoint ?? '',
    tokenEndpoint: auth?.authorizationServer?.tokenEndpoint ?? '',
    // A Secret muster stored this connector's client in shows as "stored";
    // any other named Secret is an existing one.
    useExistingSecret: Boolean(
      clientSecretRef &&
      !isStoredClientSecret(server.getName(), clientSecretRef.name),
    ),
    clientSecretName:
      auth?.authorizationServer?.clientCredentialsSecretRef?.name ?? '',
    clientSecretNamespace:
      auth?.authorizationServer?.clientCredentialsSecretRef?.namespace ?? '',
    clientIdKey:
      auth?.authorizationServer?.clientCredentialsSecretRef?.clientIdKey ?? '',
    clientSecretKey:
      auth?.authorizationServer?.clientCredentialsSecretRef?.clientSecretKey ??
      '',
    // A pinned authorization server keeps what it says, its absent
    // `grantScope` being muster's `session`. Without a pin there is no value
    // to keep (the connector is `session` whatever the field holds, see
    // `effectiveGrantScope`), so the wizard's default stands for an issuer the
    // edit adds.
    grantScope: auth?.authorizationServer
      ? (auth.authorizationServer.grantScope ?? 'session')
      : emptyFormState.grantScope,
    requiredAudiences: auth?.requiredAudiences ?? [],
    sigv4Region: auth?.sigv4?.region ?? '',
    sigv4Service: auth?.sigv4?.service ?? '',
    sigv4RoleArn: auth?.sigv4?.roleArn ?? '',
    meta: Object.entries(server.getMeta() ?? {}).map(([key, value]) => ({
      key,
      value,
    })),
  };
}

/** Definition fields the wizard composes; it never touches any other. */
const WIZARD_FIELDS = [
  'name',
  'displayName',
  'tags',
  'type',
  'url',
  'description',
  'auth',
  'meta',
];

/**
 * The wizard's definition laid over the server being edited, for
 * `core_mcpserver_update`.
 *
 * muster's update (handleMCPServerUpdate in internal/mcpserver/api_adapter.go)
 * is a merge onto the stored CR, with per-field rules this mirrors so the
 * definition shown on the review step is what the server ends up with:
 *
 * - An omitted `auth`, `meta`, `headers`, `env`, `toolPrefix`, `timeout`, ...
 *   keeps the stored value. What the wizard does not model is carried over
 *   anyway, so the definition reads complete. A wizard answer that *clears*
 *   `auth` or `meta` is sent explicitly (`{ type: 'none' }`, `{}`) — omitting
 *   it would keep the old value.
 * - `description` is only replaced by a non-empty value; muster cannot clear
 *   it through an update, so a cleared description keeps the stored one.
 * - `displayName` is tri-state like `suspended` (omitted keeps the annotation,
 *   empty removes it), so it is never carried from what was saved before: it
 *   is sent only when the wizard changes it.
 * - `tags` likewise: omitted keeps them, a list replaces them, so they are
 *   sent only when the wizard changes them.
 * - `autoStart` is always overwritten, omitted meaning false. The server's own
 *   value is sent (missing reads as false, like `getAutoStart()`): the
 *   wizard's `true` is a registration default, and an edit must not turn it on.
 * - `suspended` is tri-state — omitted keeps the current lifecycle state — so
 *   it is deliberately neither composed nor carried (`toMcpServerDefinition`
 *   does not read it) and a deactivated server stays deactivated.
 *
 * The auth block is otherwise entirely the wizard's: {@link wizardEditBlocker}
 * keeps servers with auth settings it cannot model out of the wizard.
 */
export function mergeOntoExisting(
  existing: Record<string, unknown>,
  composed: McpServerDefinition,
): McpServerDefinition {
  const kept = Object.fromEntries(
    Object.entries(existing).filter(([key]) => !WIZARD_FIELDS.includes(key)),
  );
  const merged: McpServerDefinition = {
    ...kept,
    ...composed,
    autoStart:
      typeof existing.autoStart === 'boolean' ? existing.autoStart : false,
  };
  if (!merged.description && typeof existing.description === 'string') {
    merged.description = existing.description;
  }
  if (!merged.auth && existing.auth) {
    merged.auth = { type: 'none' };
  }
  // The authorization server's keys the wizard does not render ride along
  // while it still is the same server: the same issuer, or the same pinned
  // endpoints (a provider without metadata, whose revocation endpoint muster
  // cannot discover, keeps it when only its issuer is corrected). Another
  // issuer with other or no pinned endpoints is another server, whose
  // endpoints muster discovers; its revocation endpoint would get the new
  // provider's tokens sent to the old one.
  const existingServer = (existing.auth as MCPServerAuth | undefined)
    ?.authorizationServer;
  const composedServer = merged.auth?.authorizationServer;
  const samePinnedEndpoints =
    Boolean(composedServer?.authorizationEndpoint) &&
    composedServer?.authorizationEndpoint ===
      existingServer?.authorizationEndpoint &&
    composedServer?.tokenEndpoint === existingServer?.tokenEndpoint;
  if (
    composedServer &&
    existingServer &&
    (composedServer.issuer === existingServer.issuer || samePinnedEndpoints)
  ) {
    const carried = Object.fromEntries(
      CARRIED_AUTHORIZATION_SERVER_KEYS.filter(
        key => existingServer[key] !== undefined,
      ).map(key => [key, existingServer[key]]),
    );
    if (Object.keys(carried).length > 0) {
      merged.auth = {
        ...merged.auth,
        authorizationServer: { ...composedServer, ...carried },
      };
    }
  }
  if (!merged.meta && existing.meta) {
    merged.meta = {};
  }
  return merged;
}
