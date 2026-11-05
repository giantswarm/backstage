---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-analytics-react': minor
'app': patch
---

Agent Platform organizations. `/organizations` lists the organizations the signed-in person belongs to (agent-manager's `list_my_organizations`) and tells a person in none who can add them; an organization's page has Members, Models, Connectors and Egress tabs read from agent-manager's organization tools, adds a group (offered first) or a person to a role and removes one, showing agent-manager's refusal. On installations whose agent-manager reports `organizations`, the New agent form offers only the person's organizations, preselects a single one and has no Platform option; its models, with the organization's default preselected, and its connectors follow the organization. Every page names an agent's organization from agent-manager's answers, never from a namespace name prefix. New events `AgentPlatform.organizationMemberAdded` and `AgentPlatform.organizationMemberRemoved`; exports `ORGANIZATION_PAGE_TABS`.
