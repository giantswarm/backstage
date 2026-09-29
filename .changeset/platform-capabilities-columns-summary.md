---
'@giantswarm/backstage-plugin-platform-capabilities': minor
---

The Installations page's capability columns are there from the first
paint and as narrow as one icon. The column set is the manager's
definitions (`get_info`, no repository read); each cell is a skeleton until
the listing arrives, so the table no longer renders without the columns and
jumps when they appear. The columns ask the manager for the summary listing
(`summary: true`: the states and the last actions alone, a third of the
manager's reads of the fleet); the Capabilities tab keeps the full listing of
its installation. Each column is 120px wide with its header on one line
instead of an equal share of the table, which had squeezed the Name column
until installation names wrapped mid-word. The dev harness mirrors the
page's base columns and a slow listing.
