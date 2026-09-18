# Platform capabilities on the Installations page

The Installations page is where a platform capability (today `agent-platform`) is enabled, reconciled and verified on an installation. Everything goes through **giantswarm-platform-manager**'s MCP tools via muster as the signed-in person -- the pattern of the Repositories page over the repository manager. The page renders what the tools return; nothing is composed or decided in the portal.

## Plugins

- `plugins/platform-capabilities-backend`: a thin gateway over the manager's tools (`list_installations`, `enable_capability`, `reconcile_capability`, `verify_capability`, `list_actions`, `get_action`, `get_info`). The frontend forwards the caller's Dex ID token in `backstage-muster-authorization`; muster forwards it to the manager, which reads the registry and the installations' repositories with the person's GitHub grant. A missing grant is a 401 carrying muster's sign-in URL; the manager's refusals are 403s, shown verbatim.
- `plugins/platform-capabilities`: the API client, the Installations page's capability columns (`useInstallationCapabilityColumns`, consumed by the gs plugin's `InstallationsPage`) and the **Capabilities** entity tab of a `Resource` of `spec.type: installation`.

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

The browser proof is `e2e/agentlab/installations-capabilities.spec.ts` (`AGENTLAB_PLATFORM_MANAGER=1`).
