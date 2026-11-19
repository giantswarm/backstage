---
'@giantswarm/backstage-plugin-agent-platform': minor
---

New agent and Edit agent: with an organization chosen, the Tools step offers the connectors of the organization page (`list_organization_connectors`) under "Connectors from the organization page", each with its state in words (ready, credential missing with a link to the organization's Connectors tab, not accepted with kagent's reason), and sends the picked ones as `connectors` (Edit agent only when the selection changed). Offered where the installation's agent-manager takes `connectors` (3.3 and later, read from the write tool's schema) and not on a coding Harness, which the section says instead; agent-manager's refusal of them shows next to the section.
