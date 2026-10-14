---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The create flows all speak the connector wizard's language now, in the content
area rather than full screen or a dialog:

- **Create agent** renders its Details / Skills / Tools / Review steps in the
  shared in-content `WizardFrame` — step strip on top, centered column, sticky
  footer with Cancel, Back and the step's primary action. The Skills step
  still only appears when skill repositories are configured; all form logic,
  validation and the dry-run review are unchanged.
- **Add model** is the same single-step frame (Cancel and Close leave to the
  Models list, or the Customize screen's Models tab inside the shell).
- **Add skill** moved out of its dialog onto a page of its own,
  `/agent-platform/skills/new`, in the same frame: the pull-request proposal
  form, its outcome and a Done action. The Customize screen's Skills tab links
  there instead of opening a dialog.
- The Customize screen's **Agents** tab shows the agents as the Connectors
  tab shows connectors: one flat table (avatar, name and description, the
  organization as a column, model, skills & connectors, environment where more
  than one, and the status dot), each row opening the agent — instead of cards
  grouped per organization.
- The Customize screen's **Skills** tab shows the skills the same way: one
  flat table (name and description, source, used by), the skills the agents
  in scope use most first, each row opening the skill — instead of a card
  grid. With Models already a table, the Customize tabs now share the
  Connectors tab's presentation.
