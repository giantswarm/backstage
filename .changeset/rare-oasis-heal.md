---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The workspace editor's blocked save names an empty Owner ("Choose an owner", or "Enter an owner" where the owner is typed), Provider ("Choose a provider") and Name ("Enter a name") under the field and moves the focus there, opens Advanced options or the source that holds the problem, and asks for repositories only once the source has an owner. Leaving a field announces its error. When the providers cannot be read or none is configured, a warning says why no source can be saved and takes the focus on a blocked save, instead of a provider error with no field. Editing a workspace opens each source's repository table on its picks by name.
