---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': patch
---

The sessions lists (Sessions, and an agent's Sessions tab) keep their headers, states and times whole: State, Environment and Last active have fixed widths and stay on one line, and in a narrower window the list leaves out Environment, then Workspace, naming them under the session's title, before it shows its stacked rows, as at phone width. New in ui-react: `useWidthTier`, one measurement for several layout steps.
