export interface Config {
  agentPlatform?: {
    /**
     * Access to the kagent API v2 controller (gRPC), used by the Agent
     * Platform Sessions list, the session detail and chat, and the Usage tab.
     * The backend speaks native gRPC to each installation's controller route
     * and forwards the user's per-installation Dex ID token as
     * `authorization: Bearer` — and nothing else identifying: agentgateway
     * validates the token on that route and derives the caller from it.
     *
     * The frontend never talks to kagent directly: the browser cannot reach
     * `kagent.<baseDomain>` cross-origin, gRPC over HTTP/2 needs a server-side
     * client anyway, and the installation base domains are deliberately
     * backend-only (they deanonymize customers).
     *
     * Every key here therefore keeps the default **backend** visibility — none
     * of it is served to the unauthenticated frontend config. `apiBaseUrl`
     * embeds `baseDomain`, so marking any of it `@visibility frontend` would
     * leak the installation topology to anyone loading the page, which is the
     * same reason `gs.installations` is backend-only. The frontend learns the
     * installation *names* from the authenticated
     * `GET /api/agent-platform/kagent/installations` route instead.
     */
    kagent?: {
      /**
       * Per-request timeout in milliseconds toward a kagent controller. Bounds
       * how long an installation whose `kagent.<baseDomain>` host does not
       * resolve (i.e. kagent simply is not deployed there) can hold a request
       * open. Defaults to 10000.
       */
      timeoutMs?: number;

      /**
       * How long, in milliseconds, to wait for an agent to finish one turn before
       * answering "still running". Separate from `timeoutMs` because the A2A
       * `SendMessage` call answers only once the agent is done — and it is also
       * the budget of a Stop (`CancelTask`), which waits for the run to drain.
       *
       * Not a limit on how long a turn may take: the turn continues regardless,
       * and the outcome arrives through the conversation poll. Exceeding this is
       * not an error — the message is checked against the session's history, and a
       * turn that was dispatched answers 202.
       *
       * **Keep it below the request timeout of whatever fronts Backstage** (often
       * 60s). If that door fires first the browser gets a 502/504 instead of the
       * 202, and no handling here can help, because this service never got to
       * answer.
       *
       * Defaults to 30000 (30 seconds).
       */
      turnTimeoutMs?: number;

      /**
       * Bounds on the derived session-state summary that backs the session
       * switcher rail (`GET /kagent/session-states`).
       *
       * An AgentInstance reports whether it is ready, suspended or failed, but
       * not whether its newest turn is working or waiting for input — that lives
       * in the instance's tasks, so the route reads each candidate's task list
       * (status only, no history) and these are the levers on how much that may
       * cost. Instances whose own state already answers (failed, still being
       * created, being deleted) are not read. They are config rather than constants because the one
       * thing we cannot predict is how this behaves against an account far larger
       * than any measured — that wants a knob, not a release.
       *
       * Deliberately not query parameters: the browser must not be able to ask
       * for a bigger fan-out.
       */
      sessionStates?: {
        /**
         * How many sessions may be evaluated in one pass, newest activity first.
         * Defaults to 20 — a measured real account held 21 sessions in total.
         */
        maxSessions?: number;

        /**
         * How stale a session may be and still be worth a task read, in
         * milliseconds. Defaults to 604800000 (7 days).
         *
         * Generous on purpose: a session waiting on a human can sit for days, and
         * that is exactly what the rail exists to surface. `maxSessions` is the
         * real bound; this only trims a long tail.
         */
        maxAgeMs?: number;

        /** Task reads in flight at once. Defaults to 4. */
        concurrency?: number;

        /**
         * Per-task-read timeout in milliseconds. Defaults to 5000 — below the
         * client's own `timeoutMs`, so one hung read cannot spend the whole pass.
         */
        taskTimeoutMs?: number;

        /**
         * Whole-pass deadline in milliseconds. Defaults to 8000. Anything still
         * unread when it expires is reported as skipped rather than waited for.
         *
         * **Keep it below the frontend's fastest poll** (10s), or a slow answer
         * lets requests pile up behind the interval that asked for it.
         */
        budgetMs?: number;

        /**
         * How long a computed summary is reused, in milliseconds. Defaults to
         * 15000.
         *
         * **Must exceed the frontend's fast poll** (10s) or it misses on nearly
         * every request and buys nothing. Cached in process memory only, keyed by
         * a hash of the caller's token, and never written anywhere shared: the
         * summary is derived from one user's session list.
         */
        cacheTtlMs?: number;
      };

      /**
       * Bounds on the usage summary that backs the Usage tab
       * (`GET /kagent/session-usage`).
       *
       * The same shape as `sessionStates` above, and for the same reason:
       * kagent stores no usage summary, so totalling a user's tokens means
       * reading every instance's whole conversation (the usage metadata rides
       * on the agent's output). These are the levers on how much that may cost.
       *
       * **The numbers differ from the `sessionStates` ones deliberately**, so
       * a near-identical block sitting above this one does not read as a
       * copy-paste error. That pass is sized to a 10s frontend poll; this route
       * is read on a tab visit and reports on *days*.
       *
       * Deliberately not query parameters: the browser must not be able to ask
       * for a bigger fan-out.
       */
      sessionUsage?: {
        /**
         * The window the page reports on, in days. Defaults to 30.
         *
         * Travels in the response, so shortening it re-labels the page rather
         * than making a heading lie.
         *
         * **Check the deployed kagent's own retention before raising it.**
         * Instances and tasks the controller has pruned are gone outright — past
         * that point the window is silently incomplete and no field in the
         * response can say so.
         */
        windowDays?: number;

        /**
         * How many sessions may be evaluated in one pass, newest activity
         * first. Defaults to 60 — three times a measured real account.
         *
         * Higher than the `sessionStates` cap because the window here *is* the
         * reported scope, which makes this cap the only thing that can make the
         * page under-report. Exceeding it is surfaced as `skipped`.
         */
        maxSessions?: number;

        /**
         * How stale a session may be and still be worth a task read, in
         * milliseconds. Defaults to 2678400000 (31 days) — the window plus a
         * day of slack for clock skew and the UTC day boundary.
         *
         * Safe because the controller bumps an instance's `updated_at` on
         * every turn, so an instance with no activity in 31 days holds no turn
         * inside a 30-day window. Raise it with `windowDays`.
         */
        maxAgeMs?: number;

        /**
         * Task reads in flight at once. Defaults to 6 — higher than the
         * `sessionStates` pass, which has no poll behind it to stay clear of
         * and three times fewer sessions to cover.
         */
        concurrency?: number;

        /**
         * Per-task-read timeout in milliseconds. Defaults to 5000, below the
         * client's own `timeoutMs`.
         */
        taskTimeoutMs?: number;

        /**
         * Whole-pass deadline in milliseconds. Defaults to 20000. Anything
         * still unread when it expires is reported as skipped.
         *
         * **Higher than the `sessionStates` budget on purpose**, and the
         * warning inverts: there is no poll to stay under, but **keep it below
         * the request timeout of whatever fronts Backstage** (often 30s), or
         * the browser gets a 504 instead of a partial 200 it could render.
         */
        budgetMs?: number;

        /**
         * How long a computed summary is reused, in milliseconds. Defaults to
         * 300000 (5 minutes).
         *
         * **Much longer than the `sessionStates` TTL on purpose.** That one is
         * pinned by a 10s poll it must beat; this route is read on a tab visit
         * and its buckets are days, so five minutes covers a tab bounce, a
         * reload and a second browser tab with one fan-out. `evaluatedAt`
         * travels in the response, so the staleness is shown, not hidden.
         *
         * Cached in process memory only, keyed by a hash of the caller's token,
         * and never written anywhere shared: it is a per-user breakdown of what
         * someone ran and which tools they reached for.
         */
        cacheTtlMs?: number;
      };

      /**
       * Installations to reach kagent on, keyed by installation name — the
       * same keys as `gs.installations`.
       *
       * When omitted, every entry in `gs.installations` that has a
       * `baseDomain` is derived as `https://kagent.<baseDomain>` — the
       * hostname on which the connectivity chart's `GRPCRoute` serves the
       * controller — and installations without kagent simply fail per request
       * and are treated as "not installed". Set this to restrict the fan-out to
       * the installations that actually run kagent, or to point one at a
       * non-default origin. An entry with no fields (`{}`) means "enabled, use
       * the derived origin".
       */
      installations?: {
        [installationName: string]: {
          /**
           * The gRPC origin of this installation's kagent controller route,
           * overriding the derived `https://kagent.<baseDomain>`:
           * `https://<host>[:port]`, no path and no trailing slash — gRPC is
           * matched by service, not by prefix. Must be a route that validates
           * the forwarded token (the connectivity chart's controller route with
           * its JWT policy): the controller behind it attributes every call to
           * the identity that route derives, so an origin that bypasses it has
           * no boundary.
           *
           * `http://` is plaintext HTTP/2 (h2c), which only an in-cluster
           * Service URL should ever be — a development shape, never a fleet one.
           */
          apiBaseUrl?: string;
        };
      };
    };

    /**
     * Access to the model-manager REST API (giantswarm/model-manager), used by
     * the Models tab's Serving section on installations that deploy the
     * optional model-manager component. The backend proxies it per
     * installation, forwarding the user's per-installation Dex ID token as
     * `Authorization: Bearer`.
     *
     * Nothing here is derived from `baseDomain`: model-manager lives behind the
     * agentgateway `/model-manager` route rather than a well-known subdomain,
     * and only some installations deploy it, so every installation is listed
     * explicitly. The standalone chart renders this block whenever the
     * component's route is enabled.
     *
     * **Trust model.** model-manager itself checks no identity. The gateway
     * route in front of it (an `AgentgatewayPolicy` with JWT validation, the
     * same shape as the kagent controller route) is the boundary that rejects a
     * missing or invalid token; this proxy only forwards it. An `apiBaseUrl`
     * that bypasses the gateway (an in-cluster Service URL) has no boundary,
     * and every signed-in portal user can then manage models.
     *
     * Every key keeps the default **backend** visibility — `apiBaseUrl` embeds
     * the installation's gateway hostname, which deanonymizes customers just as
     * `baseDomain` does. The frontend learns the installation *names* from the
     * authenticated `GET /api/agent-platform/model-manager/installations`.
     */
    modelManager?: {
      /**
       * Per-request timeout in milliseconds toward a model-manager API.
       * Defaults to 10000.
       */
      timeoutMs?: number;

      /**
       * Timeout in milliseconds for `POST /api/v1/models/load`, which answers
       * only once the backend has the model in memory — on Ollama that means
       * reading several GiB of weights. Defaults to 120000. Keep it below the
       * request timeout of whatever fronts Backstage, or the browser sees a
       * 502/504 while the load quietly completes.
       */
      loadTimeoutMs?: number;

      /**
       * Installations that run model-manager, keyed by installation name — the
       * same keys as `gs.installations`. Only listed installations are
       * proxied; an entry without `apiBaseUrl` is skipped with a warning.
       */
      installations?: {
        [installationName: string]: {
          /**
           * model-manager base URL for this installation, no trailing slash;
           * the REST paths (`/api/v1/...`) are appended. Through the gateway:
           * `https://agentgateway.<baseDomain>/model-manager`.
           */
          apiBaseUrl?: string;
        };
      };
    };
  };
}
