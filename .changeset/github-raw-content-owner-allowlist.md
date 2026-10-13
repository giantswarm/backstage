---
'@giantswarm/backstage-plugin-gs-backend': patch
---

The gs backend uses the portal's GitHub credentials only for repository
owners in `gs.github.allowedOwners` (default: `giantswarm`), enforced in a
wrapper around the credentials provider that every caller-influenced entry
point shares: the `/github/raw-content` proxy, `/agent-skills` discovery and
the `get-helm-chart-values` MCP action. Previously each of them requested
credentials for whatever owner appeared in the caller-supplied URL, so any
signed-in portal user could read private content from every repository the
portal's GitHub App can see. The owner is derived from the WHATWG-normalized
URL, so dot segments cannot smuggle a different owner past the check. URLs
under other owners are still fetched, but without credentials, so only their
public content is reachable; a portal that reads private repositories of
other owners must list them in `gs.github.allowedOwners`.
