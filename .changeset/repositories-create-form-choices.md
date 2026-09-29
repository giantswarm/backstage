---
'@giantswarm/backstage-plugin-repositories': minor
---

Create repository is a form of choices with its review beside it. The team is
picked, not typed: the person's own teams first (the form opens on the first),
then every team the inventory knows. A **Kind** -- Go service, chart-only app,
Go CLI, Go library, configuration, customer project, other; the shapes the
org's team files declare -- fills component type, language and flavours, and
turns _Generate CircleCI config_ on where the kind has a job; the three stay
editable as choices of the schema's values and re-derive the switch when
changed by hand. Visibility is a choice (private, the org's default, is left out
of the entry as the team files do). The name is held to the engine's rule as
typed -- lowercase; a chart repository's name without the `-app` suffix -- and
the manager's verdict on it (free on GitHub, taken) shows under the field.

The review no longer waits for a button: the dry run runs on its own once the
person pauses and is kept current with every change -- the entry with the
schema's defaults, the template, the name check, the refusals with their
one-click fix, the guard notices and the creation as the person would run it.
**Create** is enabled once the dry run for the form as it stands is accepted.
The page opens as a Go service for the person's team.
