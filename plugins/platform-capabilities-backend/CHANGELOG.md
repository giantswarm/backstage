# @giantswarm/backstage-plugin-platform-capabilities-backend

## 0.1.0

### Minor Changes

- 90ddd8d: **Run them as you** on the Capabilities tab runs the cluster checks on the manager's one
  muster registration: `POST .../verify-live` calls `verify_installation` on
  `platformCapabilities.muster.server`, the same gateway the comparison and the actions use, with
  the same request and answer. A person without the grant is sent through muster's connect, as
  for every other call. The second gateway and its `platformCapabilities.muster.liveServer`
  option (default `<server>-live`) are removed; the key is ignored where a config still carries it.

### Patch Changes

- 6909d96: `GET /installations?summary=true` forwards `summary: true` to the manager's
  `list_installations`: the states and the last actions alone, what the
  Installations page's columns ask for.
- ba553f1: Read the muster, ai-chat, agent-platform and flux frontend config from the
  signed-in config (`GET /api/gs/config`) instead of the public `index.html`.

  `muster.serverName` and `muster.installations[].name/authProvider` (the
  fleet's codenames), `aiChat.welcome.*`, `aiChat.mcp[].name/authProvider`,
  `aiChat.contextWindow`, `agentPlatform.skills.repositories` and
  `flux.gitRepositoryPatterns` keep the default (backend) visibility and reach
  the browser after sign-in through `@giantswarm/backstage-plugin-gs-react`.
  The plans, platform-capabilities, repositories and roadmap backends drop the
  `@visibility frontend` markers no frontend read, so the public config no
  longer names their muster installation, repositories, board or teams. No
  `@visibility frontend` is left in these plugins.

- Updated dependencies [71317f9]
- Updated dependencies [85e7d8c]
- Updated dependencies [8967f50]
- Updated dependencies [9a71810]
- Updated dependencies [32f943c]
- Updated dependencies [e2958de]
- Updated dependencies [5851bba]
- Updated dependencies [d817adf]
- Updated dependencies [0bba1e6]
- Updated dependencies [cad8b48]
- Updated dependencies [d7b3983]
  - @giantswarm/backstage-plugin-gs-node@0.4.0
