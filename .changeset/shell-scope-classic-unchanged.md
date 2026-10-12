---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-muster': patch
---

Classic pages keep their pre-shell `InfoHint` and `FactList` behavior. The press-to-open popover, the larger hit area and the 600px stack point now apply only inside the agent-platform shell, which marks its pages with the new `ShellScopeProvider`. Markdown tables in `GSMarkdownContent` and the session timeline scroll instead of breaking words mid-word in their cells. The shell flag is read once per app load (`isAgentShellOn`), so the shell's pages and chrome always agree.
