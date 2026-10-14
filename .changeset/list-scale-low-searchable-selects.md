---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-gs': patch
---

Dropdowns over environments, clusters, repositories, serving targets, presets
and nodes now offer type-ahead search once they list more than eight options,
and stay plain lists at eight or fewer. This covers the environment pickers of
the new-agent and new-model flows, the add-backend and add-GPU-node-pool
dialogs (environment, cluster and _I want to serve_), the serve, pull and
download dialogs (target, preset or model, serving preset and target node),
the add-skill repository picker, and the Agent Platform installation scope
selector. The gs `InstallationScopeSelect` offers it only where the caller opts
in with the new `searchable` prop (off by default, a plain select as before);
the Agent Platform's scope controls pass it.
