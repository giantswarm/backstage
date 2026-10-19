---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Agent detail, **Update all skills to latest**: when agent-manager cannot open the pull request because the agent's HelmRelease is not in the file it edits, the dialog now says so as information under the skills table, where the loading line was: "Skills cannot be updated here", what to do in plain words, and the HelmRelease, file and repository in smaller text after it. The dialog then offers only **Close** instead of a disabled **Open pull request**, and its title no longer asks a question. A skill that moves has a copy button for its full head commit, for pinning it by hand.
