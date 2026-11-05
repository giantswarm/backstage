---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

Links to Git repositories open in a new tab with the external link icon, and
say "(opens in a new tab)" to a screen reader: the Repository column of a
workspace's Repositories tab and of the toolchain Sources table, a toolchain's
Source, a skill's Source and Latest commit, and the repository named where an
agent is defined outside agent-manager's directory.

`ui-react` adds `ExternalCellText`, bui's `CellText` for a link that leaves the
app, and an `inline` display for `ExternalLink`, for a link in running text
that wraps with the sentence.
