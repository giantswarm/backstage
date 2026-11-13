---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The workspace editor's blocked save names an empty Owner ("Choose an owner", or "Enter an owner" where the owner is typed), Provider ("Choose a provider") and Name ("Enter a name") under the field and moves the focus there, opens Advanced options or the source that holds the problem, and asks for repositories only once the source has an owner. The Owner and Provider selects say "Choose an owner" and "Choose a provider" before a choice, and an empty Including filter reads "Including: none". Leaving a field announces its error. A save the manager refuses moves the focus to the field it names, or announces the refusal when it names none. When the providers cannot be read or none is configured and a source has no provider, a warning says why it cannot be saved and takes the focus on a blocked save, instead of a provider error with no field. Editing a workspace opens each source's repository table on its picks by name.

Unticking a repository in the selected-only view excludes it from filters too, and re-including an excluded repository explicitly selects it. The table names its columns and keeps keyboard focus on a remaining row or the view switch when empty. Provider errors show their raw messages under Technical details.
