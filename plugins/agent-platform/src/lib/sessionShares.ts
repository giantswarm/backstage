/**
 * Parsing for the session-share routes — the proto3 JSON of the controller's
 * `CreateSessionShareResponse` and `ListSessionSharesResponse`, read with the
 * same tolerance as every other kagent shape: a field that is absent or moved
 * degrades to `undefined` rather than failing the dialog.
 *
 * Lives here rather than in `agent-platform-common` because this plugin is the
 * shape's only consumer: the backend passes the responses through verbatim.
 */

/** One share of a session, as the dialog lists it. */
export type SessionShare = {
  id: string;
  /**
   * What the share's token grants: `read-only` is A2A get/list/subscribe,
   * `read-write` adds send and cancel. `unknown` keeps a future permission
   * value visible rather than mislabeling it.
   */
  permission: 'read-only' | 'read-write' | 'unknown';
  /** RFC 3339, as proto3 JSON renders a Timestamp. */
  createdAt?: string;
  /** Absent means the share never expires: it lasts until revoked. */
  expiresAt?: string;
};

/** What a create answers: the share, and the only copy of its token. */
export type CreatedSessionShare = {
  /**
   * The secret that grants the access. **Only ever present on the create** —
   * the controller stores a hash, so a token not copied now is gone.
   */
  token: string;
  share?: SessionShare;
};

/**
 * The TTLs the dialog offers. A closed set rather than a free field, twice
 * over: the analytics event may only carry values from a closed set, and a
 * person picking an expiry wants three sensible choices, not arithmetic.
 *
 * `default` sends no TTL, which the controller fills with its own maximum
 * share lifetime — or, where none is configured, the share lasts until it is
 * revoked. The label says so rather than promising a bound we cannot know.
 */
export const SESSION_SHARE_TTL_CHOICES = [
  { id: '1h', label: '1 hour', seconds: 60 * 60 },
  { id: '24h', label: '24 hours', seconds: 24 * 60 * 60 },
  { id: '7d', label: '7 days', seconds: 7 * 24 * 60 * 60 },
  {
    id: 'default',
    label: 'Installation default',
    seconds: undefined,
  },
] as const;

export type SessionShareTtl = (typeof SESSION_SHARE_TTL_CHOICES)[number]['id'];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * proto3 JSON renders an enum as its value's name, but tolerate the numeric
 * form too — both are legal JSON for the same field.
 */
function parsePermission(value: unknown): SessionShare['permission'] {
  if (value === 'SESSION_SHARE_PERMISSION_READ_ONLY' || value === 1) {
    return 'read-only';
  }
  if (value === 'SESSION_SHARE_PERMISSION_READ_WRITE' || value === 2) {
    return 'read-write';
  }
  return 'unknown';
}

function parseShare(raw: unknown): SessionShare | undefined {
  const record = asRecord(raw);
  // No id means nothing downstream works: it is what a revoke names.
  const id = asNonEmptyString(record?.id);
  if (!record || !id) {
    return undefined;
  }
  return {
    id,
    permission: parsePermission(record.permission),
    createdAt: asNonEmptyString(record.createdAt),
    expiresAt: asNonEmptyString(record.expiresAt),
  };
}

/**
 * The shares of `GET …/shares`, unreadable rows dropped — partial data is
 * still worth listing, matching the other kagent reads' tolerance.
 */
export function parseSessionShareList(body: unknown): SessionShare[] {
  const rows = asRecord(body)?.shares;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map(parseShare)
    .filter((share): share is SessionShare => share !== undefined);
}

/**
 * The answer of `POST …/shares`, or `undefined` when it carried no token —
 * which the caller must treat as a failure: the token is the entire point,
 * and it cannot be read back later.
 */
export function parseCreatedSessionShare(
  body: unknown,
): CreatedSessionShare | undefined {
  const record = asRecord(body);
  const token = asNonEmptyString(record?.token);
  if (!record || !token) {
    return undefined;
  }
  return { token, share: parseShare(record.share) };
}
