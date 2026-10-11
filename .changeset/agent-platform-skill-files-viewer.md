---
'@giantswarm/backstage-plugin-agent-platform': minor
---

A skill's detail page shows all of its files, not only SKILL.md. On the Instructions tab, a skill with more files than its SKILL.md gets a file tree next to a viewer. On a phone, the tree folds into a "Files (N)" section above the viewer. The viewer renders Markdown with the same sanitising renderer as the instructions, shows code, YAML, JSON and scripts in monospace, and previews CSV/TSV files as a table capped at 50 rows. Binary files and files over 512 KB link to the file on GitHub at the pinned commit; outside github.com the viewer gives their path and size. The selected file is part of the page address (`?file=`). Relative links in a rendered file, and backticked paths that exactly name one of the skill's files, open that file in the viewer. Paths outside the skill keep their GitHub links. A listing cut at 200 files says so. The header adds "· N more files". Single-file skills look the same as before.
