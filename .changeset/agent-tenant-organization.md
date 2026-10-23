---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The agent's tenant reads as its Organization: the organization's plain name
under the label "Organization" on the agent's page and in the Agents list's
rows and filter, or "None" for an agent of the platform, with an info icon
saying it is available to all organizations ("None" in the filter too).
Sentences, empty states and refusals say "the platform" or "the acme
organization" instead of "tenant". The New agent form offers Platform,
Organization and, for a managed namespace that is no organization, Other
namespace as choices where the person may create in more than one kind;
Organization lists the organizations by name, without the `organization `
prefix. The choice goes with the environment. An Agents list row's link is now
the agent's name, its hit area still covering the row.
