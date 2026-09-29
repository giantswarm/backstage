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

Per capability, one card. The header: the state in the page's words (_Not installed_, _Pending approval_, _Rolling out_, _Waiting for the customer_, _Installed_, _Failed_) next to the mark the Installations page's column shows the capability under, and what the comparison run as the tab opens found -- _Installed · 2 checks differ_, _Installed · up to date_, or _not compared_, the mark then the listing's with the manager's reason on its tooltip. Under it: the manager's reason where the definition refused; the choices on record; the features compared with the definition, the files with their diffs, the planned changes and the checks that did not run; the last action. One button, **Enable** or **Apply changes**, names its outcome once the comparison has landed (_Apply changes · 2 files_) and opens a dialog whose form is generated from the definition's JSON schema in `get_info` -- a field per leaf, a heading per nested object, a select for every choice -- prefilled from the comparison's inputs. **Review** runs `verify_capability` with the form's values and shows the features with their marks (`as defined`, `differs by input`, `drifted`, `planned`, `not checked`), the files per repository, the generated secrets by name only, the Dex clients with their redirect URIs, the customer actions and the pull requests; where the manager would refuse, its reason as an Alert over the form kept editable. **Open 1 pull request** (the number the plan's) sends `mode: commit`; it is disabled while the person's muster session does not reach the manager (the connection check) and absent where the plan opens none. A button that cannot be pressed -- the manager refuses the commit for something to fix first, an action is in flight, the comparison still runs -- is the secondary variant, its reason the accessible description. The action history lists `list_actions` newest first, each opening to its pull requests, approval and rollout.

The browser proof is `e2e/agentlab/installations-capabilities.spec.ts` (`AGENTLAB_PLATFORM_MANAGER=1`).
