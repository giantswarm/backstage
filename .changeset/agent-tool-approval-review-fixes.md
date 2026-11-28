---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

Tool approval per agent review fixes: a save never drops settings when agent-manager's schema is unreadable, saves nothing over a concurrent change (`expectedGeneration`), and partial saves say what landed.
