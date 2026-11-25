---
'@giantswarm/backstage-plugin-agent-platform': major
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

Organizations are `Organization` objects with the Agent Platform enabled, identified by their name alone: an organization's page is `/organizations/<installation>/<name>` and its credential form `/organizations/<installation>/<name>/credentials/<operation>`, with no parent namespace. The Organizations page lists each organization one time and offers Create organization, which asks for the name, a display name and the admins (groups and people); the new organization shows at once and says it is not ready until the operator reports it. A person who manages an organization changes its admins on its Members tab; the member form offers the editor and user roles only, and an admin is not removed as a member. Deleting an organization asks for its name. Needs agent-manager with the organization tools on `Organization`. The portal calls agent-manager's tools with the organization's name (`organization`), never its namespace, as agent-manager on `Organization` requires; a write of an installation's model sends no namespace either, so it too needs that agent-manager.
