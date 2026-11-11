/**
 * agent-manager's credential operations (giantswarm/agent-manager#312): an
 * organization tool that needs a credential prepares an operation and links
 * to the portal's form with its id; the form reads the operation's
 * confirmation and posts the values to agent-manager over HTTPS, never
 * through an MCP call. Shapes as `api/openapi.yaml` of agent-manager.
 */

export type CredentialReferenceKind =
  'ModelConfig' | 'RemoteMCPServer' | 'EgressPolicy';

/** An object of the organization that reads a credential Secret. */
export type CredentialReference = {
  kind: CredentialReferenceKind;
  name: string;
  /** The key of the Secret the object reads. */
  key: string;
  /** RemoteMCPServer: where it sends the value; a credential in it shows as REDACTED. */
  url?: string;
  /** EgressPolicy: the origins it sends the value to. */
  origins?: string[];
  /** ModelConfig: the provider it sends the value to. */
  provider?: string;
  /** A Flux Kustomization applies the object from git. */
  fromGit?: boolean;
};

export type CredentialState =
  'present' | 'committed' | 'missing' | 'replace' | 'unknown';

export type CredentialPair = {
  secret: string;
  key: string;
  state: CredentialState;
  formUrl?: string;
  next?: string;
};

export type CredentialCommit = {
  repository?: string;
  base?: string;
  branch?: string;
  pullRequest?: string;
  number?: number;
};

/**
 * agent-manager's names of the objects a credential operation writes;
 * `credential` is a replacement, which writes the Secret only.
 */
export type CredentialResourceKind =
  'model' | 'connector' | 'egressPolicy' | 'credential';

/** What a save answers, and what the operation will write. */
export type CredentialResourceResult = {
  namespace?: string;
  kind?: CredentialResourceKind;
  name?: string;
  created?: boolean;
  /** Models only: the organization's default model after the write. */
  defaultModel?: string;
  note?: string;
  pending?: boolean;
  /** The id of the credential operation a pending write prepared. */
  credentialOperation?: string;
  credentials?: CredentialPair[];
  commit?: CredentialCommit;
};

export type CredentialOperationState =
  'pending' | 'saving' | 'uncertain' | 'complete' | 'cancelled';

export type CredentialChange = {
  action: 'create' | 'update';
  /** The intended consumer manifest, without any secret. */
  object?: {
    kind?: string;
    metadata?: { name?: string };
    spec?: Record<string, unknown>;
  };
};

/** The confirmation of one operation, with its ETag. */
export type CredentialOperation = {
  id: string;
  version: string;
  expiresAt?: string;
  state: CredentialOperationState;
  mode: 'apply' | 'commit';
  organization: { namespace?: string; parent?: string; organization?: string };
  changes?: CredentialChange[];
  gitTarget?: { repository?: string; base?: string; directory?: string };
  references?: CredentialReference[];
  result?: CredentialResourceResult;
};

export type CredentialOperationRead = {
  operation: CredentialOperation;
  etag: string;
};

/** A value the form posts: one requested Secret and key. */
export type CredentialValue = { secret: string; key: string; value: string };

/** agent-manager's operation ids. */
export const CREDENTIAL_OPERATION_PATTERN = /^[a-f0-9]{48}$/;

/**
 * The credential operation a write prepared, or `undefined` when the write
 * is finished (the credential already exists). Refuses an answer that says
 * a request is pending without its id, and an id this portal does not
 * recognize: neither can be opened on the form.
 */
export function preparedCredentialOperation(
  result: CredentialResourceResult,
): string | undefined {
  const operation = result.credentialOperation;
  if (!operation) {
    if (result.pending) {
      throw new Error(
        'agent-manager answered a credential request without its id.',
      );
    }
    return undefined;
  }
  if (!CREDENTIAL_OPERATION_PATTERN.test(operation)) {
    throw new Error(
      'agent-manager answered a credential request id this portal does not recognize.',
    );
  }
  return operation;
}

/**
 * The Secret and key pairs the operation asks for, once each: what the
 * consumer reads and is missing or replaced.
 */
export function requestedPairs(
  operation: CredentialOperation,
): CredentialPair[] {
  const seen = new Set<string>();
  return (operation.result?.credentials ?? []).filter(pair => {
    const id = `${pair.secret}/${pair.key}`;
    if (
      (pair.state !== 'missing' && pair.state !== 'replace') ||
      seen.has(id)
    ) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

/** The objects the operation writes: who asked for the credential. */
export function askingObjects(
  operation: CredentialOperation,
): { action: string; kind: string; name: string }[] {
  return (operation.changes ?? []).flatMap(change => {
    const kind = change.object?.kind;
    const name = change.object?.metadata?.name;
    return kind && name ? [{ action: change.action, kind, name }] : [];
  });
}

/** The other objects that already read the credential. */
export function otherReferences(
  operation: CredentialOperation,
): CredentialReference[] {
  const asking = new Set(
    askingObjects(operation).map(o => `${o.kind}/${o.name}`),
  );
  return (operation.references ?? []).filter(
    ref => !asking.has(`${ref.kind}/${ref.name}`),
  );
}

/** Endpoint fields of a ModelConfig's provider block (`spec.<provider>.baseUrl`). */
const ENDPOINT_FIELDS = new Set(['baseUrl', 'baseURL', 'endpoint']);

function endpointsOf(spec: Record<string, unknown> | undefined): string[] {
  const out: string[] = [];
  for (const value of Object.values(spec ?? {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [field, inner] of Object.entries(value)) {
        if (ENDPOINT_FIELDS.has(field) && typeof inner === 'string' && inner) {
          out.push(inner);
        }
      }
    }
  }
  return out;
}

/**
 * Where the value is sent, as far as the organization's objects say: a
 * model's endpoint, else its provider, the URLs of the connectors and the
 * origins of the egress policies that read it. A model without an endpoint
 * names its provider alone: in an organization namespace admission routes it
 * through the installation's LLM gateway, which passes the key to the
 * provider unchanged.
 */
export function destinations(operation: CredentialOperation): string[] {
  const out = new Set<string>();
  for (const change of operation.changes ?? []) {
    const spec = change.object?.spec;
    if (change.object?.kind === 'ModelConfig') {
      const provider = spec?.provider;
      const endpoints = endpointsOf(spec);
      if (endpoints.length > 0) {
        endpoints.forEach(endpoint => out.add(endpoint));
      } else if (typeof provider === 'string') {
        out.add(provider);
      }
    }
  }
  for (const ref of operation.references ?? []) {
    for (const origin of ref.origins ?? []) {
      out.add(origin);
    }
    if (ref.url) {
      out.add(ref.url);
    }
    // A replacement lists the models that read the Secret, each by the
    // provider it sends the value to.
    if (ref.kind === 'ModelConfig' && ref.provider) {
      out.add(ref.provider);
    }
  }
  return [...out].sort();
}
