---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The agent's tenant reads as its Organization: "Platform", or the
organization's plain name, under the label "Organization" on the agent's page,
in the Agents list's rows and filter, and in the New agent form; sentences,
empty states and refusals say "the platform" or "the acme organization"
instead of "tenant". The New agent form offers Platform, Organization and,
for a managed namespace that is no organization, Other namespace as choices
where the person may create in more than one kind; Organization lists the
organizations by name, without the `organization ` prefix. The choice goes
with the environment.
