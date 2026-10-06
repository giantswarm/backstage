---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The New agent review page shows the checks agent-manager's dry run could not
make (`validate_agent`'s `notes`, such as the name-clash check for a person who
may not read the namespace's HelmReleases) as an informational list beside the
violations. Notes never withhold Deploy: the dry run is still valid. A dry run
without notes renders as before.
