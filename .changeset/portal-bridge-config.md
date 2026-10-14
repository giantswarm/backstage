---
'app': minor
'@giantswarm/backstage-plugin-agent-platform-common': minor
---

Deployment config now decides which portals exist: `app.portals.platformPortal`
(default `true`) and `app.portals.agentPlatform` (default `false`), documented in
`packages/app/config.d.ts` and `app-config.yaml`. Both are public config, since
the app decides its pages and navigation at start, before sign-in.

- **Both on**: the Agent Platform shell on `/`, `/agent-platform/**` and
  `/customize/**`, the classic portal everywhere else, cross-linked in new tabs
  ("Platform Portal" in the rail, "Agent Platform" in the classic sidebar) — for
  everyone, no flag needed.
- **Only `agentPlatform`**: the shell is the navigation. `/` is the new-session
  screen for everyone and the rail has no "Platform Portal" item. Classic pages
  stay reachable by URL, in classic chrome, whose "Agent Platform" item leads
  back home in the same tab; nothing in the shell links to them.
- **Only `platformPortal`** (the default): exactly the classic portal — no agent
  shell, no cross-link. The `agent-platform-shell` feature flag remains as a
  per-browser opt-in here only; it is not listed in the settings while the
  deployment has the Agent Platform on. Both off reads as the default.

The app's FeatureFlagsApi reports `agent-platform-shell` from this config (with
the person's flag as the opt-in), so the shell's extension predicates and every
plugin reading the flag follow the deployment. `agent-platform-common` gains
`readPortals`, `isAgentShellOptInOffered` and the `Portals` type; the app gains
`usePortals()`. `agentPlatform` still needs `page:agent-platform` enabled in
`app.extensions`.
