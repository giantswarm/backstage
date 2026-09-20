---
'@giantswarm/backstage-plugin-repositories': minor
---

The Repositories table's Set-up column shows one icon per row instead of
the state as text, the same marks the Installations page's capability
columns use: a green check where the engine's check found the repository
set up as declared (in sync), an orange sync-problem where it found it off
its declared set-up (not in sync), a blue sync where it is declared but not
reconciled yet (no check has run through it, or an Align now waits for its
run), an empty circle where no declaration sets it up (not installed), a
red error where the engine refused the declaration or the check could not
run (failed), and a question mark where GitHub no longer has it (unknown).
The state in the manager's words is the icon's tooltip and accessible name,
the header's tooltip is the legend; sorting by set-up puts the repositories
wanting a look first. The expanded record keeps the state as text.
