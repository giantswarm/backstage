---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Fixture mode serves model management for organizations, outside production builds only: the fixture agent-manager's `get_info` names the organization namespaces where the person may create agents as `managed`, and the fixture Kubernetes API lets only an organization's admins create its models, so Connect a model offers an organization as owner to its admins; each namespace's default model carries the default-model annotation, so a model's page shows the default and **Set as default** moves it. In fixture mode the Organizations pages' browser flag starts on, and its toggle stays.
