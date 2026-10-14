---
'@giantswarm/backstage-plugin-gs-backend': patch
---

Fixes three bugs in skill edits through `POST /agent-skills/pull-request`:

- **No silent overwrites.** An update now replaces the SKILL.md from the commit the edit started from, and `baseCommit` is required for every update. If the default branch's file is no longer that version, the route refuses with 409 ("The skill changed since you started editing … Reload the skill") and creates no branch. Before this fix, an edit overwrote any change merged after it began. The file is checked at the resolved head commit, and the branch is created from that same commit.
- **Large skills can be edited.** The route accepts JSON bodies up to 1 MB, up from Express's 100 KB default. Instructions are still capped at 100,000 characters, but the request no longer fails with 413 before reaching that cap.
- **Skills whose name is not a lowercase slug can be edited.** An update may send the skill's existing name: the frontmatter `name`, or the directory name when there is none. A new skill's name must still be a slug, and an update can't rename a skill to a name that isn't one (422). The update branch is now `update-skill/<directory as a slug>` (`update-skill/<repository>` for a skill at the repository root). It is named after the directory, not the display name, so every name gives a valid branch and two skills with the same name don't share one.
