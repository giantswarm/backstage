---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The create wizard shows an agent of an Organization's tenant the platform
Harness as its only runtime, and no "Could not read the runtimes" warning for
the platform namespace. It creates the agent in the tenant it names: a model
preselected before the tenant was known no longer puts it in the platform
tenant (#3189).
