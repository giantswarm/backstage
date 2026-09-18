# Platform capabilities on the Installations page

The Installations page is where a platform capability (today `agent-platform`) is enabled, reconciled and verified on an installation. Everything goes through **giantswarm-platform-manager**'s MCP tools via muster as the signed-in person -- the pattern of the Repositories page over the repository manager. The page renders what the tools return; nothing is composed or decided in the portal.

## Plugins

- `plugins/platform-capabilities-backend`: a thin gateway over the manager's tools (`list_installations`, `enable_capability`, `reconcile_capability`, `verify_capability`, `list_actions`, `get_action`, `get_info`). The frontend forwards the caller's Dex ID token in `backstage-muster-authorization`; muster forwards it to the manager, which reads the registry and the installations' repositories with the person's GitHub grant. A missing grant is a 401 carrying muster's sign-in URL; the manager's refusals are 403s, shown verbatim.
- `plugins/platform-capabilities`: the API client, the Installations page's capability columns (`useInstallationCapabilityColumns`, consumed by the gs plugin's `InstallationsPage`), the **Consistency** view per capability (`ConsistencyView`, mounted by the gs plugin at `/installations/consistency/<capability>`) and the **Capabilities** entity tab of a `Resource` of `spec.type: installation`.

Both are disabled by default so customer portals never see them. A deployment opts in:

```yaml
app:
  extensions:
    - api:platform-capabilities
    - entity-content:platform-capabilities/capabilities
platformCapabilities:
  muster:
    installation: <name in muster.installations>
    server: giantswarm-platform-manager
    # toolPrefix: giantswarm-platform-manager   # default: the server name
```

## What the tab shows

Per capability: the state in the manager's words (`not opted in`, `not enabled`, `pending approval`, `rolling out`, `waiting for the customer`, `enabled`, `drifted`, `failed`), the inputs on record (the installation's record), the last action. **Enable** or **Reconcile** opens a dialog whose form is generated from the definition's JSON schema in `get_info` -- a field per leaf, a heading per nested object, a select for every choice with nothing preselected, the `installation.*` group prefilled from the record. **Review** runs the dry run and shows the files per repository, the generated secrets by name only, the Dex clients with their redirect URIs, the customer actions, the probes and the pull requests in order. **Commit** sends `mode: commit`; it is disabled while the person's muster session does not reach the manager (the connection check) and absent where the plan says a commit would be refused. An installation _not opted in_ shows the opt-in file's path and the pull request that adds it. **Verify** runs `verify_capability` and lists the features with their marks (`as defined`, `differs by input`, `drifted`, `not checked`) and the differences. The action history lists `list_actions` newest first, each opening to its pull requests, approval and rollout.

## The Consistency view

A tab of the Installations page per capability the manager knows (`Consistency: agent-platform`, at `/installations/consistency/agent-platform`): every installation of the registry as a row, opted in or not, the hub among them; every feature of the capability's definition (`get_info`'s `features`) as a column; each cell the feature's mark from `verify_capability` — _as defined_, _differs by input_, _drifted_, or _not checked_ with the manager's reason. A cell expands to the feature's dimensions: mark, reason, the differences (file and path, the input driving the difference where there is one, rendered against current) and the probes' requests with their status. A row expands to the installation's inputs the comparison rendered from (before it answered, the record `list_installations` carries), the definition's refusal where there is one, and the repositories the person cannot read.

There is no schedule. The comparison runs when the view opens, four installations at a time (each is one `verify_capability`, rendering the installation and reading its repositories as the person), and the answers are kept for the session — leaving the view and coming back shows the last comparison. **Verify now** runs it again for one installation.

Who may read an installation is the portal's own knowledge: the per-installation inventory probe (`GET /apis` through the kubernetes proxy) that every Agent Platform tab uses. Where it answered 401 or 403 the person has no RBAC there, and the row is marked _not readable_: its dimensions that read the installation live (`kind: probe`, `kind: live`) show as _not readable_ instead of whatever the manager's anonymous probe answered, and the feature's mark rolls up from the file dimensions alone — no drift is shown that the person could not see for themselves. A feature with nothing but live dimensions is _not readable_ as a whole. An installation this portal is not configured for, or one still connecting, keeps the manager's marks.

The browser proofs are `e2e/agentlab/installations-capabilities.spec.ts` (the columns and the tab) and `e2e/agentlab/installations-consistency.spec.ts` (the Consistency view), both under `AGENTLAB_PLATFORM_MANAGER=1`.
