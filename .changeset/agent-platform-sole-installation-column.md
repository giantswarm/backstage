---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

The Model configs, GPU node pools, model cache and GPU capacity tables leave
out the Installation column when their rows can only come from one
installation — one pinned in the header, or only one that answered — as the
Agents and Sessions lists already do. All six tables now share one rule for it.
In the Model configs table the name column gets most of the width, and Status,
Provider and Installation are narrower.
Tables that sort by Installation by default sort by name while the column is
hidden, so the order always follows a visible header.

ui-react adds `useVisibleSort`, a controlled sort for a bui `useTable` whose
default sort column can be hidden.
