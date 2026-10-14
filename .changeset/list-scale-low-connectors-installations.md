---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

Long lists of connector capabilities and environments stay readable. The new
connector's Test step previews six tools and reveals more six at a time
instead of all at once, and says how many tools the connector has when it
lists more than were read. A connector's Resources and Prompts tabs show 20 at
a time, with a search once there are more than 20, and still mark a list that
is only muster's first page. Notes and alerts that name environments (the
unreachable-environments warning, the not-reachable note, GPU capacity and GPU
node pool notices) name the first five and count the rest, group environments
that failed the same way, and keep the full list behind a disclosure. The
Profile page shows the first 20 environment badges with _Show all_. ui-react
adds `joinNames` and `groupNames` for these sentences.
