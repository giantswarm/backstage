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

/** What a save answers, and what the operation will write. */
export type CredentialResourceResult = {
  namespace?: string;
  kind?: string;
  name?: string;
  created?: boolean;
  note?: string;
  pending?: boolean;
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

/**
 * Where the value is sent, as far as the organization's objects say: the
 * origins of the egress policies and the URLs of the connectors that read it.
 */
export function destinations(operation: CredentialOperation): string[] {
  const out = new Set<string>();
  for (const ref of operation.references ?? []) {
    for (const origin of ref.origins ?? []) {
      out.add(origin);
    }
    if (ref.url) {
      out.add(ref.url);
    }
  }
  return [...out].sort();
}

/**
 * The operation id of an agent-manager form link (`credentials[].formUrl` or
 * a URL elicitation's url), from its `operation` query parameter. Only the id
 * is taken: the portal builds its own link, never follows the absolute URL.
 */
export function operationOfFormUrl(
  url: string | undefined,
): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const id = new URL(url).searchParams.get('operation') ?? undefined;
    return id && CREDENTIAL_OPERATION_PATTERN.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}
