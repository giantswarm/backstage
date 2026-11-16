---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Fixture mode serves model management for organizations, outside production builds only: the fixture agent-manager's `get_info` names the organization namespaces where the person may create agents as `managed`, so Connect a model offers them as owners; each namespace's default model carries the default-model annotation, so a model's page shows the default and **Set as default** moves it; and a model without a credential is written at once instead of asking for a key. `yarn fixtures start` enables the Organizations pages.
