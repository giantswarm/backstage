---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The agent picker for a new session finds an agent by the text its option shows
under the name (its description, or why an unavailable agent cannot be started)
as well as by its name, listing name matches first. Words are matched from
their start, so a short query no longer matches inside words.
