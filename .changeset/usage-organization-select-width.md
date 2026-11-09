---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Usage: the Organization select keeps one width and cuts a long name short with
an ellipsis, so it no longer pushes the header's controls onto a second line;
the whole name is in a tooltip on hover and keyboard focus, and in the open
list. Every Organization label (the select, the Cost and Overview captions,
the By organization rows, the sessions list's Organization filter) names a
Giant Swarm organization's `org-<name>` namespace by the organization's name
and other namespaces as they are, without a `namespace` prefix; two that read
the same show their namespace. Across the Agent Platform, a select's option
names wrap instead of being cut short where the screen is too narrow.
