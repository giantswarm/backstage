---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The workspace editor's blocked save names an empty Owner ("Choose an owner") and Provider ("Choose a provider") under the field and moves the focus there, opens Advanced options or the source that holds the problem, and asks for repositories only once the source has an owner. Leaving a field announces its error. Editing a workspace opens each source's repository table on its picks by name.
