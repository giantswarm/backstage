---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-ui-react': minor
---

Add the workspace editor at Customize → Workspaces (`/customize/workspaces/new` and `/customize/workspaces/<installation>/<organization>/<name>/edit`): a name checked as it is typed (format and whether it is free); sources on any provider instance, each an owner with a Language, Topics and Including filter (counts per option where the workspace-manager reports them) and one table of the owner's repositories, matches first, to pick by name or exclude; Edit shows one source at a time; a single minimum disk size under Advanced options; a live preview of what the draft selects; the manager's validation message on the field it names; and an inline sign-in (`ProviderConnectPrompt`) that grants a provider's App in muster. The Workspaces tab gets its heading, New workspace, one line per source and the row menu Open, Edit, Sync now, Delete. `WizardFrame` takes a `meta` line at the header's right end.
