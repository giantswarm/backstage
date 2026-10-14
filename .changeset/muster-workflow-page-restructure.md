---
'@giantswarm/backstage-plugin-muster': minor
---

A workflow's page is reorganised around what it does, and its flow never cuts a step title.

- **Sections:** the page now reads "What it needs", "How it runs", "Statistics", then one "Advanced" disclosure holding "Where agents use it" and "Technical details" (the CR's namespace and labels, the referenced tools and the raw definition, without a second fold-out).
- **Runs:** the "Recent runs" list and the "Runs" line beside the page are gone. Statistics shows the last run instead (outcome, when, to the minute, how long, and a failed run's error), and its completed/failed breakdown counts every recorded run (muster's own totals) instead of the stats sample. A single run's step-by-step result stays on the flow, which the last run colours.
- **Flow canvas titles:** a step title wraps onto a second line in a taller box instead of being cut with an ellipsis. Nodes widen (up to a cap, all to one width) until every title fits in two lines. Only a title longer than that is clamped, and it shows in full on hover. The last-run badge moved to the node's second line, next to the tool, so it no longer narrows the title. The same applies to the names of loop and parallel groups.
- **Wide flows:** a flow wider than its box (a wide parallel group, the cleanup lane) opens scrolled to its main column instead of its left edge, and a parallel group's name is centred over that column, so it is in view.
