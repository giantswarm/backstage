---
'@giantswarm/backstage-plugin-muster': patch
---

Fix the muster MCP-servers manager so a federated family's "shared" config/auth no longer defaults to an arbitrary peer/customer management cluster.

A phase-1 fix reclassified the `Auth Required` MCPServer state from `warning` to `ok`, which silently flipped `StandardServerDisclosure`'s representative selection (`servers.find(s => severity === 'ok') ?? servers[0]`) from the local installation's own Connected server to the alphabetically-first server in list order — typically a customer MC. That cluster's name, URL and (non-shared) auth/token chain were then presented as the family's canonical face on another installation's screen.

- A shared `selectRepresentative` helper now prefers the active installation's own server (`managementCluster === activeInstallation`), then a `Connected`/`Running` server, then falls back to the first server but flags it unqualified so the family is labelled neutrally rather than by that server's MC.
- The Configuration caption reflects whether the representative is qualified; when it is not, it states the values are from one cluster and may differ per cluster instead of claiming "shared across the fleet".
- The Authentication / token-chain block now carries a "shown for `<mc>`; differs per cluster" caveat, since the chain (forward-token vs token-exchange/OBO) legitimately varies per management cluster.
