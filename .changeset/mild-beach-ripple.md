---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The Agents and Sessions tabs explain an installation whose inventory probe was
refused (gs `InstallationInventoryGate`): when the API server of the installation
the tab reads rejected the person's token or refused the read, the tab says
which installation, what the API server answered and what fixes it, instead of
listing nothing.
