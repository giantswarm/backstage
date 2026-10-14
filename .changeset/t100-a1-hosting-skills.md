---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': patch
'@giantswarm/backstage-plugin-muster': patch
---

Remove model config on a running model asks first and names the agents that use the config. The agent page's "Update skills…" is now "Update all skills to latest…", and a skill pinned behind its catalog's newest commit shows "Update available". Add GPU node pool is disabled with its reason where no environment has a cluster, and Serve model no longer preselects a preset the nodes cannot serve. `DisabledAction` moves from muster to ui-react.
