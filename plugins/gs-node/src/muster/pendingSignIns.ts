/**
 * How long muster's sign-in answer for a server is reused for the caller's
 * calls of its tools: well inside the 10 minutes muster keeps a sign-in
 * link's OAuth state.
 */
export const SIGN_IN_REUSE_MS = 2 * 60_000;

/**
 * How long an answer without a sign-in link (muster could not start one: its
 * rate limit, an undiscoverable issuer) holds the server's calls: the rate
 * limit's own window.
 */
export const REFUSED_SIGN_IN_HOLD_MS = 60_000;

/** Muster's auth_required answer for a server, as a gated call got it. */
export interface SignInChallenge {
  server: string;
  /** The sign-in link; absent when muster could not start a sign-in. */
  authUrl?: string;
  /** Muster's own text blocks: the message first. */
  texts: string[];
}

interface Pending extends SignInChallenge {
  until: number;
  /** The exposed tool names muster answered this challenge for. */
  tools: Set<string>;
}

/**
 * The sign-ins muster asked a caller for, per server, until the caller acts
 * on them or they lapse.
 *
 * Muster answers a call of a server's tool the caller holds no grant for with
 * the auth_required challenge, and starts a sign-in (`core_auth_login`) for
 * every such answer. Muster allows a person only a few sign-ins a minute, so
 * a page that keeps calling a gated tool would spend them all and lock the
 * person out of signing in anywhere. Within the reuse window a gated call of
 * the server is answered here with muster's last challenge and never reaches
 * muster; the caller's own sign-in (`core_auth_login`, `core_auth_logout`) and
 * an `auth://status` that reads the server connected end the wait at once.
 *
 * A caller is one muster session: an installation and a person's token.
 */
export class PendingSignIns {
  private readonly callers = new Map<string, Map<string, Pending>>();

  constructor(private readonly now: () => number = Date.now) {}

  /** The challenge a call of `tool` gets without asking muster, if any. */
  pendingFor(caller: string, tool: string): SignInChallenge | undefined {
    const servers = this.callers.get(caller);
    if (!servers) {
      return undefined;
    }
    const now = this.now();
    for (const [server, pending] of servers) {
      if (pending.until <= now) {
        servers.delete(server);
      } else if (pending.tools.has(tool) || tool.startsWith(`x_${server}_`)) {
        return { server, authUrl: pending.authUrl, texts: pending.texts };
      }
    }
    if (servers.size === 0) {
      this.callers.delete(caller);
    }
    return undefined;
  }

  /** Muster answered the caller's call of `tool` with this challenge. */
  remember(caller: string, tool: string, challenge: SignInChallenge): void {
    this.sweep();
    let servers = this.callers.get(caller);
    if (!servers) {
      servers = new Map();
      this.callers.set(caller, servers);
    }
    const tools = servers.get(challenge.server)?.tools ?? new Set<string>();
    tools.add(tool);
    servers.set(challenge.server, {
      ...challenge,
      tools,
      until:
        this.now() +
        (challenge.authUrl ? SIGN_IN_REUSE_MS : REFUSED_SIGN_IN_HOLD_MS),
    });
  }

  /**
   * The caller started a sign-in of its own and got `authUrl`: the server's
   * calls carry that link from now on, the one the person is completing.
   */
  restarted(caller: string, server: string, authUrl: string): void {
    const pending = this.callers.get(caller)?.get(server);
    if (pending) {
      pending.authUrl = authUrl;
      pending.until = this.now() + SIGN_IN_REUSE_MS;
    }
  }

  /** The caller connected or signed out of the server: muster is asked again. */
  forget(caller: string, server: string): void {
    const servers = this.callers.get(caller);
    servers?.delete(server);
    if (servers?.size === 0) {
      this.callers.delete(caller);
    }
  }

  private sweep(): void {
    const now = this.now();
    for (const [caller, servers] of this.callers) {
      for (const [server, pending] of servers) {
        if (pending.until <= now) {
          servers.delete(server);
        }
      }
      if (servers.size === 0) {
        this.callers.delete(caller);
      }
    }
  }
}
