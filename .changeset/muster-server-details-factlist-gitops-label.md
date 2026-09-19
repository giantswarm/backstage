---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-flux-react': patch
'@giantswarm/backstage-plugin-muster': patch
---

MCP server details: the expanded row opens with space between the server name and the first sub-heading instead of the two touching, every sub-heading gets room from its own body, and the Tools block separates its summary line from the tag rows. Every key/value block — configuration, auth/token chain, diagnostics, live runtime, GitOps provenance — is the shared `FactList` from `ui-react` rather than a grid of its own. The registration wizard's Verify step uses it too, so `DefRow` is gone.

The GitOps footer now says what the rest of the portal says: a new `GitOpsManagedLabel` in `ui-react` carries the GitOps icon, "Managed through GitOps" and an optional link to the source in Git. It replaces the "GitOps-managed (read-only)" badge on the Servers and Workflows pages and the loose "Lifecycle is managed via GitOps" sentence on the standard-server rows, whose footer now matches the registered rows'. `flux-react`'s `GitOpsCard` renders the same label, keeping its own Kustomization/GitRepository lookups.

The detail body and the action row are on bui: `Text` for the headings and notes, `Flex`/`Box` for the layout, `TagGroup` for the tool pills (each still a real link into the tool explorer, now undecorated) and bui `Button` for the lifecycle actions. The three dialogs behind those buttons stay on MUI for now.
