---
'@giantswarm/backstage-plugin-gs-backend': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

Skills are their whole directory now, not only `SKILL.md`: discovery lists every skill's files (GitHub from the tree it already reads, generic git from its checkout scan; a nested skill's files belong to it; at most 200 per skill, with `filesTruncated`), and each listed skill carries a `fileCount`. `GET /agent-skills/content` answers the list next to the instructions (`files`, `filesTruncated`), and the new `GET /agent-skills/content/file` answers one listed file of a skill at its commit — text up to 512 KB inline, binary and larger files as metadata only — immutably cached in the browser and in a size-capped server cache. A file outside the skill's list is never served. Generic-git repositories are answered from what the scan kept, not a clone per file. The agent-platform plugin gains the matching types (`SkillFile`, `SkillFileListing`, `SkillFileContent`, `DiscoveredSkill.fileCount`).
