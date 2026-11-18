---
'@giantswarm/backstage-plugin-agent-platform': minor
---

An organization's content (models, connectors, egress policies, members and credentials, their deletes included) is written in the organization's own mode: by pull request for an organization applied from git on an installation where agent-manager opens pull requests, live otherwise. After a write by pull request the page shows the pull request with its link, as the organization's delete does. There, a model that Flux applies from the organization's git path can be edited, set as default and deleted from the portal. Installations without commit mode, and live organizations, behave as before.
