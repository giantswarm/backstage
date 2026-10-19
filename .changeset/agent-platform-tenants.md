---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
---

Agents per tenant. A person who may list agents only in some namespaces sees
the agents of every tenant the kagent controller lets them list (`ListAgents`
as the person, new backend route `GET /kagent/agent-namespaces`), read through
the Kubernetes API as before. Each agent names its tenant (`platform`,
`organization <name>`) and its creator (`agent-platform.giantswarm.io/created-by`);
the Agents tab filters by tenant and "Created by: Me". A person whom no tenant
binds sees who grants access instead of an error. The create flow offers only
the tenants in which the person may create agents and picks the only one; Edit,
Update skills and Delete show only where the person may update or delete the
agent's HelmRelease; a refused session start names the agent's tenant.
