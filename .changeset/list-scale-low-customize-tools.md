---
'app': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

Lists in Customize and the new-agent flow now fit both a handful of entries and hundreds. The Customize search shows only on tabs with more than eight entries, or when a search is already set (a `?q=` link can now open a tab with that search). The Models and Connectors tabs show 20 rows at a time, and the model picker shows 12 cards at a time and always keeps the selected model visible. In the new-agent Tools step, a catalogue of 20 entries or fewer opens straight away, with no search and no _Browse the catalogue_ toggle.
