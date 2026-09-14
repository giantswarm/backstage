---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

Highlight the installation name in the Usage tab's intro sentences.

The Overview, Cost and Conversations views each open with a sentence naming the
installation they report on ("Spend on gazelle over the last 30 days…"). That
name is now bold, so the one word that says whose numbers these are stands out
from the rest of the sentence.

`SectionHeader`'s `description` accepts a `ReactNode` rather than a `string` to
allow the inline markup. Every existing caller passes a string, which is still
valid.
